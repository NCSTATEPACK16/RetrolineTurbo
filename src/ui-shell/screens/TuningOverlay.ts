/**
 * DEV-only live physics tuning overlay (plan: 2026-08-24-playable-pc-build, Task 7).
 *
 * Turns every feel question from an edit-rebuild-drive cycle into a slider drag.
 * `Copy constants` emits a paste-able `constants.ts` block, which is how a
 * tuning session ends up in the repo (Task 8 Step 3).
 *
 * Deliberately NOT a `ShellRouter` state and not mounted inside `#ui-shell`,
 * unlike every other screen here. `#ui-shell` is a full-bleed opaque panel that
 * `display:none`s itself whenever `router.state === 'playing'` — so a screen
 * living there is either hidden exactly when this overlay must be visible, or
 * covering the car it exists to tune. This mounts as its own fixed side panel
 * over the canvas instead.
 *
 * Its CSS is injected from here rather than added to `shell.css` for the same
 * reason the module is DEV-gated: `import.meta.env.DEV` folds to `false` in a
 * production build, the import goes unreferenced, and the whole file — styles
 * included — drops out of the bundle.
 */
import { buildSlider } from '../components/slider.js';
import type { VehicleParams } from '../../physics/Vehicle.js';
import type { TuningOverrides } from '../../physics/tuning.js';
import { DEFAULT_TUNING } from '../../physics/tuning.js';

export type TuningApply = (params: VehicleParams, overrides: TuningOverrides) => void;

export interface TuningOverlayHandle {
  readonly element: HTMLElement;
  toggle(): void;
  readonly visible: boolean;
  /** Current state, so a Vehicle rebuild can re-apply it (see main.ts). */
  readonly params: VehicleParams;
  readonly overrides: TuningOverrides;
}

interface FieldSpec {
  key: keyof TuningOverrides;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Name of the constant this maps to, for the Copy constants block. */
  constant: string;
}

/** Ranges bracket the shipped value rather than starting at it, so a session
 * can move a number in both directions without re-editing this file. */
const FIELDS: readonly FieldSpec[] = [
  { key: 'torqueShape', label: 'Torque shape', min: 0.1, max: 2, step: 0.05, constant: 'TORQUE_SHAPE' },
  { key: 'bogFactor', label: 'Bog factor', min: 0, max: 1, step: 0.05, constant: 'BOG_FACTOR' },
  { key: 'centrifugal', label: 'Centrifugal', min: 0, max: 3000, step: 25, constant: 'CENTRIFUGAL' },
  { key: 'steerRatePerS', label: 'Steer rate /s', min: 0.5, max: 20, step: 0.5, constant: 'STEER_RATE_PER_S' },
  { key: 'skidCurveThreshold', label: 'Skid curve threshold', min: 0, max: 2, step: 0.05, constant: 'SKID_CURVE_THRESHOLD' },
  { key: 'muOffroad', label: 'Off-road grip (mu)', min: 0.3, max: 1, step: 0.01, constant: 'MU_OFFROAD' },
];

interface GearSpec {
  key: 'gearMaxKmh' | 'gearMinKmh' | 'gearAccelKmhS';
  label: string;
  min: number;
  max: number;
  step: number;
  constant: string;
}

const GEAR_ROWS: readonly GearSpec[] = [
  { key: 'gearMaxKmh', label: 'Ceiling km/h', min: 30, max: 400, step: 5, constant: 'GEAR_MAX_KMH' },
  { key: 'gearMinKmh', label: 'Band floor km/h', min: 0, max: 320, step: 5, constant: 'GEAR_MIN_KMH' },
  { key: 'gearAccelKmhS', label: 'Peak accel km/h/s', min: 5, max: 200, step: 1, constant: 'GEAR_ACCEL_KMH_S' },
];

const PANEL_W = 320;

const CSS = `
/* Give the panel its own column instead of letting it sit on top of the game.
   #stage is 100vw with centred letterboxing, so narrowing it re-centres the
   canvas in what's left — at 320px overlap the panel covered the gear/speed
   readout and the PASSED CARS gauge, i.e. exactly what a gearbox tuning pass
   needs to watch. Scoped to the open state so the game is full-width otherwise. */
body[data-tuning="open"] #stage { width: calc(100vw - ${PANEL_W}px); }

#rt-tuning {
  position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W}px; z-index: 20;
  overflow-y: auto; padding: 12px 14px; box-sizing: border-box;
  background: rgba(10, 12, 24, 0.92); color: #e8ecff;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  border-left: 1px solid rgba(140, 160, 255, 0.35);
}
#rt-tuning[data-hidden="true"] { display: none; }
#rt-tuning h2 { margin: 0 0 4px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
#rt-tuning .rt-tune-hint { margin: 0 0 12px; opacity: 0.6; font-size: 11px; }
#rt-tuning h3 { margin: 14px 0 6px; font-size: 11px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.08em; }
#rt-tuning label { display: block; margin-bottom: 10px; }
#rt-tuning .rt-tune-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
#rt-tuning .rt-tune-val { font-variant-numeric: tabular-nums; opacity: 0.9; }
#rt-tuning input[type="range"] { width: 100%; margin: 0; }
#rt-tuning button {
  width: 100%; margin-top: 10px; padding: 7px 10px; cursor: pointer;
  background: #2a3468; color: #e8ecff; border: 1px solid rgba(140, 160, 255, 0.5);
  border-radius: 6px; font: inherit;
}
#rt-tuning button:hover { background: #35418a; }
#rt-tuning .rt-tune-status { min-height: 16px; margin-top: 6px; font-size: 11px; opacity: 0.75; }
`;

function injectStyles(): void {
  if (document.getElementById('rt-tuning-style')) return;
  const style = document.createElement('style');
  style.id = 'rt-tuning-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** `[90, 150, 220, 290] as const` — matching how constants.ts already writes them. */
function formatArray(name: string, values: readonly number[]): string {
  return `export const ${name} = [${values.join(', ')}] as const;`;
}

function formatScalar(name: string, value: number): string {
  return `export const ${name} = ${value};`;
}

/**
 * Builds the paste-able block for Task 8 Step 3. Exported for testing: this is
 * the one part of the overlay that is pure string math and therefore reachable
 * from this repo's `environment: 'node'` vitest run, where the DOM is not.
 */
export function buildConstantsBlock(params: VehicleParams, overrides: TuningOverrides): string {
  const lines: string[] = ['// --- tuned via the DEV overlay; paste into src/constants.ts ---'];
  for (const row of GEAR_ROWS) lines.push(formatArray(row.constant, params[row.key]));
  lines.push(formatScalar('CENTRIFUGAL', overrides.centrifugal ?? params.centrifugal));
  for (const f of FIELDS) {
    if (f.key === 'centrifugal') continue; // already emitted from params above
    lines.push(formatScalar(f.constant, overrides[f.key] ?? DEFAULT_TUNING[f.key as keyof typeof DEFAULT_TUNING]));
  }
  return lines.join('\n');
}

export function createTuningOverlay(base: VehicleParams, apply: TuningApply): TuningOverlayHandle {
  injectStyles();

  // Copied, never aliased: the overlay must not mutate DEFAULT_VEHICLE_PARAMS,
  // which every stock Vehicle in the process shares.
  const params: VehicleParams = {
    ...base,
    gearMaxKmh: [...base.gearMaxKmh],
    gearMinKmh: [...base.gearMinKmh],
    gearAccelKmhS: [...base.gearAccelKmhS],
  };
  const overrides: TuningOverrides = {};

  const el = document.createElement('aside');
  el.id = 'rt-tuning';
  el.setAttribute('data-hidden', 'true');

  const title = document.createElement('h2');
  title.textContent = 'Tuning (dev)';
  const hint = document.createElement('p');
  hint.className = 'rt-tune-hint';
  hint.textContent = 'F8 closes. Changes apply live — the car keeps its speed.';
  el.append(title, hint);

  const push = (): void => { apply(params, overrides); };

  /** One labelled slider whose readout updates as it moves. */
  const addSlider = (
    label: string, value: number, min: number, max: number, step: number,
    onInput: (v: number) => void,
  ): void => {
    const wrap = document.createElement('label');
    const row = document.createElement('span');
    row.className = 'rt-tune-row';
    const name = document.createElement('span');
    name.textContent = label;
    const readout = document.createElement('span');
    readout.className = 'rt-tune-val';
    readout.textContent = String(value);
    row.append(name, readout);
    const slider = buildSlider(value, min, max, step, (v) => {
      readout.textContent = String(v);
      onInput(v);
      push();
    });
    wrap.append(row, slider);
    el.appendChild(wrap);
  };

  const feel = document.createElement('h3');
  feel.textContent = 'Feel';
  el.appendChild(feel);
  for (const f of FIELDS) {
    const current = f.key === 'centrifugal'
      ? params.centrifugal
      : DEFAULT_TUNING[f.key as keyof typeof DEFAULT_TUNING];
    addSlider(f.label, current, f.min, f.max, f.step, (v) => { overrides[f.key] = v; });
  }

  for (let g = 0; g < params.gearMaxKmh.length; g++) {
    const head = document.createElement('h3');
    head.textContent = `Gear ${g + 1}`;
    el.appendChild(head);
    for (const row of GEAR_ROWS) {
      addSlider(row.label, params[row.key][g]!, row.min, row.max, row.step, (v) => {
        // Written back onto the same array the Vehicle's GearTable references,
        // so a gear change needs no rebuild either.
        (params[row.key] as number[])[g] = v;
      });
    }
  }

  const status = document.createElement('p');
  status.className = 'rt-tune-status';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy constants';
  copy.addEventListener('click', () => {
    const text = buildConstantsBlock(params, overrides);
    void navigator.clipboard?.writeText(text)
      .then(() => { status.textContent = 'Copied to clipboard.'; })
      .catch(() => {
        // Clipboard needs a secure context and can be denied outright; the
        // console is a fine fallback for a dev tool and loses no work.
        console.log(text);
        status.textContent = 'Clipboard blocked — logged to console.';
      });
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset to shipped values';
  reset.addEventListener('click', () => {
    for (const k of Object.keys(overrides) as (keyof TuningOverrides)[]) delete overrides[k];
    Object.assign(params, {
      ...base,
      gearMaxKmh: [...base.gearMaxKmh],
      gearMinKmh: [...base.gearMinKmh],
      gearAccelKmhS: [...base.gearAccelKmhS],
    });
    push();
    status.textContent = 'Reset — reopen (F8 twice) to resync the sliders.';
  });

  el.append(copy, reset, status);

  let visible = false;
  return {
    element: el,
    toggle(): void {
      visible = !visible;
      el.setAttribute('data-hidden', String(!visible));
      if (visible) document.body.dataset.tuning = 'open';
      else delete document.body.dataset.tuning;
    },
    get visible(): boolean { return visible; },
    get params(): VehicleParams { return params; },
    get overrides(): TuningOverrides { return overrides; },
  };
}
