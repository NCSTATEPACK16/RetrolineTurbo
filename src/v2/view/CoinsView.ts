import * as THREE from 'three';
import palette from '../../assets/palette.json';
import type { CoinState } from '../sim/coins.js';
import { poseAt, type Centerline, type Pose } from './centerline.js';

/** Spinning gold coins on the tarmac (hidden while respawning). One instanced mesh; allocation-free per frame. */
export class CoinsView {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private spin = 0;

  constructor(private readonly coins: CoinState, center: Centerline) {
    const geo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
    geo.rotateX(Math.PI / 2); // stand the disc up
    const mat = new THREE.MeshLambertMaterial({ color: palette.ui.gold, emissive: palette.sky.sunset[4]!, emissiveIntensity: 0.35 });
    const n = coins.s.length;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(n * 3);
    const pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };
    for (let i = 0; i < n; i++) {
      poseAt(center, coins.s[i]!, coins.x[i]!, pose);
      this.pos[i * 3] = pose.x; this.pos[i * 3 + 1] = pose.y + 0.8; this.pos[i * 3 + 2] = pose.z;
    }
  }

  update(dt: number): void {
    this.spin += dt * 4;
    this.q.setFromAxisAngle(this.up, this.spin);
    for (let i = 0; i < this.mesh.count; i++) {
      this.p.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
      this.m.compose(this.p, this.q, this.coins.respawn[i]! > 0 ? this.zero : this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
