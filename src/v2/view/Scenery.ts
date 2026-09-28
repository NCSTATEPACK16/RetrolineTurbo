import * as THREE from 'three';
import type { SceneryPlacement } from '../track/scenery.js';
import { poseAt, type Centerline, type Pose } from './centerline.js';
import { PROPS_ATLAS, SCENERY_ART, HORIZONS } from './sprites.js';

/**
 * Roadside scenery as camera-facing billboards: one InstancedMesh per sprite
 * kind (a handful of draw calls for the whole lap). Each frame every instance
 * turns about its vertical axis to face the camera — the classic pseudo-3D
 * sprite read, without the lean a fully camera-aligned sprite gets on hills.
 * All scratch objects are preallocated; `update` allocates nothing.
 */
export class Scenery {
  readonly group = new THREE.Group();
  private readonly meshes: { mesh: THREE.InstancedMesh; items: { x: number; y: number; z: number; w: number; h: number }[] }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(placements: readonly SceneryPlacement[], center: Centerline, texture: THREE.Texture) {
    const byKind = new Map<string, SceneryPlacement[]>();
    for (const p of placements) {
      const list = byKind.get(p.sprite) ?? [];
      list.push(p);
      byKind.set(p.sprite, list);
    }
    const pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };
    for (const [kind, list] of byKind) {
      const art = SCENERY_ART[kind]!;
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0); // anchor at the base
      const { x, y, w, h } = art.frame;
      const u0 = x / PROPS_ATLAS.width, u1 = (x + w) / PROPS_ATLAS.width;
      const v1 = 1 - y / PROPS_ATLAS.height, v0 = 1 - (y + h) / PROPS_ATLAS.height;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
      const mat = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.frustumCulled = false; // instances span the lap; per-instance culling isn't worth it at this count
      const items = list.map((p) => {
        poseAt(center, p.s, p.lat, pose);
        return { x: pose.x, y: pose.y, z: pose.z, w: p.width, h: p.height };
      });
      this.meshes.push({ mesh, items });
      this.group.add(mesh);
    }
  }

  update(camera: THREE.Camera): void {
    const cx = camera.position.x, cz = camera.position.z;
    for (const { mesh, items } of this.meshes) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        this.q.setFromAxisAngle(this.up, Math.atan2(cx - it.x, cz - it.z));
        this.p.set(it.x, it.y, it.z);
        this.sc.set(it.w, it.h, 1);
        mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/**
 * Horizon: a panorama strip on the inside of a cylinder that travels with the
 * camera, so it sits at infinity and slides past as the car turns (parallax
 * against curves for free). The flat sky colour fills everything above it.
 */
export class Horizon {
  readonly mesh: THREE.Mesh;
  static readonly RADIUS = 850;
  static readonly REPEATS = 4;

  constructor(texture: THREE.Texture, aspect: number) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(Horizon.REPEATS, 1);
    const height = ((2 * Math.PI * Horizon.RADIUS) / Horizon.REPEATS) / aspect;
    const geo = new THREE.CylinderGeometry(Horizon.RADIUS, Horizon.RADIUS, height, 64, 1, true);
    geo.translate(0, height / 2 - height * 0.12, 0); // strip base sits just below eye level
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, alphaTest: 0.5, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.x = -1; // seen from inside: un-mirror the art
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.set(camera.position.x, camera.position.y, camera.position.z);
  }
}

export type HorizonTheme = keyof typeof HORIZONS;

export function pixelTexture(url: string, loader: THREE.TextureLoader): THREE.Texture {
  const t = loader.load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
