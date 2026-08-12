import type { PlayerState } from '../types/engine.js';
import { computeEngineTone, squealGain } from './engineTone.js';
import {
  GEAR_MAX_KMH, KMH_PER_WORLD,
  ENGINE_F_BASE_LOW, ENGINE_F_BASE_HIGH, ENGINE_F_RANGE,
  ENGINE_FILTER_MIN_HZ, ENGINE_FILTER_MAX_HZ, ENGINE_GAIN,
  SQUEAL_FILTER_HZ, SQUEAL_GAIN_MAX,
  AUDIO_RAMP_S, MUSIC_BUS_GAIN, SFX_BUS_GAIN,
  COLLISION_CUE_GAIN, COLLISION_CUE_DECAY_S,
} from '../constants.js';

type AudioContextCtor = new () => AudioContext;

/** A short burst of white noise, used for both the looped tire squeal and the
 * one-shot collision cue — no audio asset exists to load, so both cues are
 * synthesized rather than sampled. */
function buildNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Web Audio edge module (spec: docs/superpowers/specs/2026-08-12-phase-10-audio.md).
 *
 * Owns one persistent AudioContext + node graph, built once and never torn
 * down (Hard rule 4 applied to the audio graph — no per-frame node churn for
 * the continuous engine/squeal path). `step` is meant to be polled once per
 * rendered frame from main.ts, not the fixed physics step; Web Audio doesn't
 * need 60Hz-exact timing.
 *
 * Never throws. No AudioContext support — this repo's own vitest environment
 * (`environment: 'node'`, no DOM), an old browser, a locked-down embed —
 * degrades the whole engine to a set of safe no-ops rather than crashing the
 * game, the same contract `loadAtlases.ts`/`net/supabase.ts` hold for their
 * own missing-capability cases.
 *
 * Scope note: the spec's "hybrid streamed music / preloaded SFX-from-file"
 * layer is not built here. No music or SFX asset files exist anywhere in this
 * repo to drive it, and wiring a generic loader with nothing to call it would
 * be dead code. The engine tone, tire squeal, and collision cue below are all
 * procedurally synthesized and need no asset pipeline; the music/SFX bus
 * split they route through is real and ready for real files whenever a
 * future session has content to load.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicVolume = MUSIC_BUS_GAIN;
  private sfxVolume = SFX_BUS_GAIN;

  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private squealGainNode: GainNode | null = null;

  constructor() {
    const g = globalThis as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (typeof Ctor !== 'function') return; // no Web Audio support: stays fully inert
    try {
      const ctx = new Ctor();
      this.buildGraph(ctx);
      this.ctx = ctx; // only commit once the whole graph built cleanly
    } catch (err) {
      console.error('[audio] setup failed, disabling SoundEngine:', err);
      this.ctx = null;
    }
  }

  private buildGraph(ctx: AudioContext): void {
    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS_GAIN;
    musicBus.connect(ctx.destination);
    this.musicBus = musicBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_BUS_GAIN;
    sfxBus.connect(ctx.destination);
    this.sfxBus = sfxBus;

    // Engine tone: sawtooth -> lowpass -> gain -> SFX bus. Built once; `step`
    // only ever ramps the existing AudioParams afterward.
    const engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = ENGINE_F_BASE_LOW;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = ENGINE_FILTER_MIN_HZ;
    const engineGain = ctx.createGain();
    engineGain.gain.value = ENGINE_GAIN;
    engineOsc.connect(engineFilter).connect(engineGain).connect(sfxBus);
    engineOsc.start();
    this.engineOsc = engineOsc;
    this.engineFilter = engineFilter;

    // Tire squeal: looped white noise -> highpass -> gain -> SFX bus, gated to
    // 0 until a skid actually needs it.
    const squealSource = ctx.createBufferSource();
    squealSource.buffer = buildNoiseBuffer(ctx);
    squealSource.loop = true;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'highpass';
    squealFilter.frequency.value = SQUEAL_FILTER_HZ;
    const squealGainNode = ctx.createGain();
    squealGainNode.gain.value = 0;
    squealSource.connect(squealFilter).connect(squealGainNode).connect(sfxBus);
    squealSource.start();
    this.squealGainNode = squealGainNode;
  }

  /** Resume the AudioContext from an existing user-gesture handler (main.ts's
   * pointer-lock click). Autoplay policy suspends every context until one
   * fires; calling this outside a gesture, or with no context, is harmless. */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  /** 'engine' addresses the sfxBus (engine tone + squeal + collision cue all route
   * through it today — there is no separate engine-only bus); 'music' addresses
   * musicBus. Works identically with or without a live AudioContext. */
  getVolume(bus: 'engine' | 'music'): number {
    return bus === 'music' ? this.musicVolume : this.sfxVolume;
  }

  setVolume(bus: 'engine' | 'music', value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (bus === 'music') {
      this.musicVolume = clamped;
      if (this.musicBus) this.musicBus.gain.value = clamped;
    } else {
      this.sfxVolume = clamped;
      if (this.sfxBus) this.sfxBus.gain.value = clamped;
    }
  }

  /** Poll once per rendered frame. Reads PlayerState only — never writes back.
   * gearMaxKmh here is the stock GEAR_MAX_KMH, not whatever a Phase 9 loadout
   * actually caps at: pitch only needs a 0..1 ratio, so an equipped part that
   * shifts the real ceiling just saturates the tone slightly early or late —
   * cosmetic, not a correctness bug worth widening PlayerState over. */
  step(state: PlayerState): void {
    if (!this.ctx || !this.engineOsc || !this.engineFilter || !this.squealGainNode) return;
    const kmh = state.speed * KMH_PER_WORLD;
    const tone = computeEngineTone(kmh, state.gear, GEAR_MAX_KMH, {
      fBaseLow: ENGINE_F_BASE_LOW,
      fBaseHigh: ENGINE_F_BASE_HIGH,
      fRange: ENGINE_F_RANGE,
      filterMinHz: ENGINE_FILTER_MIN_HZ,
      filterMaxHz: ENGINE_FILTER_MAX_HZ,
    });
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(tone.frequency, now, AUDIO_RAMP_S);
    this.engineFilter.frequency.setTargetAtTime(tone.cutoff, now, AUDIO_RAMP_S);

    const gain = squealGain(state.skidding, state.skidMagnitude, SQUEAL_GAIN_MAX);
    this.squealGainNode.gain.setTargetAtTime(gain, now, AUDIO_RAMP_S);
  }

  /** One-shot cue for a fresh collision. Call exactly once per new contact
   * (ContactLatch.enter() semantics), not once per step a bump spans.
   * Allocates a short-lived node pair per call — collisions are a rare
   * discrete event, not a per-frame one, so hard rule 4 (no per-frame
   * allocation) doesn't apply here the way it does to the continuous
   * engine/squeal graph above. */
  collisionCue(): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buildNoiseBuffer(ctx, COLLISION_CUE_DECAY_S);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(COLLISION_CUE_GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + COLLISION_CUE_DECAY_S);
    src.connect(gain).connect(this.sfxBus);
    src.start();
    src.stop(ctx.currentTime + COLLISION_CUE_DECAY_S);
  }
}
