import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT,
  CRT_MOBILE_MAX_WIDTH, CRT_SCANLINE_INTENSITY, CRT_DISTORTION, CRT_BLOOM_THRESHOLD, CRT_BLOOM_STRENGTH,
} from '../constants.js';

/** Off by default on a mobile-width viewport, per plan.md §10. Pure so the
 * threshold logic is testable without a real window/canvas. */
export function crtDefaultEnabled(viewportWidth: number, mobileMaxWidth: number = CRT_MOBILE_MAX_WIDTH): boolean {
  return viewportWidth > mobileMaxWidth;
}

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Scanlines run one dark/light cycle per source row (textureSize, not the
// output resolution), so the density is correct however large #crt is scaled.
// Bloom is a cheap single-pass approximation: bright neighbouring texels bleed
// in rather than a real multi-pass gaussian blur — good enough for a retro
// CRT glow without a second framebuffer.
const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrame;
uniform float uScanlineIntensity;
uniform float uDistortion;
uniform float uBloomThreshold;
uniform float uBloomStrength;

void main() {
  vec2 c = vUv - 0.5;
  vec2 uv = vUv + c * dot(c, c) * uDistortion;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 color = texture(uFrame, uv).rgb;

  vec2 texel = 1.0 / vec2(textureSize(uFrame, 0));
  vec3 neighbours = texture(uFrame, uv + vec2(texel.x, 0.0)).rgb
    + texture(uFrame, uv - vec2(texel.x, 0.0)).rgb
    + texture(uFrame, uv + vec2(0.0, texel.y)).rgb
    + texture(uFrame, uv - vec2(0.0, texel.y)).rgb;
  neighbours *= 0.25;
  float bloomLuma = dot(neighbours, vec3(0.299, 0.587, 0.114));
  color += max(0.0, bloomLuma - uBloomThreshold) * uBloomStrength;

  float rows = float(textureSize(uFrame, 0).y);
  float scan = 0.5 + 0.5 * sin(uv.y * rows * 3.14159265);
  color *= 1.0 - uScanlineIntensity * (1.0 - scan);

  outColor = vec4(color, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${info ?? 'unknown error'}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${info ?? 'unknown error'}`);
  }
  return program;
}

interface Uniforms {
  uFrame: WebGLUniformLocation | null;
  uScanlineIntensity: WebGLUniformLocation | null;
  uDistortion: WebGLUniformLocation | null;
  uBloomThreshold: WebGLUniformLocation | null;
  uBloomStrength: WebGLUniformLocation | null;
}

interface CrtSettings {
  scanline: boolean;
  aberration: boolean;
  bloom: number;
}

/**
 * WebGL2 post-pass (spec §7). Sits strictly after the existing render path:
 * `Canvas2DBackend` draws the game exactly as it always has, into its own
 * offscreen buffer (`Canvas2DBackend.surface`); this class reads that buffer
 * as a texture and draws a shaded copy into a SEPARATE canvas element (`#crt`
 * — a canvas can only ever have one context type for its lifetime, so this
 * cannot share `#game`'s 2D context). main.ts toggles which of the two
 * canvases is visible; `RenderBackend`/`Canvas2DBackend`/`Renderer` never
 * know this class exists.
 *
 * Never throws. Any failure — no WebGL2, a driver that rejects the shader —
 * leaves `supported` false and every method a no-op; the game already renders
 * the plain Canvas2D path to `#game` regardless of this class's state.
 */
export class CrtEffect {
  private ok = false;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private uniforms: Uniforms | null = null;
  private scale = 1;
  private settings: CrtSettings = { scanline: true, aberration: true, bloom: CRT_BLOOM_STRENGTH };

  constructor(private readonly canvas: HTMLCanvasElement) {
    try {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
      if (!gl) return; // no WebGL2 in this browser: stays fully inert

      const program = linkProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
      const uniforms: Uniforms = {
        uFrame: gl.getUniformLocation(program, 'uFrame'),
        uScanlineIntensity: gl.getUniformLocation(program, 'uScanlineIntensity'),
        uDistortion: gl.getUniformLocation(program, 'uDistortion'),
        uBloomThreshold: gl.getUniformLocation(program, 'uBloomThreshold'),
        uBloomStrength: gl.getUniformLocation(program, 'uBloomStrength'),
      };

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Canvas pixel data is stored top-down; WebGL's texture V=0 is
      // conventionally the bottom of the image. Without this, every upload
      // renders the whole frame upside down.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.gl = gl;
      this.program = program;
      this.uniforms = uniforms;
      this.texture = texture;
      this.ok = true;
    } catch (err) {
      console.error('[crt] setup failed, CRT post-pass disabled:', err);
      this.gl = null;
      this.ok = false;
    }
  }

  get supported(): boolean {
    return this.ok;
  }

  getSettings(): CrtSettings {
    return { ...this.settings };
  }

  setSettings(next: Partial<CrtSettings>): void {
    if (next.scanline !== undefined) this.settings.scanline = next.scanline;
    if (next.aberration !== undefined) this.settings.aberration = next.aberration;
    if (next.bloom !== undefined) this.settings.bloom = Math.max(0, Math.min(1, next.bloom));
  }

  /** Match Canvas2DBackend's integer-scale rule so the two canvases stay
   * pixel-for-pixel comparable when main.ts swaps which one is visible. */
  resize(cssWidth: number, cssHeight: number): void {
    if (!this.ok || !this.gl) return;
    const fit = Math.min(cssWidth / LOGICAL_WIDTH, cssHeight / LOGICAL_HEIGHT);
    this.scale = Math.max(1, Math.floor(fit));
    this.canvas.width = LOGICAL_WIDTH * this.scale;
    this.canvas.height = LOGICAL_HEIGHT * this.scale;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Upload `source` (the game's offscreen Canvas2D buffer) as a texture and
   * draw the shaded result to this effect's own canvas. */
  render(source: CanvasImageSource): void {
    const gl = this.gl;
    if (!this.ok || !gl || !this.program || !this.uniforms) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.uFrame, 0);
    gl.uniform1f(this.uniforms.uScanlineIntensity, this.settings.scanline ? CRT_SCANLINE_INTENSITY : 0);
    gl.uniform1f(this.uniforms.uDistortion, this.settings.aberration ? CRT_DISTORTION : 0);
    gl.uniform1f(this.uniforms.uBloomThreshold, CRT_BLOOM_THRESHOLD);
    gl.uniform1f(this.uniforms.uBloomStrength, this.settings.bloom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
