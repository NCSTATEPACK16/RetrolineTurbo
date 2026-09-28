import * as THREE from 'three';
import palette from '../../assets/palette.json';
import { halfWidthAt, type SimTrack } from '../sim/track.js';
import type { SimWorld } from '../sim/world.js';
import { buildCenterline, poseAt, type Centerline, type Pose } from './centerline.js';

/** Internal render height: 240 lines, the "widescreen SNES" target (PRD section 10). */
export const INTERNAL_HEIGHT = 240;

/** Low-res target size for a display aspect ratio: 240 lines, 320 (4:3) to 427 (16:9) wide. */
export function internalResolution(aspect: number): { width: number; height: number } {
  const w = Math.round(INTERNAL_HEIGHT * aspect);
  return { width: Math.min(427, Math.max(320, w)), height: INTERNAL_HEIGHT };
}

/** Largest whole-number upscale of the internal target that fits the viewport (at least 1). */
export function integerScale(viewW: number, viewH: number, w: number, h: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / w, viewH / h)));
}

const KERB_WIDTH = 1.2;
const VERGE_WIDTH = 6;
const BAND_M = 4;

function buildRoad(track: SimTrack, c: Centerline): THREE.Mesh {
  // Lateral strips, measured from the road edge (so they follow width changes),
  // and the colour pair each alternates between band to band.
  const cA = new THREE.Color(palette.road.surfaceA);
  const cB = new THREE.Color(palette.road.surfaceB);
  const kR = new THREE.Color(palette.kerb.red);
  const kW = new THREE.Color(palette.kerb.white);
  const vA = new THREE.Color(palette.road.shoulder);
  const vB = new THREE.Color(palette.foliage[0]!);
  // [inner, outer] as (edgeMultiplier, extraMetres): lateral = side * (hw * m + extra).
  const strips: [number, number, number, number, THREE.Color, THREE.Color][] = [
    [-1, KERB_WIDTH + VERGE_WIDTH, -1, KERB_WIDTH, vB, vA],
    [-1, KERB_WIDTH, -1, 0, kR, kW],
    [-1, 0, 1, 0, cA, cB],
    [1, 0, 1, KERB_WIDTH, kR, kW],
    [1, KERB_WIDTH, 1, KERB_WIDTH + VERGE_WIDTH, vB, vA],
  ];
  const lat = (hw: number, m: number, extra: number): number => m * hw + Math.sign(m) * extra;

  const quads = c.count * strips.length;
  const positions = new Float32Array(quads * 6 * 3);
  const colors = new Float32Array(quads * 6 * 3);
  const p0: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  const p1: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  const p2: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  const p3: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  let v = 0;
  const put = (p: Pose, col: THREE.Color): void => {
    positions[v * 3] = p.x; positions[v * 3 + 1] = p.y; positions[v * 3 + 2] = p.z;
    colors[v * 3] = col.r; colors[v * 3 + 1] = col.g; colors[v * 3 + 2] = col.b;
    v++;
  };
  for (let i = 0; i < c.count; i++) {
    const s0 = i * c.step;
    const s1 = Math.min(s0 + c.step, track.length);
    const hw0 = halfWidthAt(track, s0);
    const hw1 = halfWidthAt(track, s1 % track.length);
    const band = Math.floor(s0 / BAND_M) & 1;
    for (const [lm, le, rm, re, a, b] of strips) {
      const col = band ? a : b;
      poseAt(c, s0, lat(hw0, lm, le), p0); poseAt(c, s0, lat(hw0, rm, re), p1);
      poseAt(c, s1, lat(hw1, lm, le), p2); poseAt(c, s1, lat(hw1, rm, re), p3);
      // Two CCW triangles seen from above (+Y).
      put(p0, col); put(p1, col); put(p2, col);
      put(p1, col); put(p3, col); put(p2, col);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function buildCar(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), new THREE.MeshLambertMaterial({ color: palette.chrome[0]! }));
  cabin.position.set(0, 1.05, 0.3);
  g.add(body, cabin);
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.6, 0.8);
  const wheelMat = new THREE.MeshLambertMaterial({ color: palette.outline });
  for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]] as const) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.3, z);
    g.add(w);
  }
  return g;
}

/**
 * The race's three.js scene graph and camera, with no renderer and no DOM, so
 * the per-frame sync can be benchmarked headlessly (see perf/budget.test.ts).
 * It reads two sim snapshots and blends them; it never writes sim state, and
 * `sync` allocates nothing.
 */
export class RaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
  private readonly center: Centerline;
  private readonly cars: THREE.Group[] = [];
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly look = new THREE.Vector3();

  constructor(private readonly track: SimTrack, carCount: number) {
    const sky = new THREE.Color(palette.sky.sunset[4]!);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 180, 700);

    this.center = buildCenterline(track, 1);
    this.scene.add(buildRoad(track, this.center));
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshBasicMaterial({ color: palette.foliage[1]! }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    this.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x404050, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun);

    const bodyColors = [palette.body.red[2]!, palette.body.blue[2]!];
    for (let i = 0; i < carCount; i++) {
      const car = buildCar(bodyColors[i % bodyColors.length]!);
      this.cars.push(car);
      this.scene.add(car);
    }
  }

  /** Pose everything `alpha` of the way from `prev` to `curr`. */
  sync(prev: SimWorld, curr: SimWorld, alpha: number): void {
    const L = this.track.length;
    for (let i = 0; i < this.cars.length; i++) {
      const a = prev.cars[i]!;
      const b = curr.cars[i]!;
      let ds = b.s - a.s;
      if (ds < -L / 2) ds += L; // crossed the start line this tick
      const s = a.s + ds * alpha;
      const x = a.x + (b.x - a.x) * alpha;
      poseAt(this.center, s, x, this.pose);
      const g = this.cars[i]!;
      g.position.set(this.pose.x, this.pose.y, this.pose.z);
      g.rotation.y = -this.pose.heading;

      if (i === 0) {
        // Low Top Gear-style chase camera; roll/FOV/zoom feel lands in v2-06.
        const steer = a.steer + (b.steer - a.steer) * alpha;
        poseAt(this.center, s - 7.5, x * 0.85, this.pose);
        this.camera.position.set(this.pose.x, this.pose.y + 2.6, this.pose.z);
        poseAt(this.center, s + 14, x * 0.7 + steer * 0.6, this.pose);
        this.look.set(this.pose.x, this.pose.y + 0.9, this.pose.z);
        this.camera.lookAt(this.look);
      }
    }
    this.scene.updateMatrixWorld();
  }
}

/** The browser edge: owns the canvas and WebGL renderer, and draws a {@link RaceScene}. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly race: RaceScene;
  width = 0;
  height = 0;

  constructor(private readonly canvas: HTMLCanvasElement, track: SimTrack, carCount: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.race = new RaceScene(track, carCount);
    this.resize();
  }

  /** Fit the low-res target to the window at the largest whole-number scale. */
  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { width, height } = internalResolution(vw / vh);
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const k = integerScale(vw, vh, width, height);
    this.canvas.style.width = `${width * k}px`;
    this.canvas.style.height = `${height * k}px`;
    this.race.camera.aspect = width / height;
    this.race.camera.updateProjectionMatrix();
  }

  render(prev: SimWorld, curr: SimWorld, alpha: number): void {
    this.race.sync(prev, curr, alpha);
    this.renderer.render(this.race.scene, this.race.camera);
  }
}
