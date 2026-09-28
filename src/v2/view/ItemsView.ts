import * as THREE from 'three';
import palette from '../../assets/palette.json';
import type { ItemState } from '../sim/items.js';
import { wrapS, type SimTrack } from '../sim/track.js';
import type { SimWorld } from '../sim/world.js';
import { poseAt, type Centerline, type Pose } from './centerline.js';

/**
 * Items in the world: spinning ? boxes (hidden while respawning), oil slicks
 * on the tarmac, seekers streaking up the track, and shield bubbles. Reads the
 * sim's ItemState; pools everything; allocation-free per frame.
 */
const SEEKER_COLOR = palette.ui.cyan;

export class ItemsView {
  readonly group = new THREE.Group();
  private readonly boxes: THREE.Mesh[] = [];
  private readonly slicks: THREE.Mesh[] = [];
  private readonly seekers: THREE.Mesh[] = [];
  private readonly shields: THREE.Mesh[] = [];
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };
  private spinAngle = 0;

  constructor(private readonly items: ItemState, private readonly center: Centerline, private readonly track: SimTrack, carCount: number) {
    const boxGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const boxMats = [palette.ui.magenta, palette.ui.cyan, palette.ui.gold].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    items.boxes.forEach((b, i) => {
      const m = new THREE.Mesh(boxGeo, boxMats[i % boxMats.length]!);
      poseAt(center, b.s, b.x, this.pose);
      m.position.set(this.pose.x, this.pose.y + 1.1, this.pose.z);
      this.boxes.push(m);
      this.group.add(m);
    });
    const slickGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.04, 10);
    const slickMat = new THREE.MeshBasicMaterial({ color: palette.outline });
    for (let i = 0; i < items.hazards.length; i++) {
      const m = new THREE.Mesh(slickGeo, slickMat);
      m.visible = false;
      this.slicks.push(m);
      this.group.add(m);
    }
    const seekGeo = new THREE.OctahedronGeometry(0.7);
    const seekMat = new THREE.MeshBasicMaterial({ color: SEEKER_COLOR, fog: false });
    for (let i = 0; i < items.seekers.length; i++) {
      const m = new THREE.Mesh(seekGeo, seekMat);
      m.visible = false;
      this.seekers.push(m);
      this.group.add(m);
    }
    const shieldGeo = new THREE.SphereGeometry(2.6, 10, 6);
    const shieldMat = new THREE.MeshBasicMaterial({ color: palette.ui.cyan, wireframe: true, fog: false });
    for (let i = 0; i < carCount; i++) {
      const m = new THREE.Mesh(shieldGeo, shieldMat);
      m.visible = false;
      this.shields.push(m);
      this.group.add(m);
    }
  }

  /** `cars` are the car groups (shields hang on them; spin-outs whirl their bodies). */
  update(dt: number, cars: readonly THREE.Object3D[], world: SimWorld): void {
    this.spinAngle += dt * 2.2;
    const st = this.items;
    for (let i = 0; i < this.boxes.length; i++) {
      const m = this.boxes[i]!;
      m.visible = st.boxes[i]!.respawn <= 0;
      m.rotation.set(this.spinAngle * 0.6, this.spinAngle, 0);
    }
    for (let i = 0; i < this.slicks.length; i++) {
      const h = st.hazards[i]!;
      const m = this.slicks[i]!;
      m.visible = h.active;
      if (h.active) {
        poseAt(this.center, h.s, h.x, this.pose);
        m.position.set(this.pose.x, this.pose.y + 0.03, this.pose.z);
      }
    }
    for (let i = 0; i < this.seekers.length; i++) {
      const sk = st.seekers[i]!;
      const m = this.seekers[i]!;
      m.visible = sk.active;
      if (sk.active) {
        // Race distance folds onto the lap; it flies down the target's lane.
        poseAt(this.center, wrapS(this.track, sk.distance), world.cars[sk.target]!.x, this.pose);
        m.position.set(this.pose.x, this.pose.y + 1.5, this.pose.z);
        m.rotation.y = this.spinAngle * 6;
      }
    }
    for (let i = 0; i < this.shields.length; i++) {
      const m = this.shields[i]!;
      m.visible = st.shield[i]! > 0;
      if (m.visible) {
        m.position.copy(cars[i]!.position);
        m.position.y += 0.9;
        m.rotation.y = this.spinAngle;
      }
    }
    for (let i = 0; i < cars.length; i++) {
      // Spin-outs: whirl the car body round (the sim has already taken control away).
      const body = cars[i]!.children[0];
      if (body && st.spin[i]! > 0) body.rotation.y += dt * 14;
    }
  }
}
