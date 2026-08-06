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
import { isOffRoad, hitCar, responseDelta } from './engine/Collision.js';
import {
  DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y,
} from './constants.js';
import type { Camera, PlayerState } from './types/engine.js';

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

// --- Phase 4 harness: PlayerState seam + sprites/traffic/collision/HUD --------
// Still throwaway wiring (real physics arrives in Phase 5), but every consumer
// now reads the same PlayerState the Vehicle will implement unchanged.
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

// Mutable backing for the PlayerState seam. Phase 5: replaced by Vehicle.
const player = { z: 0, x: 0, speed: 12000, gear: 2 };
const playerView: PlayerState = player; // readonly view handed to consumers
const camera: Camera = {
  x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y,
};

let steer = 0;
let throttle = 1;
let elapsedMs = 0;

// Throwaway debug input: A/D steer, W/S throttle 0..1. Removed in Phase 5.
window.addEventListener('keydown', (e) => {
  if (e.key === 'a') steer = -1;
  else if (e.key === 'd') steer = 1;
  else if (e.key === 'w') throttle = Math.min(1, throttle + 0.25);
  else if (e.key === 's') throttle = Math.max(0, throttle - 0.25);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'd') steer = 0;
});

const cfg = {
  roadWidth: DEFAULT_TRACK_CONFIG.roadWidth,
  segmentLength: DEFAULT_TRACK_CONFIG.segmentLength,
  carHalfWidthPx: 900,
};

createLoop({
  update: (dt: number): void => {
    elapsedMs += dt * 1000;
    player.speed = 12000 * throttle;
    player.z += player.speed * dt;
    player.x += steer * 2000 * dt;
    traffic.update(dt);

    const ev = { offRoad: isOffRoad(player.x, cfg.roadWidth), hit: hitCar(playerView, cars, cfg) != null };
    const d = responseDelta(ev);
    player.speed *= d.speedFactor;
    player.x += (player.x >= 0 ? -1 : 1) * d.xPush * dt * (ev.hit ? 1 : 0);

    camera.z = player.z;
    camera.x = player.x;
  },
  render: (): void => {
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    renderer.render(camera, track, backend, background, traffic, track.segment(base).curve);
    hud.render(playerView, elapsedMs, track, camera, backend);
    backend.present(); // HUD composited onto the logical frame, then blit
  },
}).start();

// Prove the backend wiring is live; failures here must not stall the render loop.
void ensureAnonSession().catch((err: unknown) => {
  console.error('[phase0] backend session check failed:', err);
});
