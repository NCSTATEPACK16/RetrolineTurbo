import { Canvas2DBackend } from './engine/Canvas2DBackend.js';
import { createLoop } from './physics/loop.js';
import { ensureAnonSession } from './net/supabase.js';
import { Renderer } from './engine/Renderer.js';
import { TrackManager } from './engine/TrackManager.js';
import { Background } from './engine/Background.js';
import { generateAtlas } from './assets/generateSprites.js';
import { SpriteAtlas } from './engine/SpriteAtlas.js';
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

// --- Temporary Phase 2/3 camera harness (replaced by real physics in Phase 5) ---
const { image, frames } = generateAtlas();
const atlas = new SpriteAtlas(image, frames);
const track = new TrackManager(DEFAULT_TRACK_CONFIG);
const background = new Background();
const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);

const camera: Camera = {
  x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y,
};
const autoSpeed = 12000; // world units/sec — retune during the visual gate

// Throwaway debug input: A/D steer, W/S change auto-speed. Removed in Phase 5.
let steer = 0;
let speedScale = 1;
window.addEventListener('keydown', (e) => {
  if (e.key === 'a') steer = -1;
  else if (e.key === 'd') steer = 1;
  else if (e.key === 'w') speedScale = Math.min(3, speedScale + 0.25);
  else if (e.key === 's') speedScale = Math.max(0, speedScale - 0.25);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'd') steer = 0;
});

const loop = createLoop({
  update: (dt: number): void => {
    camera.z += autoSpeed * speedScale * dt;
    camera.x += steer * 2000 * dt;
  },
  render: (_alpha: number): void => {
    // The Renderer owns the whole frame (§7 order): clear → background → road → present.
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    renderer.render(camera, track, backend, background, undefined, track.segment(base).curve);
  },
});

loop.start();

// Prove the backend wiring is live; failures here must not stall the render loop.
void ensureAnonSession().catch((err: unknown) => {
  console.error('[phase0] backend session check failed:', err);
});
