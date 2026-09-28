import * as THREE from 'three';
import palette from '../../assets/palette.json';

/**
 * The "feel" layer: pooled particles (drift smoke, off-road dust, contact
 * sparks), camera shake, and boost speed lines. View-only — it reads sim
 * state and never writes it. Every buffer is allocated up front; `update`
 * allocates nothing. Shake and speed lines honour prefers-reduced-motion.
 */
export const JUICE = {
  particles: true,
  shake: true,
  hitStop: true,
  speedLines: true,
  /** Camera shake metres per m/s of impact. */
  shakePerImpact: 0.035,
  shakeMax: 0.6,
  shakeDecay: 9,
  /** Impacts at least this hard (m/s closing) freeze the game briefly. */
  hitStopImpact: 6,
  hitStopTicks: 4,
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const MAX_PARTICLES = 384;

export const PARTICLE_COLORS = {
  smoke: new THREE.Color(palette.chrome[2]!),
  dust: new THREE.Color(palette.sky.canyon[4]!),
  spark: new THREE.Color(palette.ui.gold),
} as const;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(MAX_PARTICLES * 3);
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly grow = new Float32Array(MAX_PARTICLES);
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Cheap deterministic-enough jitter; view-only, so it need not match the sim. */
  private seed = 1234567;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    for (let i = 0; i < MAX_PARTICLES; i++) this.mesh.setMatrixAt(i, this.hidden);
  }

  rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, color: THREE.Color): void {
    if (!JUICE.particles) return;
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = this.life[i]! - dt;
      if (this.life[i]! <= 0) {
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] = this.vel[k + 1]! - 4 * dt * (this.grow[i]! < 0 ? 1 : 0); // sparks fall, smoke drifts
      this.pos[k] = this.pos[k]! + this.vel[k]! * dt;
      this.pos[k + 1] = Math.max(0.05, this.pos[k + 1]! + this.vel[k + 1]! * dt);
      this.pos[k + 2] = this.pos[k + 2]! + this.vel[k + 2]! * dt;
      const t = 1 - this.life[i]! / this.maxLife[i]!;
      const s = Math.max(0.01, this.size[i]! * (1 + this.grow[i]! * t));
      this.m.makeScale(s, s, s).setPosition(this.pos[k]!, this.pos[k + 1]!, this.pos[k + 2]!);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Streaks at the edge of vision while boosting: children of the camera, rushing past. */
export class SpeedLines {
  readonly group = new THREE.Group();
  private readonly lines: THREE.Mesh[] = [];
  private readonly z: Float32Array;

  constructor(count = 14) {
    const mat = new THREE.MeshBasicMaterial({ color: palette.ui.white, fog: false, depthTest: false });
    const geo = new THREE.BoxGeometry(0.02, 0.02, 1.6);
    this.z = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / count) * Math.PI * 2;
      m.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.05, 0);
      m.renderOrder = 10;
      this.z[i] = -2 - (i % 5) * 1.3;
      this.lines.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  update(active: boolean, dt: number): void {
    this.group.visible = active && JUICE.speedLines;
    if (!this.group.visible) return;
    for (let i = 0; i < this.lines.length; i++) {
      let z = this.z[i]! + 40 * dt;
      if (z > -0.5) z -= 7;
      this.z[i] = z;
      this.lines[i]!.position.z = z;
    }
  }
}

/** Decaying random camera offset. */
export class Shake {
  amount = 0;
  readonly offset = new THREE.Vector3();

  kick(impact: number): void {
    if (!JUICE.shake) return;
    this.amount = Math.min(JUICE.shakeMax, this.amount + impact * JUICE.shakePerImpact);
  }

  update(dt: number, rng: { rand(): number }): THREE.Vector3 {
    this.amount *= Math.exp(-JUICE.shakeDecay * dt);
    if (this.amount < 0.002) {
      this.amount = 0;
      return this.offset.set(0, 0, 0);
    }
    return this.offset.set((rng.rand() - 0.5) * 2 * this.amount, (rng.rand() - 0.5) * 2 * this.amount, 0);
  }
}
