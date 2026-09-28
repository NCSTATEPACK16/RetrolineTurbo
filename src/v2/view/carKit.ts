import * as THREE from 'three';
import palette from '../../assets/palette.json';

/**
 * The modular car kit (PRD section 8/10): low-poly parts built by
 * scripts/build_car_kit.py in Blender and exported to one glTF. A car is a
 * body plus a part in each slot, snapped onto the body's mount points; the
 * game re-skins the kit's material roles with shared toon materials, and each
 * car's `paint` material is its own so it can be recoloured.
 */
export const KIT_URL = '/assets/cars/kit.glb';

export type KitSlot = 'body' | 'wheels' | 'engine' | 'spoiler' | 'exhaust';
export const KIT_SLOTS: readonly KitSlot[] = ['body', 'wheels', 'engine', 'spoiler', 'exhaust'];

/** Which part fills each slot, by kit id (`<slot>.<name>`). */
export type CarLook = Readonly<Record<KitSlot, string>>;

export const WHEEL_MOUNTS = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const;
export const MOUNT_ROLES = ['engine', 'spoiler', 'exhaust', ...WHEEL_MOUNTS] as const;

/** A spread of looks so the field doesn't look cloned before the roster gives everyone their own. */
export const DEFAULT_LOOKS: readonly CarLook[] = [
  { body: 'body.roadster', wheels: 'wheels.stock', engine: 'engine.scoop', spoiler: 'spoiler.wing', exhaust: 'exhaust.twin' },
  { body: 'body.brick', wheels: 'wheels.chunky', engine: 'engine.blower', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
  { body: 'body.wedge', wheels: 'wheels.slick', engine: 'engine.vents', spoiler: 'spoiler.tower', exhaust: 'exhaust.stack' },
  { body: 'body.roadster', wheels: 'wheels.slick', engine: 'engine.vents', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
  { body: 'body.brick', wheels: 'wheels.stock', engine: 'engine.scoop', spoiler: 'spoiler.tower', exhaust: 'exhaust.twin' },
  { body: 'body.wedge', wheels: 'wheels.chunky', engine: 'engine.blower', spoiler: 'spoiler.wing', exhaust: 'exhaust.twin' },
  { body: 'body.roadster', wheels: 'wheels.chunky', engine: 'engine.blower', spoiler: 'spoiler.tower', exhaust: 'exhaust.stack' },
  { body: 'body.wedge', wheels: 'wheels.stock', engine: 'engine.scoop', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
];

/** Three flat bands of light: lit, mid, shadow. Nearest-filtered so the steps stay hard. */
function toonRamp(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const ROLE_COLORS: Readonly<Record<string, string>> = {
  trim: palette.chrome[0]!,
  chrome: palette.chrome[3]!,
  glass: palette.body.blue[1]!,
  tyre: palette.outline,
  light: palette.ui.gold,
};

export interface AssembledCar {
  /** Where the boost flame sits, in the car's local space. */
  readonly flame: THREE.Vector3;
}

export class CarKit {
  private readonly parts = new Map<string, THREE.Object3D>();
  private readonly ramp = toonRamp();
  private readonly shared = new Map<string, THREE.Material>();

  /** `root` is the loaded glTF scene; parts are its children tagged with extras.part. */
  constructor(root: THREE.Object3D) {
    for (const child of root.children) {
      const id = child.userData.part as string | undefined;
      if (id) this.parts.set(id, child);
    }
    for (const [role, color] of Object.entries(ROLE_COLORS)) {
      this.shared.set(role, new THREE.MeshToonMaterial({ color, gradientMap: this.ramp }));
    }
  }

  has(id: string): boolean {
    return this.parts.has(id);
  }

  get ids(): string[] {
    return [...this.parts.keys()].sort();
  }

  /** A toon paint material for one car, recoloured by the caller as players change. */
  paint(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.ramp });
  }

  /**
   * Build `look` into `into` (cleared of previous kit parts first). Geometry is
   * shared with the kit; only transforms are per car.
   */
  assemble(look: CarLook, into: THREE.Object3D, paint: THREE.Material): AssembledCar {
    for (let i = into.children.length - 1; i >= 0; i--) {
      if (into.children[i]!.userData.kit) into.remove(into.children[i]!);
    }
    const body = this.part(look.body, paint);
    body.userData.kit = true;
    into.add(body);
    body.updateMatrixWorld(true);
    const mount = (role: string): THREE.Object3D => {
      let found: THREE.Object3D | undefined;
      body.traverse((o) => { if (o.userData.mount === role) found = o; });
      if (!found) throw new Error(`${look.body} has no "${role}" mount`);
      return found;
    };
    mount('engine').add(this.part(look.engine, paint));
    mount('spoiler').add(this.part(look.spoiler, paint));
    const exhaust = this.part(look.exhaust, paint);
    mount('exhaust').add(exhaust);
    for (const w of WHEEL_MOUNTS) mount(w).add(this.part(look.wheels, paint));
    // Boost flame: the exhaust's flame marker, in the car's frame.
    body.updateMatrixWorld(true);
    let flameAt: THREE.Object3D = exhaust;
    exhaust.traverse((o) => { if (o.userData.flame) flameAt = o; });
    const flame = new THREE.Vector3();
    flameAt.getWorldPosition(flame);
    into.worldToLocal(flame);
    return { flame };
  }

  private part(id: string, paint: THREE.Material): THREE.Object3D {
    const src = this.parts.get(id);
    if (!src) throw new Error(`car kit has no part "${id}"`);
    const p = src.clone();
    p.position.set(0, 0, 0); // the kit lays parts out in a row; mounts give the real position
    p.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.userData.kitMesh = true; // geometry belongs to the kit: never disposed with a scene
      const role = (o.material as THREE.Material).name;
      o.material = role === 'paint' ? paint : this.shared.get(role) ?? paint;
    });
    return p;
  }
}

/** Load the kit (browser). The scene draws placeholder cars until it arrives. */
export async function loadCarKit(url = KIT_URL): Promise<CarKit> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  return new CarKit(gltf.scene);
}
