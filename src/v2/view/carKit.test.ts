import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import palette from '../../assets/palette.json';
import { CarKit, DEFAULT_LOOKS, KIT_SLOTS, MOUNT_ROLES, WHEEL_MOUNTS } from './carKit.js';

/** The committed kit, exactly as scripts/build_car_kit.py (npm run bake:kit) wrote it. */
const glb = readFileSync(new URL('../../../public/assets/cars/kit.glb', import.meta.url));

interface GltfJson {
  nodes: { name: string; children?: number[]; extras?: Record<string, unknown> }[];
  materials: { name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
}
function gltfJson(): GltfJson {
  const len = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + len).toString('utf8')) as GltfJson;
}

async function loadKit(): Promise<CarKit> {
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return new CarKit(gltf.scene);
}

const toSrgbByte = (c: number): number => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

describe('car kit file', () => {
  const json = gltfJson();
  const parts = json.nodes.filter((n) => typeof n.extras?.part === 'string');

  it('has at least three parts in every slot, and every part the default looks use', () => {
    for (const slot of KIT_SLOTS) expect(parts.filter((p) => (p.extras!.part as string).startsWith(`${slot}.`)).length, slot).toBeGreaterThanOrEqual(3);
    const ids = new Set(parts.map((p) => p.extras!.part));
    for (const look of DEFAULT_LOOKS) for (const slot of KIT_SLOTS) expect(ids.has(look[slot]), look[slot]).toBe(true);
  });

  it('gives every body all seven mount points', () => {
    for (const body of parts.filter((p) => (p.extras!.part as string).startsWith('body.'))) {
      const roles = (body.children ?? []).map((i) => json.nodes[i]!.extras?.mount);
      expect(roles.sort(), body.name).toEqual([...MOUNT_ROLES].sort());
    }
  });

  it('is palette-clamped: every material colour is a master-palette colour', () => {
    const flat = JSON.stringify(palette).match(/#[0-9a-f]{6}/gi)!.map((h) => h.toLowerCase());
    for (const m of json.materials) {
      const f = m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      const hex = '#' + f.slice(0, 3).map((c) => toSrgbByte(c).toString(16).padStart(2, '0')).join('');
      expect(flat, `${m.name} ${hex}`).toContain(hex);
    }
  });

  it('stays small: chunky low-poly, under 100 KB', () => {
    expect(glb.byteLength).toBeLessThan(100_000);
  });
});

describe('assembling a car from the kit', () => {
  it('snaps wheels, engine, spoiler and exhaust onto the body mounts and shares geometry', async () => {
    const kit = await loadKit();
    const paint = kit.paint('#ff0000');
    const car = new THREE.Group();
    const look = DEFAULT_LOOKS[0]!;
    const { flame } = kit.assemble(look, car, paint);
    car.updateMatrixWorld(true);

    const wheels: THREE.Vector3[] = [];
    car.traverse((o) => {
      if (WHEEL_MOUNTS.includes(o.userData.mount)) wheels.push(o.getWorldPosition(new THREE.Vector3()));
    });
    expect(wheels).toHaveLength(4);
    // Nose is -Z (three), wheels either side of the centre line and on the ground.
    for (const w of wheels) {
      expect(Math.abs(w.x)).toBeGreaterThan(0.8);
      expect(w.y).toBeGreaterThan(0.25);
      expect(w.y).toBeLessThan(0.5);
    }
    expect(flame.z).toBeGreaterThan(1.8); // at the tail

    let painted = 0;
    const box = new THREE.Box3().setFromObject(car);
    car.traverse((o) => { if (o instanceof THREE.Mesh && o.material === paint) painted++; });
    expect(painted).toBeGreaterThan(0);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.7); expect(size.x).toBeLessThan(2.6);
    expect(size.z).toBeGreaterThan(3.8); expect(size.z).toBeLessThan(5);

    // Rebuilding replaces the parts rather than stacking them.
    const count = car.children.length;
    kit.assemble(DEFAULT_LOOKS[1]!, car, paint);
    expect(car.children.length).toBe(count);
  });

  it('builds every default look', async () => {
    const kit = await loadKit();
    for (const look of DEFAULT_LOOKS) expect(() => kit.assemble(look, new THREE.Group(), kit.paint(0))).not.toThrow();
  });
});
