import { Canvas2DBackend } from './engine/Canvas2DBackend.js';
import { createLoop } from './physics/loop.js';
import { ensureAnonSession } from './net/supabase.js';

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

// --- Temporary Phase-0 diagnostics: confirm the fixed 60Hz cadence. ----------
// Remove once Phase 1+ draws real content. Counts fixed sim steps vs rendered
// frames over each real second and logs the rates.
let simSteps = 0;
let frames = 0;
let windowStart = performance.now();

const loop = createLoop({
  update: (_dt: number): void => {
    simSteps++;
  },
  render: (_alpha: number): void => {
    backend.clear('#101018'); // blank framebuffer — proves the pipeline ticks
    backend.present();
    frames++;

    const now = performance.now();
    if (now - windowStart >= 1000) {
      // eslint-disable-next-line no-console
      console.log(`[phase0] sim ${simSteps} steps/s · render ${frames} fps`);
      simSteps = 0;
      frames = 0;
      windowStart = now;
    }
  },
});

loop.start();

// Prove the backend wiring is live; failures here must not stall the render loop.
void ensureAnonSession().catch((err: unknown) => {
  console.error('[phase0] backend session check failed:', err);
});
