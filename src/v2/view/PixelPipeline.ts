import * as THREE from 'three';
import { masterPalette, BAYER4, MAX_PALETTE } from './palette.js';

/** Ordered-dither strength in sRGB units: enough to band fog and lit ramps, not to fizz flat colour. */
export const DITHER_SPREAD = 0.07;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Mirrors palette.ts#quantise line for line (that version is the unit-tested reference).
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform vec3 uPalette[${MAX_PALETTE}];
  uniform int uCount;
  uniform float uBayer[16];
  uniform float uSpread;
  uniform bool uEnabled;
  varying vec2 vUv;

  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    vec3 c = toSRGB(texture2D(tScene, vUv).rgb);
    if (!uEnabled) { gl_FragColor = vec4(c, 1.0); return; }
    ivec2 p = ivec2(gl_FragCoord.xy);
    int idx = (p.y - (p.y / 4) * 4) * 4 + (p.x - (p.x / 4) * 4);
    float d = 0.0;
    for (int i = 0; i < 16; i++) if (i == idx) d = uBayer[i];
    c += d * uSpread;
    vec3 best = uPalette[0];
    float bestD = 1e9;
    for (int i = 0; i < ${MAX_PALETTE}; i++) {
      if (i >= uCount) break;
      vec3 q = c - uPalette[i];
      float dist = dot(q * q, vec3(0.3, 0.59, 0.11));
      if (dist < bestD) { bestD = dist; best = uPalette[i]; }
    }
    gl_FragColor = vec4(best, 1.0);
  }
`;

/**
 * Renders the scene into a low-res target with nearest filtering, then runs a
 * full-screen pass that clamps every pixel to the master palette with ordered
 * dithering. The canvas itself stays at the internal resolution; CSS does the
 * whole-number upscale, so pixels stay square and crisp.
 */
export class PixelPipeline {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    const pal = masterPalette();
    const colors = Array.from({ length: MAX_PALETTE }, (_, i) => {
      const c = pal[i] ?? pal[0]!;
      return new THREE.Vector3(c[0], c[1], c[2]);
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uPalette: { value: colors },
        uCount: { value: pal.length },
        uBayer: { value: BAYER4 },
        uSpread: { value: DITHER_SPREAD },
        uEnabled: { value: true },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  get paletteEnabled(): boolean {
    return this.material.uniforms.uEnabled!.value as boolean;
  }

  set paletteEnabled(on: boolean) {
    this.material.uniforms.uEnabled!.value = on;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.postScene, this.postCamera);
  }
}
