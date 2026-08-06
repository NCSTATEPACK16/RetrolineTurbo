import { generateTrack } from './generate.js';
import type { TrackFile } from './schema.js';

/**
 * The OutRun/TX-1 route pyramid (plan.md §10 Phase 7): 5 stages, stage s has
 * s+1 scenes, 15 scenes total; the 5 stage-5 scenes are the endings. Scenes
 * are generated TrackFiles; the unchosen branch of a fork is never built.
 * Everything here is pure — main.ts owns the wiring.
 */

export const STAGES = 5;
export const INITIAL_TIME_MS = 60_000; // provisional feel constants (gate-tuned)
export const STAGE_TIME_BONUS_MS = 35_000;
export const SPLIT_DURATION_SEGMENTS = 60;
export const BRANCH_LEAD_SEGMENTS = 100; // fork node sits this far before track end

export interface ScenePlan {
  stage: number; // 0-based
  idx: number; // scene index within the stage
  seed: number;
  name: string;
}

/** Deterministic 15-scene pyramid for a base seed. */
export function buildPyramid(baseSeed: number): ScenePlan[][] {
  const stages: ScenePlan[][] = [];
  for (let s = 0; s < STAGES; s++) {
    const row: ScenePlan[] = [];
    for (let i = 0; i <= s; i++) {
      row.push({ stage: s, idx: i, seed: baseSeed * 100 + s * 10 + i, name: `stage ${s + 1} scene ${i + 1}` });
    }
    stages.push(row);
  }
  return stages;
}

/** A scene's TrackFile: generated track + a 2-way fork (none on the last stage). */
export function sceneTrack(plan: ScenePlan): TrackFile {
  const file = generateTrack(plan.seed, { targetSegments: 650 });
  file.trackId = `s${plan.stage}-${plan.idx}-${plan.seed}`;
  file.stageName = plan.name;
  if (plan.stage < STAGES - 1) {
    const total = file.sections.reduce((n, sec) => n + sec.length, 0);
    file.branchPoint = {
      startSegment: total - BRANCH_LEAD_SEGMENTS,
      splitDurationSegments: SPLIT_DURATION_SEGMENTS,
      ways: 2,
    };
  }
  return file;
}

/** Path assignment at the node (plan.md §7: X_player < 0 → A, else B). */
export function resolveFork(playerX: number, ways: 2 | 3, roadWidth: number): number {
  if (ways === 2) return playerX < 0 ? 0 : 1;
  if (playerX < -roadWidth / 2) return 0;
  if (playerX > roadWidth / 2) return 2;
  return 1;
}

/** Pyramid descent: 2-way left keeps i / right takes i+1; 3-way maps i−1|i|i+1. */
export function nextSceneIdx(currentIdx: number, choice: number, ways: 2 | 3, nextStageScenes: number): number {
  const raw = ways === 2 ? currentIdx + choice : currentIdx + choice - 1;
  return Math.max(0, Math.min(nextStageScenes - 1, raw));
}

/** Route progress + checkpoint timer. Mutated only via its own methods. */
export class RouteState {
  readonly pyramid: ScenePlan[][];
  stage = 0;
  sceneIdx = 0;
  readonly visited: number[] = [];
  remainingMs = INITIAL_TIME_MS;
  private isFinished = false;
  private ending: number | null = null;

  constructor(baseSeed: number) {
    this.pyramid = buildPyramid(baseSeed);
  }

  get finished(): boolean {
    return this.isFinished;
  }

  get endingIdx(): number | null {
    return this.ending;
  }

  get expired(): boolean {
    return !this.isFinished && this.remainingMs <= 0;
  }

  currentPlan(): ScenePlan {
    return this.pyramid[this.stage]![this.sceneIdx]!;
  }

  /** Count the checkpoint timer down (frozen once finished). */
  tick(dtMs: number): void {
    if (this.isFinished) return;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
  }

  extend(ms: number): void {
    this.remainingMs += ms;
  }

  /** Take the fork: record the path, enter the next stage, extend the timer.
   * A no-op on the final stage (endings have no forks to take). */
  advance(choice: number): ScenePlan {
    if (this.stage >= STAGES - 1) return this.currentPlan();
    this.visited.push(this.sceneIdx);
    const next = this.stage + 1;
    // Shipped pyramid is 2-way throughout (3-way is engine-supported; spec §8).
    this.sceneIdx = nextSceneIdx(this.sceneIdx, choice, 2, this.pyramid[next]!.length);
    this.stage = next;
    this.extend(STAGE_TIME_BONUS_MS);
    return this.currentPlan();
  }

  /** Complete the final stage: the current scene is the ending (1 of 5). */
  finish(): void {
    this.isFinished = true;
    this.ending = this.sceneIdx;
  }
}
