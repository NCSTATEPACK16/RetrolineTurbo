import * as THREE from 'three';
import palette from '../../assets/palette.json';
import { curvatureAt, halfWidthAt, type SimTrack } from '../sim/track.js';
import { driftTier } from '../sim/car.js';
import type { SimWorld } from '../sim/world.js';
import { CHASE_TUNING, crestSafeHeight, initialChaseState, updateChase, type ChaseInput } from './chaseRig.js';
import { buildCenterline, poseAt, type Centerline, type Pose } from './centerline.js';
import { PixelPipeline } from './PixelPipeline.js';
import { CrtOverlay } from './crt.js';
import { Scenery, Horizon, pixelTexture, type HorizonTheme } from './Scenery.js';
import { HORIZONS, PROPS_ATLAS, SCENERY_KINDS } from './sprites.js';
import { placeScenery } from '../track/scenery.js';
import type { CircuitLayout } from '../track/schema.js';

/** Textures a race scene needs; the browser loads them, headless tests pass blanks. */
export interface SceneTextures { props: THREE.Texture; horizon: THREE.Texture }

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

interface CarRig {
  group: THREE.Group;
  /** Everything that tilts and hops (the body), under the ground-level group. */
  body: THREE.Group;
  sparks: THREE.Mesh[];
  flame: THREE.Mesh;
}

/** Mini-turbo spark colours per tier (blue, orange, purple), from the master palette. */
const TIER_COLORS = [palette.body.blue[3]!, palette.sky.sunset[4]!, palette.sky.canyon[2]!].map((c) => new THREE.Color(c));

function buildCar(color: string): CarRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), new THREE.MeshLambertMaterial({ color }));
  shell.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), new THREE.MeshLambertMaterial({ color: palette.chrome[0]! }));
  cabin.position.set(0, 1.05, 0.3);
  body.add(shell, cabin);
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.6, 0.8);
  const wheelMat = new THREE.MeshLambertMaterial({ color: palette.outline });
  for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]] as const) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.3, z);
    body.add(w);
  }
  const sparkGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const sparks = [-1, 1].map((side) => {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: TIER_COLORS[0]!, fog: false }));
    m.position.set(side * 1.05, 0.2, 2.1);
    m.visible = false;
    body.add(m);
    return m;
  });
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), new THREE.MeshBasicMaterial({ color: palette.ui.gold, fog: false }));
  flame.position.set(0, 0.5, 2.55);
  flame.visible = false;
  body.add(flame);
  return { group, body, sparks, flame };
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
  private readonly cars: CarRig[] = [];
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly look = new THREE.Vector3();
  private readonly scenery: Scenery;
  private readonly chase = initialChaseState();
  private readonly chaseIn: ChaseInput = { curvature: 0, speed: 0, topSpeed: 1, boosting: false, drifting: false };
  private readonly crestYs = new Float32Array(3);
  private readonly horizon: Horizon;

  constructor(private readonly track: SimTrack, layout: CircuitLayout, carCount: number, textures: SceneTextures) {
    const theme = HORIZONS[(layout.theme in HORIZONS ? layout.theme : 'sunset') as HorizonTheme];
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(theme.haze), 220, 800);

    this.center = buildCenterline(track, 1);
    this.scene.add(buildRoad(track, this.center));
    this.scenery = new Scenery(placeScenery(track, layout, SCENERY_KINDS), this.center, textures.props);
    this.scene.add(this.scenery.group);
    this.horizon = new Horizon(textures.horizon, theme.aspect);
    this.scene.add(this.horizon.mesh);
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

    const bodyColors = [
      palette.body.red[2]!, palette.body.blue[2]!, palette.ui.gold, palette.ui.magenta,
      palette.ui.cyan, palette.foliage[2]!, palette.sky.canyon[1]!, palette.chrome[3]!,
    ];
    for (let i = 0; i < carCount; i++) {
      const car = buildCar(bodyColors[i % bodyColors.length]!);
      this.cars.push(car);
      this.scene.add(car.group);
    }
  }

  /** Pose everything `alpha` of the way from `prev` to `curr`; `dt` is real seconds since the last frame (camera easing). */
  sync(prev: SimWorld, curr: SimWorld, alpha: number, dt: number): void {
    const L = this.track.length;
    for (let i = 0; i < this.cars.length; i++) {
      const a = prev.cars[i]!;
      const b = curr.cars[i]!;
      let ds = b.s - a.s;
      if (ds < -L / 2) ds += L; // crossed the start line this tick
      const s = a.s + ds * alpha;
      const x = a.x + (b.x - a.x) * alpha;
      poseAt(this.center, s, x, this.pose);
      const rig = this.cars[i]!;
      rig.group.position.set(this.pose.x, this.pose.y, this.pose.z);
      rig.group.rotation.y = -this.pose.heading;
      // Drift reads as a slide: nose tucked into the turn, a hop on entry, sparks by tier, flame on boost.
      rig.body.rotation.y = -b.drift * 0.38;
      rig.body.position.y = b.hop > 0 ? Math.sin((b.hop / 0.22) * Math.PI) * 0.45 : 0;
      const tier = b.drift !== 0 ? driftTier(b.driftCharge, curr.tuning) : 0;
      const flicker = (curr.tick & 2) === 0 ? 1 : 0.6;
      for (const sp of rig.sparks) {
        sp.visible = tier > 0;
        if (tier > 0) {
          (sp.material as THREE.MeshBasicMaterial).color.copy(TIER_COLORS[tier - 1]!);
          sp.scale.setScalar(flicker * (0.7 + tier * 0.3));
        }
      }
      rig.flame.visible = b.boostTime > 0;
      rig.flame.scale.z = flicker * 1.4;
      if (i === 0) {
        this.chaseIn.topSpeed = curr.params[0]!.topSpeed;
        this.placeCamera(s, x, a.steer + (b.steer - a.steer) * alpha, a.speed + (b.speed - a.speed) * alpha, b, dt);
      }
    }
    this.camera.updateMatrixWorld();
    this.scenery.update(this.camera);
    this.horizon.update(this.camera);
    this.scene.updateMatrixWorld();
  }

  /** Low Top Gear-style chase camera: rolls into turns, widens on speed/boost, pulls in on drifts, clears crests. */
  private placeCamera(s: number, x: number, steer: number, speed: number, car: { boostTime: number; drift: number }, dt: number): void {
    const t = CHASE_TUNING;
    const inp = this.chaseIn;
    inp.curvature = curvatureAt(this.track, ((s % this.track.length) + this.track.length) % this.track.length);
    inp.speed = speed;
    inp.boosting = car.boostTime > 0;
    inp.drifting = car.drift !== 0;
    const st = updateChase(this.chase, inp, dt);
    const back = t.distance - st.zoom;
    for (let k = 0; k < 3; k++) this.crestYs[k] = poseAt(this.center, s - back * (k / 3), x, this.pose).y;
    poseAt(this.center, s - back, x * 0.85, this.pose);
    const camY = crestSafeHeight(this.pose.y, this.crestYs);
    this.camera.position.set(this.pose.x, camY, this.pose.z);
    poseAt(this.center, s + t.lookAhead, x * 0.7 + steer * 0.6, this.pose);
    this.look.set(this.pose.x, this.pose.y + t.lookHeight, this.pose.z);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(-st.roll);
    if (Math.abs(this.camera.fov - st.fov) > 0.01) {
      this.camera.fov = st.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

/** The browser edge: owns the canvas, WebGL renderer, pixel pipeline and CRT overlay. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly race: RaceScene;
  readonly pixels = new PixelPipeline();
  readonly crt: CrtOverlay;
  width = 0;
  height = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement, crtEl: HTMLElement, track: SimTrack, layout: CircuitLayout, carCount: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    const loader = new THREE.TextureLoader();
    const theme = HORIZONS[(layout.theme in HORIZONS ? layout.theme : 'sunset') as HorizonTheme];
    this.race = new RaceScene(track, layout, carCount, {
      props: pixelTexture(PROPS_ATLAS.url, loader),
      horizon: pixelTexture(theme.url, loader),
    });
    this.crt = new CrtOverlay(crtEl);
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
    this.pixels.setSize(width, height);
    const k = integerScale(vw, vh, width, height);
    this.canvas.style.width = `${width * k}px`;
    this.canvas.style.height = `${height * k}px`;
    this.crt.fit(width * k, height * k, k);
    this.race.camera.aspect = width / height;
    this.race.camera.updateProjectionMatrix();
  }

  render(prev: SimWorld, curr: SimWorld, alpha: number, dt: number): void {
    this.race.sync(prev, curr, alpha, dt);
    this.pixels.render(this.renderer, this.race.scene, this.race.camera);
  }
}
