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
import { LocalStorageSaveBackend } from './economy/save.js';
import { RemapScreen, loadBindings } from './ui/RemapScreen.js';
import { EditorScreen } from './track/editor/EditorScreen.js';
import {
  DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y,
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
  { z: 4000, offset: -0.4, speed: 4000, sprite: 'car0' },
  { z: 9000, offset: 0.4, speed: 3500, sprite: 'car1' },
  { z: 15000, offset: 0, speed: 5000, sprite: 'car2' },
  { z: 22000, offset: -0.5, speed: 4500, sprite: 'car3' },
];
const traffic = new Traffic(cars, trackLength);

const save = new LocalStorageSaveBackend();
const input = new InputManager();
const vehicle = new Vehicle(DEFAULT_TRACK_CONFIG.roadWidth);
const remap = new RemapScreen(atlas, save, input);
const cmd = createCommand(); // pre-allocated; refilled each step (hard rule 4)

const editor = new EditorScreen(atlas, save, (t) => {
  // Config-compat rule: only activate tracks matching the engine config.
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    console.warn('[editor] track config mismatch; not activated:', t.file.trackId);
    return;
  }
  track.rebuild(t);
});
void editor.loadIndex();

const camera: Camera = {
  x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y,
};

void loadBindings(save).then((b) => { input.setBindings(b); });

// Screens see every key first (remap, then editor); leftovers drive the InputManager.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'F2' || input.isBound(e.code)) e.preventDefault();
  if (remap.handleKey(e.code)) return;
  if (editor.handleKey(e.code)) return;
  input.press(e.code);
});
// Clipboard edge for the editor (kept here so EditorScreen stays clipboard-free).
window.addEventListener('keydown', (e) => {
  if (!editor.open) return;
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

createLoop({
  update: (dt: number): void => {
    pollGamepad();
    input.read(cmd);
    if (remap.open || editor.open) { // pause driving while a screen is up
      cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0; cmd.handbrake = true;
    }

    const seg = track.segment(Math.floor(vehicle.z / DEFAULT_TRACK_CONFIG.segmentLength));
    vehicle.step(cmd, seg.curve, dt);
    elapsedMs += dt * 1000;
    traffic.update(dt);

    // Off-road drag is the Vehicle's own μ path; responseDelta applies on hits only.
    if (hitCar(vehicle, cars, cfg) != null) {
      const d = responseDelta({ offRoad: false, hit: true });
      vehicle.applyCollision(d.speedFactor, (vehicle.x >= 0 ? -1 : 1) * d.xPush * dt);
    }

    camera.z = vehicle.z;
    camera.x = vehicle.x;
  },
  render: (): void => {
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    renderer.render(camera, track, backend, background, traffic, track.segment(base).curve);
    hud.render(vehicle, elapsedMs, track, camera, backend);
    remap.render(backend);
    editor.render(backend);
    backend.present(); // HUD + screens composited onto the logical frame, then blit
  },
}).start();

// Prove the backend wiring is live; failures here must not stall the render loop.
void ensureAnonSession().catch((err: unknown) => {
  console.error('[phase0] backend session check failed:', err);
});
