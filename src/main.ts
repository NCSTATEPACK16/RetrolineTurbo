import { Canvas2DBackend } from './engine/Canvas2DBackend.js';
import { createLoop } from './physics/loop.js';
import { ensureAnonSession } from './net/supabase.js';
import { Renderer } from './engine/Renderer.js';
import { TrackManager } from './engine/TrackManager.js';
import { Background } from './engine/Background.js';
import { generateAtlas } from './assets/generateSprites.js';
import { SpriteAtlas } from './engine/SpriteAtlas.js';
import { Traffic, type TrafficCar } from './engine/Traffic.js';
import { HUD } from './ui/HUD.js';
import { hitCar, responseDelta } from './engine/Collision.js';
import { Vehicle, createCommand } from './physics/Vehicle.js';
import { InputManager, mouseSteerCurve } from './input/InputManager.js';
import { chooseSaveBackend } from './net/saveBackend.js';
import { ScoreState } from './economy/score.js';
import { loadBackdrops } from './engine/loadBackdrops.js';
import { backdropIdForStage, type Backdrop } from './engine/Backdrop.js';
import { loadAtlases, ATLAS_IDS, type LoadedAtlas } from './engine/loadAtlases.js';
import { buildCarFrameSet } from './engine/CarFrameSet.js';
import { buildEffectSet } from './engine/Effects.js';
import { RemapScreen, loadBindings } from './ui/RemapScreen.js';
import { LeaderboardScreen } from './ui/LeaderboardScreen.js';
import { TrackBrowserScreen } from './ui/TrackBrowserScreen.js';
import { EditorScreen } from './track/editor/EditorScreen.js';
import { RouteState, sceneTrack, resolveFork, nextSceneIdx, STAGES, routeIdentity } from './track/route.js';
import { recordRaceResult } from './net/raceResults.js';
import { publishTrack } from './net/tracks.js';
import { chosenOffsetAtNode, branchSpread, fillRoadOffsets } from './engine/BranchRenderer.js';
import { RouteMap } from './ui/RouteMap.js';
import { drawText } from './ui/text.js';
import { parseTrackFile } from './track/schema.js';
import {
  DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y,
  LOGICAL_WIDTH, LOGICAL_HEIGHT, PLAYER_CAR_ID,
} from './constants.js';
import type { Camera } from './types/engine.js';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('main: #game canvas not found');
}
const stage = canvas.parentElement ?? document.body;

const backend = new Canvas2DBackend(canvas);

function fit(): void {
  backend.resize(stage.clientWidth, stage.clientHeight);
}
fit();
window.addEventListener('resize', fit);

// --- Phase 5: real physics behind the PlayerState seam ------------------------
// The Vehicle implements the same PlayerState the Phase 4 harness exposed, so
// collision, HUD, and the sprite pass consume it unchanged (spec §2).
const { image, frames } = generateAtlas();
const atlas = new SpriteAtlas(image, frames);

const track = new TrackManager(DEFAULT_TRACK_CONFIG);
const background = new Background();
const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
const hud = new HUD(atlas);

const trackLength = track.length * DEFAULT_TRACK_CONFIG.segmentLength;
const cars: TrafficCar[] = [
  { z: 4000, offset: -0.4, speed: 4000, sprite: 'car0', variant: 0 },
  { z: 9000, offset: 0.4, speed: 3500, sprite: 'car1', variant: 1 },
  { z: 15000, offset: 0, speed: 5000, sprite: 'car2', variant: 2 },
  { z: 22000, offset: -0.5, speed: 4500, sprite: 'car3', variant: 3 },
];
const traffic = new Traffic(cars, trackLength);

const save = chooseSaveBackend();
const score = new ScoreState(); // TX-1 passed-cars / points, shown in the HUD header

// Horizon plates load asynchronously; until (or unless) they arrive the
// Background falls back to its flat colour bands, so the loop never waits.
let backdrops = new Map<string, Backdrop>();
void loadBackdrops().then((loaded) => { backdrops = loaded; });

// Sprite atlases load asynchronously; until (or unless) they arrive the game
// draws the procedural atlas, so the loop never waits and frame 1 always paints.
// Deliberately NOT awaited: Renderer/HUD take the atlas in their constructors
// above, and awaiting here would delay first paint behind a network round-trip.
let atlases = new Map<string, LoadedAtlas>();
void loadAtlases().then((loaded) => {
  atlases = loaded;
  console.info(`[atlas] ${atlases.size}/${ATLAS_IDS.length} baked atlases loaded; the rest draw procedurally`);
  // Effects first, and on its own: it is the DROPPABLE atlas, so its absence is
  // routine and must not be reached through an early return taken for the car.
  const fx = atlases.get('effects');
  if (fx) renderer.setEffects(buildEffectSet(fx.image, fx.meta.frames));

  const cars = atlases.get('cars');
  if (!cars) return; // no baked car: the procedural placeholder keeps drawing

  // Partition by car id once, here, rather than per frame. `<car>-wheel` and
  // `<car>-brake` are overlay parts pinned to the body's anchors, not extra
  // body variants (see Renderer.BakedCar).
  const byCar = (id: string) => cars.meta.frames.filter((f) => f.car === id);
  const body = byCar(PLAYER_CAR_ID);
  if (body.length === 0) return;
  // Wheels are `under` parts: they draw before the body so the bodywork occludes
  // them, exactly as the single-pass render does.
  const under = ['wheelBL', 'wheelBR', 'wheelFL', 'wheelFR']
    .map((anchor) => ({ anchor, frames: byCar(`${PLAYER_CAR_ID}-${anchor}`) }))
    .filter((o) => o.frames.length > 0)
    .map((o) => ({ anchor: o.anchor, set: buildCarFrameSet(o.frames) }));
  const brake = byCar(`${PLAYER_CAR_ID}-brake`);
  renderer.setBakedCar({
    image: cars.image,
    body: buildCarFrameSet(body),
    under,
    brake: brake.length ? buildCarFrameSet(brake) : null,
    color: 0,
  });

  const props = atlases.get('props');
  if (!props) return; // no baked props: procedural placeholders keep drawing
  const names = new Set(props.meta.frames.map((f) => f.car));
  const sets = new Map(Array.from(names, (name) => (
    [name, buildCarFrameSet(props.meta.frames.filter((f) => f.car === name))]
  )));
  renderer.setBakedProps({ image: props.image, sets });
});

const input = new InputManager();
const vehicle = new Vehicle(DEFAULT_TRACK_CONFIG.roadWidth);
const remap = new RemapScreen(atlas, save, input);
const leaderboard = new LeaderboardScreen(atlas);
const cmd = createCommand(); // pre-allocated; refilled each step (hard rule 4)

// --- Phase 7: route mode — the pyramid drives which scene is loaded ----------
let route = new RouteState(1);
const routeMap = new RouteMap(atlas);
function bootScene(): void {
  const r = parseTrackFile(sceneTrack(route.currentPlan()));
  if (r.ok) track.rebuild(r.track);
  else console.error('[route] scene failed to parse:', r.errors);
}
bootScene();

const editor = new EditorScreen(atlas, save, (t) => {
  // Config-compat rule: only activate tracks matching the engine config.
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    return false; // editor surfaces "not activated" in its status line
  }
  track.rebuild(t);
  return true;
}, publishTrack);
void editor.loadIndex();

const trackBrowser = new TrackBrowserScreen(atlas, (t) => {
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    return false;
  }
  track.rebuild(t);
  return true;
});

const camera: Camera = {
  x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y,
};

void loadBindings(save).then((b) => { input.setBindings(b); });

// Screens see every key first (remap, then editor); leftovers drive the InputManager.
// While a screen is open, OS shortcuts (Cmd/Ctrl combos) pass through untouched.
window.addEventListener('keydown', (e) => {
  const screenOpen = remap.open || editor.open || leaderboard.open || trackBrowser.open;
  if (screenOpen && (e.metaKey || e.ctrlKey)) return;
  if (e.code === 'Tab' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || input.isBound(e.code)) e.preventDefault();
  if (remap.handleKey(e.code)) {
    // Spec §6 mutual exclusion: opening remap closes the editor.
    if (remap.open && editor.open) editor.handleKey('Escape');
    return;
  }
  if (editor.handleKey(e.code)) return;
  if (e.code === 'F3') {
    leaderboard.toggle(routeIdentity(route).trackId);
    return;
  }
  if (leaderboard.handleKey(e.code)) return;
  if (e.code === 'F4') { trackBrowser.toggle(); return; }
  if (trackBrowser.handleKey(e.code)) return;
  if (e.code === 'KeyM') {
    // Toggled on: pinned forever on the ending screen, timed elsewhere.
    routeMap.flashMs = routeMap.flashMs > 0 ? 0 : (route.finished ? Number.MAX_SAFE_INTEGER : 60_000);
    return;
  }
  if (e.code === 'KeyR' && (route.expired || route.finished)) {
    route = new RouteState(1);
    vehicle.reset();
    score.reset();
    elapsedMs = 0;
    routeMap.flashMs = 0;
    bootScene();
    traffic.rescope(0, track.length * DEFAULT_TRACK_CONFIG.segmentLength);
    return;
  }
  input.press(e.code);
});
// Clipboard edge for the editor (kept here so EditorScreen stays clipboard-free).
window.addEventListener('keydown', (e) => {
  if (!editor.open || remap.open || e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyE') void navigator.clipboard?.writeText(editor.exportJson());
  else if (e.code === 'KeyI') void navigator.clipboard?.readText?.().then((json) => { editor.importJson(json); });
});
window.addEventListener('keyup', (e) => { input.release(e.code); });
window.addEventListener('mousemove', (e) => {
  input.setMouseSteer(mouseSteerCurve((e.clientX / window.innerWidth) * 2 - 1));
});

const padSnapshot = { steer: 0, throttle: 0, brake: 0 }; // reused; no per-step alloc
function pollGamepad(): void {
  const pad = navigator.getGamepads?.()[0];
  if (!pad) { input.setGamepad(null); return; }
  padSnapshot.steer = pad.axes[0] ?? 0;
  padSnapshot.throttle = pad.buttons[7]?.value ?? 0; // RT
  padSnapshot.brake = pad.buttons[6]?.value ?? 0; // LT
  input.setGamepad(padSnapshot);
}

const cfg = {
  roadWidth: DEFAULT_TRACK_CONFIG.roadWidth,
  segmentLength: DEFAULT_TRACK_CONFIG.segmentLength,
  carHalfWidthPx: 900,
};
let elapsedMs = 0;
const roadCenters = [0, 0, 0]; // pre-allocated branch road centres (hard rule 4)

createLoop({
  update: (dt: number): void => {
    pollGamepad();
    input.read(cmd);
    if (remap.open || editor.open || leaderboard.open || trackBrowser.open) { // pause driving while a screen is up
      cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0; cmd.handbrake = true;
    } else if (route.expired || route.finished) {
      cmd.throttle = 0; cmd.steer = 0; cmd.brake = 1; // roll to a stop on the end screens
    }

    // Branch-aware road centre: during a split the drivable roads diverge from
    // the track centre-line; feed the nearest road's centre to the off-road test.
    const segIdx = Math.floor(vehicle.z / DEFAULT_TRACK_CONFIG.segmentLength);
    const seg = track.segment(segIdx);
    let roadCenterX = 0;
    const liveBranch = track.activeBranch;
    if (liveBranch) {
      const maxSpread = DEFAULT_TRACK_CONFIG.roadWidth * Renderer.MAX_SPREAD_ROADWIDTHS;
      const spread = branchSpread(segIdx, liveBranch, maxSpread);
      const n = fillRoadOffsets(roadCenters, liveBranch.ways, spread);
      roadCenterX = roadCenters[0]!;
      for (let i = 1; i < n; i++) {
        if (Math.abs(roadCenters[i]! - vehicle.x) < Math.abs(roadCenterX - vehicle.x)) roadCenterX = roadCenters[i]!;
      }
    }
    vehicle.step(cmd, seg.curve, dt, roadCenterX);
    elapsedMs += dt * 1000;
    traffic.update(dt);
    // Both positions are current here, so a pass is scored on the step it happens.
    score.addOvertakes(traffic.countOvertakes(vehicle.z));

    // Off-road drag is the Vehicle's own μ path; responseDelta applies on hits only.
    if (hitCar(vehicle, cars, cfg) != null) {
      const d = responseDelta({ offRoad: false, hit: true });
      vehicle.applyCollision(d.speedFactor, (vehicle.x >= 0 ? -1 : 1) * d.xPush * dt);
    }

    // Route progression: countdown, fork hand-off, final-stage finish.
    if (!route.finished && !route.expired && !remap.open && !editor.open) {
      route.tick(dt * 1000);
      const branch = track.activeBranch;
      if (branch) {
        const nodeZ = (branch.startSegment + branch.splitDurationSegments) * DEFAULT_TRACK_CONFIG.segmentLength;
        if (vehicle.z >= nodeZ) {
          const choice = resolveFork(vehicle.x, branch.ways, DEFAULT_TRACK_CONFIG.roadWidth);
          // Parse the chosen scene BEFORE advancing route state, so a bad scene
          // can never desync the pyramid from the world.
          const nextRow = route.pyramid[route.stage + 1]!;
          const destination = nextRow[nextSceneIdx(route.sceneIdx, choice, branch.ways, nextRow.length)]!;
          const r = parseTrackFile(sceneTrack(destination));
          if (r.ok) {
            route.advance(choice);
            const maxSpread = DEFAULT_TRACK_CONFIG.roadWidth * Renderer.MAX_SPREAD_ROADWIDTHS;
            track.rebuild(r.track);
            // Land relative to the chosen road's centre, clamped onto its surface
            // so a centre-line straddler is never teleported off-road.
            const chosen = chosenOffsetAtNode(choice, branch.ways, maxSpread);
            const lateral = Math.max(-DEFAULT_TRACK_CONFIG.roadWidth * 0.8,
              Math.min(DEFAULT_TRACK_CONFIG.roadWidth * 0.8, vehicle.x - chosen));
            vehicle.translate(-nodeZ, lateral - vehicle.x);
            traffic.rescope(-nodeZ, track.length * DEFAULT_TRACK_CONFIG.segmentLength);
            routeMap.flashMs = 3000;
          }
        }
      } else if (route.stage === STAGES - 1
          && vehicle.z >= track.length * DEFAULT_TRACK_CONFIG.segmentLength) {
        route.finish();
        routeMap.flashMs = Number.MAX_SAFE_INTEGER; // stays up on the ending screen
        const { trackId, path } = routeIdentity(route);
        void recordRaceResult({ trackId, route: path, timeMs: elapsedMs });
      }
    }
    if (routeMap.flashMs > 0 && routeMap.flashMs < Number.MAX_SAFE_INTEGER) {
      routeMap.flashMs = Math.max(0, routeMap.flashMs - dt * 1000);
    }

    camera.z = vehicle.z;
    camera.x = vehicle.x;

    // Effects age on the physics clock, not the render clock, so a dropped frame
    // does not skip a dust puff. No-ops entirely until effects.png arrives.
    renderer.updateEffects(dt, vehicle);
  },
  render: (): void => {
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    const backdrop = backdrops.get(backdropIdForStage(route.stage));
    renderer.render(camera, track, backend, background, traffic, track.segment(base).curve, backdrop, vehicle);
    hud.render(vehicle, elapsedMs, track, camera, backend, route.remainingMs,
      route, score.passedCars, score.points);
    remap.render(backend);
    editor.render(backend);
    leaderboard.render(backend);
    trackBrowser.render(backend);
    routeMap.render(route, backend);
    if (route.expired) {
      drawText(backend, atlas, 'time up  press r', LOGICAL_WIDTH / 2 - 56, LOGICAL_HEIGHT / 2 - 6, 3);
    } else if (route.finished) {
      drawText(backend, atlas, 'route complete  press r', LOGICAL_WIDTH / 2 - 80, LOGICAL_HEIGHT / 2 - 6, 3);
    }
    backend.present(); // HUD + screens composited onto the logical frame, then blit
  },
}).start();

// Prove the backend wiring is live; failures here must not stall the render loop.
void ensureAnonSession().catch((err: unknown) => {
  console.error('[phase0] backend session check failed:', err);
});
