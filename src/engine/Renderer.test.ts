import { describe, it, expect } from 'vitest';
import { projectSegment, Renderer, selectCarFrame, overlaysVisible } from './Renderer.js';
import { LADDER, OVERLAY_CULL_STEP, quantisedWidth } from '../math/ladder.js';
import { TrackManager } from './TrackManager.js';
import { RecordingBackend } from './testing/RecordingBackend.js';
import { SpriteAtlas } from './SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import {
  DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y, LOGICAL_WIDTH, LOGICAL_HEIGHT,
  DEFAULT_TRACK_CONFIG, COLORS, PLAYER_CAR_WIDTH, PLAYER_CAR_BASE_Y,
} from '../constants.js';
import type { Camera, PlayerState, Segment, Sprite } from '../types/engine.js';
import { buildCarFrameSet } from './CarFrameSet.js';
import { parseTrackFile } from '../track/schema.js';
import { MIN_BAND_ROWS } from './roadBanding.js';

const CAM: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
const camAt = (z: number): Camera =>
  ({ x: 0, z, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y });
const ROAD_HALF = 2000;

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

/** A minimal TrackManager stand-in: a flat straight track whose per-segment
 * sprite lists are supplied by `spritesFor`. Only `segment()` is used by Renderer. */
function stubTrack(spritesFor: (i: number) => Sprite[]): TrackManager {
  return {
    segment: (index: number): Segment => ({
      index, z: index * DEFAULT_TRACK_CONFIG.segmentLength, curve: 0, pitch: 0, sprites: spritesFor(index),
    }),
  } as unknown as TrackManager;
}

describe('projectSegment', () => {
  it('centres a straight-ahead segment and shrinks its half-width with depth', () => {
    const near = projectSegment(0, 0, 400, CAM, ROAD_HALF);
    const far = projectSegment(0, 0, 4000, CAM, ROAD_HALF);
    expect(near.x).toBeCloseTo(LOGICAL_WIDTH / 2, 9); // centred on a straight
    expect(far.x).toBeCloseTo(LOGICAL_WIDTH / 2, 9);
    expect(near.w).toBeGreaterThan(far.w); // nearer road is wider
    expect(far.w).toBeGreaterThan(0);
    expect(near.y).toBeGreaterThan(far.y); // nearer ground is lower on screen (larger y)
    expect(far.y).toBeGreaterThan(HORIZON_Y); // ground stays below the horizon
  });

  it('shifts screen-x when the segment centre curves away from the camera axis', () => {
    const straight = projectSegment(0, 0, 1000, CAM, ROAD_HALF);
    const curved = projectSegment(500, 0, 1000, CAM, ROAD_HALF); // centre drifted +500 world
    expect(curved.x).toBeGreaterThan(straight.x);
  });
});

describe('Renderer straight road surface', () => {
  it('emits road quads centred and shrinking near→far, in draw order', () => {
    // The track has a 60-segment straight lead-in before its first curve; keep
    // the whole rendered view inside it (drawDistance < 60) so "centred" is exact.
    const straightCfg = { ...DEFAULT_TRACK_CONFIG, drawDistance: 40 };
    const track = new TrackManager(straightCfg);
    const renderer = new Renderer(straightCfg, atlas);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };

    renderer.render(cam, track, backend);

    const road = backend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    expect(road.length).toBeGreaterThan(10);
    // Centred on a straight road: every road quad's edges are symmetric about centre.
    for (const q of road) {
      expect(q.x1).toBeCloseTo(LOGICAL_WIDTH / 2, 6);
      expect(q.x2).toBeCloseTo(LOGICAL_WIDTH / 2, 6);
    }
    // Draw order near→far ⇒ each quad's top row (y1) is at or above the previous.
    for (let i = 1; i < road.length; i++) {
      expect(road[i]!.y1).toBeLessThanOrEqual(road[i - 1]!.y1);
    }
    // Far half-widths are smaller than near ones.
    expect(road[0]!.w2).toBeGreaterThan(road[road.length - 1]!.w1);
  });

  it('clears the frame first and leaves present() to the caller', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
    renderer.render(cam, track, backend);
    expect(backend.clears.length).toBe(1);
    // The caller composites the HUD then presents; the renderer no longer does.
    expect(backend.presents).toBe(0);
  });
});

describe('Renderer rumble + lane decoration', () => {
  it('alternates rumble colour by band and overlays road on rumble', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
    renderer.render(cam, track, backend);

    const rumbleColors = new Set(backend.quads.map((q) => q.color));
    expect(rumbleColors.has(COLORS.rumbleLight)).toBe(true);
    expect(rumbleColors.has(COLORS.rumbleDark)).toBe(true);
    expect(rumbleColors.has(COLORS.lane)).toBe(true);

    // For a given span the rumble quad is wider than the road quad and drawn earlier.
    const firstRoadIdx = backend.quads.findIndex((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    expect(firstRoadIdx).toBeGreaterThan(0);
    const rumbleBefore = backend.quads[firstRoadIdx - 1]!;
    const road = backend.quads[firstRoadIdx]!;
    expect(rumbleBefore.w1).toBeGreaterThan(road.w1);
  });
});

describe('Renderer curve + hill + occlusion (M2 track)', () => {
  const cam = (): Camera => ({ x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y });

  it('drifts road-quad centres away from screen centre through a curve', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const backend = new RecordingBackend();
    const c = cam();
    c.z = 60 * DEFAULT_TRACK_CONFIG.segmentLength; // park the camera at the curve entry
    renderer.render(c, track, backend);
    const road = backend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    // Far quads bend off-centre: the farthest quad's centre differs from screen centre.
    const farthest = road[road.length - 1]!;
    expect(Math.abs(farthest.x1 - LOGICAL_WIDTH / 2)).toBeGreaterThan(1);
  });

  it('discards far segments hidden behind a crest (fewer quads than an equal flat run)', () => {
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const segLen = DEFAULT_TRACK_CONFIG.segmentLength;

    // Occluded case: from the lead-in the hill crest (~segment 140) sits ahead in
    // the draw distance and hides the road beyond it.
    const cCrest = cam();
    cCrest.z = 0;
    const crestBackend = new RecordingBackend();
    renderer.render(cCrest, track, crestBackend);

    // Unoccluded reference: parked deep in the flat run-out after the crest, the
    // whole draw distance is level so nothing is occluded (full draw distance).
    const cFlat = cam();
    cFlat.z = 300 * segLen;
    const flatBackend = new RecordingBackend();
    renderer.render(cFlat, track, flatBackend);

    const crestRoad = crestBackend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).length;
    const flatRoad = flatBackend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).length;
    expect(crestRoad).toBeLessThan(flatRoad); // crest occluded the far road
  });
});

describe('Renderer branch pass (fork roads + median)', () => {
  const cfg = { ...DEFAULT_TRACK_CONFIG, drawDistance: 40 };
  const segLen = DEFAULT_TRACK_CONFIG.segmentLength;

  function flatTrack(ways: 2 | 3 | null): TrackManager {
    const r = parseTrackFile({
      trackId: 'forked', stageName: 'Forked', segmentLength: 200, roadWidth: 2000, lanes: 3,
      sections: [{ length: 700, curve: 0, pitch: 0 }],
      ...(ways === null ? {} : { branchPoint: { startSegment: 100, splitDurationSegments: 60, ways } }),
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    return new TrackManager(cfg, r.track);
  }
  const roadQuads = (b: RecordingBackend): number =>
    b.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).length;

  it('draws exactly as many road quads as an unforked control before the window', () => {
    const forked = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(0), flatTrack(2), forked); // segments 0–40, window at 100
    const control = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(0), flatTrack(null), control);
    expect(roadQuads(forked)).toBe(roadQuads(control));
  });

  it('multiplies road quads inside the split window', () => {
    const forked = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(90 * segLen), flatTrack(2), forked); // view spans the window
    const control = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(90 * segLen), flatTrack(null), control);
    expect(roadQuads(forked)).toBeGreaterThan(roadQuads(control));
  });

  it('draws a median wedge once the gap opens', () => {
    const early = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(95 * segLen), flatTrack(2), early); // window mouth: no gap yet
    const deep = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(130 * segLen), flatTrack(2), deep); // deep split near the node
    const medians = (b: RecordingBackend): number => b.quads.filter((q) => q.color === COLORS.groundDark).length;
    expect(medians(deep)).toBeGreaterThan(0);
    expect(medians(deep)).toBeGreaterThan(medians(early));
  });

  it('ends a forked road at the track end instead of wrapping at full spread', () => {
    const nearEnd = 680 * segLen; // 20 segments left; drawDistance 40 wraps unforked
    const forked = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(nearEnd), flatTrack(2), forked);
    const control = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(nearEnd), flatTrack(null), control);
    const topRow = (b: RecordingBackend): number =>
      Math.min(...b.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).map((q) => q.y1));
    // The forked road stops at the track end (higher y = farther from the
    // horizon), while the unforked control wraps and draws all the way out.
    expect(topRow(forked)).toBeGreaterThan(topRow(control));
  });

  it('a 3-way fork renders more road quads than a 2-way at the same spot', () => {
    const two = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(130 * segLen), flatTrack(2), two);
    const three = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(130 * segLen), flatTrack(3), three);
    expect(roadQuads(three)).toBeGreaterThan(roadQuads(two));
  });
});

describe('Renderer sprite pass (depth-sorted billboards)', () => {
  const treeFrame = atlas.frame('tree');
  const isTree = (s: { sx: number; sy: number }): boolean => s.sx === treeFrame.x && s.sy === treeFrame.y;

  it('draws nearer sprites larger than far ones (monotonic with 1/z)', () => {
    const cfg = { ...DEFAULT_TRACK_CONFIG, drawDistance: 40 };
    const track = stubTrack((i) => (i === 5 || i === 30) ? [{ name: 'tree', offset: -1.4 }] : []);
    const backend = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(0), track, backend);

    const trees = backend.sprites.filter(isTree);
    expect(trees.length).toBe(2);
    // The far→near pass emits the far tree (segment 30) first, the near one (5) last.
    expect(trees[1]!.dh).toBeGreaterThan(trees[0]!.dh);
  });

  it('emits sprite calls in far→near order (later calls are nearer/larger)', () => {
    const cfg = { ...DEFAULT_TRACK_CONFIG, drawDistance: 40 };
    const track = stubTrack((i) => (i % 3 === 0) ? [{ name: 'tree', offset: 1.4 }] : []);
    const backend = new RecordingBackend();
    new Renderer(cfg, atlas).render(camAt(0), track, backend);

    const trees = backend.sprites.filter(isTree);
    expect(trees.length).toBeGreaterThan(3);
    for (let i = 1; i < trees.length; i++) {
      expect(trees[i]!.dh).toBeGreaterThanOrEqual(trees[i - 1]!.dh); // same frame ⇒ dh ∝ 1/z
    }
  });

  it('crest occlusion culls sprites hidden behind the hill (fewer than a flat run)', () => {
    // Faithful substitute for the plan's bottom-clip assertion: with base-anchored
    // billboards the per-segment clipBottom equals the sprite base, so the strict
    // clipBottom < dy+dh case never fires; the crest instead removes far sprites by
    // culling their (now invalid) road segments — the same crest-occlusion path.
    const track = new TrackManager(DEFAULT_TRACK_CONFIG); // carries scenery + a crest
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const segLen = DEFAULT_TRACK_CONFIG.segmentLength;

    const crestBackend = new RecordingBackend();
    renderer.render(camAt(0), track, crestBackend); // crest ~segment 140 ahead

    const flatBackend = new RecordingBackend();
    renderer.render(camAt(300 * segLen), track, flatBackend); // deep in the flat run-out

    // Every sprite carries a crest clip line (≤ frame bottom), proving threading.
    for (const s of crestBackend.sprites) expect(s.clipBottom).toBeLessThanOrEqual(LOGICAL_HEIGHT);
    // The crest hides the far road (and its scenery); the flat run sees more.
    expect(crestBackend.sprites.length).toBeLessThan(flatBackend.sprites.length);
  });
});

describe('road surface', () => {
  it('draws shoulder, rumble, road widest-first so each overlays the last', () => {
    const backend = new RecordingBackend();
    const track = stubTrack(() => []);
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), track, backend);

    const shoulders = backend.quads.filter((q) => q.color === COLORS.shoulder);
    expect(shoulders.length).toBeGreaterThan(0);

    // For one span, the shoulder quad is wider than the rumble beneath it.
    const i = backend.quads.findIndex((q) => q.color === COLORS.shoulder);
    const shoulder = backend.quads[i]!;
    const rumble = backend.quads[i + 1]!;
    expect(shoulder.w2).toBeGreaterThan(rumble.w2);
  });

  it('draws the shoulder on both band phases, unlike the kerb', () => {
    const backend = new RecordingBackend();
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);

    const kerbRed = backend.quads.filter((q) => q.color === COLORS.rumbleDark).length;
    const kerbWhite = backend.quads.filter((q) => q.color === COLORS.rumbleLight).length;
    const shoulder = backend.quads.filter((q) => q.color === COLORS.shoulder).length;

    expect(kerbRed).toBeGreaterThan(0);
    expect(kerbWhite).toBeGreaterThan(0);
    // One shoulder per road span; kerb splits that count across two phases.
    expect(shoulder).toBe(kerbRed + kerbWhite);
  });

  it('merges bands near the horizon instead of alternating them', () => {
    const backend = new RecordingBackend();
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);

    // The far end of the draw distance is emitted last within each span group;
    // collect kerb quads whose projected height is under the merge floor.
    const kerbs = backend.quads.filter(
      (q) => q.color === COLORS.rumbleDark || q.color === COLORS.rumbleLight,
    );
    const tiny = kerbs.filter((q) => Math.abs(q.y2 - q.y1) * DEFAULT_TRACK_CONFIG.rumbleSegments < MIN_BAND_ROWS);
    expect(tiny.length).toBeGreaterThan(0);
    // Every merged band uses the light phase — no alternation at the horizon.
    for (const q of tiny) expect(q.color).toBe(COLORS.rumbleLight);
  });
});

it('centres the player car and bases it at the locked row', () => {
  const backend = new RecordingBackend();
  new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);
  const car = backend.sprites.at(-1)!; // player car is drawn last
  expect(car.dw).toBe(PLAYER_CAR_WIDTH);
  expect(car.dx + car.dw / 2).toBeCloseTo(LOGICAL_WIDTH / 2, 5);
  expect(car.dy + car.dh).toBeCloseTo(PLAYER_CAR_BASE_Y, 5);
});

describe('scale ladder quantisation', () => {
  const treeFrame = atlas.frame('tree');
  const isTree = (s: { sx: number; sy: number }): boolean =>
    s.sx === treeFrame.x && s.sy === treeFrame.y;

  it('holds one sprite width over a run of camera positions — the anti-shimmer property', () => {
    // The plan probed this with two fixed segments, but adjacent far segments
    // differ in z by ~5% while a ladder step is 25%, so whether a given pair
    // shares a step is luck. Approaching the sprite continuously — which is what
    // the player actually does — tests the real property: the drawn width must be
    // piecewise constant, not a new value every frame.
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    const track = stubTrack((i) => (i === 40 ? [{ name: 'tree', offset: -1.4 }] : []));
    const widths: number[] = [];
    // Segment 40 sits at z = 8000; drive most of the way to it so the sprite
    // sweeps a real size range instead of sitting at one sub-pixel width.
    for (let z = 0; z < 7600; z += 40) {
      const backend = new RecordingBackend();
      renderer.render(camAt(z), track, backend);
      const tree = backend.sprites.filter(isTree)[0];
      if (tree) widths.push(tree.dw);
    }
    expect(widths.length).toBeGreaterThan(50);
    const changes = widths.filter((w, i) => i > 0 && w !== widths[i - 1]).length;
    expect(changes).toBeGreaterThan(0); // it does still resize with depth
    expect(changes).toBeLessThan(widths.length / 8); // but rarely — long flat runs
  });

  it('still draws a much nearer sprite on a larger step', () => {
    const backend = new RecordingBackend();
    // Segments 5 and 60 are far enough apart to straddle several ladder steps.
    const track = stubTrack((i) => (i === 5 || i === 60 ? [{ name: 'tree', offset: -1.4 }] : []));
    new Renderer({ ...DEFAULT_TRACK_CONFIG, drawDistance: 80 }, atlas).render(camAt(0), track, backend);
    const trees = backend.sprites.filter(isTree);
    expect(trees).toHaveLength(2);
    expect(trees[1]!.dw).toBeGreaterThan(trees[0]!.dw);
  });

  it('only ever emits widths that sit on the quantiser series', () => {
    const backend = new RecordingBackend();
    const track = stubTrack((i) => (i % 4 === 0 ? [{ name: 'tree', offset: 1.4 }] : []));
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), track, backend);
    const trees = backend.sprites.filter(isTree);
    expect(trees.length).toBeGreaterThan(4);
    // Every emitted width is a fixed point of the quantiser — nothing continuous
    // slipped through. LADDER itself is only the car-sized window of that series.
    for (const t of trees) expect(quantisedWidth(t.dw)).toBe(t.dw);
  });
});

describe('player steering frames', () => {
  const cases: [number, boolean, number, boolean][] = [
    // steer, skidding, expectedAngleIdx, expectedFlipX
    [0, false, 0, false],
    [0.3, false, 1, false],
    [0.9, false, 2, false],
    [-0.3, false, 1, true],
    [-0.9, false, 2, true],
  ];
  it.each(cases)('steer=%s skid=%s -> angle %s flip %s', (steer, skid, angle, flip) => {
    expect(selectCarFrame(steer, skid)).toEqual({ angle, flipX: flip, skid });
  });

  it('flags the skid frame without losing the steering angle', () => {
    expect(selectCarFrame(0.9, true).skid).toBe(true);
    expect(selectCarFrame(0.9, true).angle).toBe(2);
  });

  it('treats NaN steer as straight ahead rather than throwing', () => {
    expect(selectCarFrame(Number.NaN, false)).toEqual({ angle: 0, flipX: false, skid: false });
  });
});

describe('overlay culling', () => {
  it('drops overlays once the car is too small to show them', () => {
    expect(overlaysVisible(OVERLAY_CULL_STEP - 1)).toBe(true);
    expect(overlaysVisible(OVERLAY_CULL_STEP)).toBe(false);
    expect(overlaysVisible(OVERLAY_CULL_STEP + 1)).toBe(false);
  });
});

describe('baked player car', () => {
  /** Build a CarFrameSet from synthetic manifest frames, the same path the real
   * atlas takes through buildCarFrameSet. */
  const mkSet = (w: number, h: number, anchors: Record<string, [number, number]> = {}) =>
    buildCarFrameSet([0, 1, 2].flatMap((angle) =>
      Array.from({ length: LADDER.length }, (_, step) => ({
        id: `c_red_a${angle}_s${step}`, x: angle * 10, y: step * 10,
        w: Math.max(1, Math.round(w * (1 + angle * 0.4))), h,
        car: 'c', color: 'red', angle, step, anchors,
      }))));

  // The real 30-degree anchors out of the bake. They must be ASYMMETRIC: a
  // symmetric set maps onto itself under mirroring, so a test using one would
  // pass whether or not `overlayDest` mirrors at all.
  const ANCHORS: Record<string, [number, number]> = {
    wheelFL: [0.4866, 0.5356], wheelFR: [0.7517, 0.5893],
    wheelBL: [0.2175, 0.697], wheelBR: [0.5171, 0.7745],
    brake: [0.278, 0.5676],
  };

  const baked = () => ({
    image: {} as CanvasImageSource,
    body: mkSet(PLAYER_CAR_WIDTH, 105, ANCHORS),
    wheel: mkSet(12, 28),
    brake: mkSet(80, 9),
    color: 0,
  });

  const state = (over: Partial<PlayerState> = {}): PlayerState =>
    ({ z: 0, x: 0, speed: 0, gear: 1, steer: 0, skidding: false, braking: false, ...over });

  function draw(over: Partial<PlayerState> = {}) {
    const backend = new RecordingBackend();
    const r = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
    r.setBakedCar(baked());
    r.render(camAt(0), stubTrack(() => []), backend, undefined, undefined, 0, undefined, state(over));
    return backend;
  }

  it('draws the straight frame centred and based at the locked row', () => {
    const car = draw().sprites.at(-5)!; // body, then four wheels
    expect(car.dw).toBe(PLAYER_CAR_WIDTH);
    expect(car.dx + car.dw / 2).toBeCloseTo(LOGICAL_WIDTH / 2, 5);
    expect(car.dy + car.dh).toBeCloseTo(PLAYER_CAR_BASE_Y, 5);
    expect(car.flipX).toBe(false);
  });

  it('mirrors rather than baking a second set of steering frames', () => {
    const right = draw({ steer: 0.9 }).sprites;
    const left = draw({ steer: -0.9 }).sprites;
    expect(right[right.length - 5]!.flipX).toBe(false);
    expect(left[left.length - 5]!.flipX).toBe(true);
    // Same source rect: the mirror is the whole point, not a different frame.
    expect(left[left.length - 5]!.sx).toBe(right[right.length - 5]!.sx);
  });

  it('keeps overlays attached when the car is mirrored — the classic failure', () => {
    // ax -> 1 - ax. If the mirror is forgotten the wheels slide off to one side
    // on left turns only, which is exactly how this bug presents in play.
    const wheelsOf = (b: RecordingBackend) => b.sprites.slice(-4).map((s) => s.dx);
    const right = draw({ steer: 0.9 });
    const left = draw({ steer: -0.9 });
    const body = right.sprites.at(-5)!;
    const mid = body.dx + body.dw / 2;
    const mirrored = wheelsOf(left).map((dx) => 2 * mid - dx).sort((a, b) => a - b);
    const expected = wheelsOf(right)
      .map((dx, i) => dx + right.sprites.slice(-4)[i]!.dw)
      .sort((a, b) => a - b);
    mirrored.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 5));
  });

  it('pins each wheel inside the body it belongs to', () => {
    const b = draw();
    const body = b.sprites.at(-5)!;
    for (const w of b.sprites.slice(-4)) {
      expect(w.dx + w.dw / 2).toBeGreaterThan(body.dx);
      expect(w.dx + w.dw / 2).toBeLessThan(body.dx + body.dw);
      expect(w.dy + w.dh / 2).toBeGreaterThan(body.dy);
      expect(w.dy + w.dh / 2).toBeLessThan(body.dy + body.dh);
    }
  });

  it('lights the brake overlay only while braking', () => {
    expect(draw().sprites.length).toBe(draw({ braking: true }).sprites.length - 1);
  });

  it('falls back to the procedural frame when no atlas arrived', () => {
    const backend = new RecordingBackend();
    new Renderer(DEFAULT_TRACK_CONFIG, atlas)
      .render(camAt(0), stubTrack(() => []), backend, undefined, undefined, 0, undefined, state());
    expect(backend.sprites.at(-1)!.dw).toBe(PLAYER_CAR_WIDTH);
  });

  it('survives a player state the physics never produces', () => {
    expect(() => draw({ steer: Number.NaN })).not.toThrow();
  });
});
