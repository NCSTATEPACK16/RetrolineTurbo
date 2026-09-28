import type { TrackFileV2 } from './schema.js';

/**
 * Mirror mode: the same circuit reflected left-to-right. Every turn changes
 * direction, and everything placed by lateral offset (racing line, coins,
 * roadside scenery) swaps sides with it, so the generated road, racing line,
 * boxes and scenery all follow from the one flipped file (hard rule 3).
 */
export function mirrorTrackFile(file: TrackFileV2): TrackFileV2 {
  const side = { left: 'right', right: 'left', both: 'both' } as const;
  return {
    ...file,
    sections: file.sections.map((s) => ({ ...s, turn: -s.turn })),
    coins: file.coins.map((c) => ({ ...c, x: -c.x })),
    scenery: file.scenery.map((r) => ({ ...r, side: side[r.side] })),
    ...(file.racingLine ? { racingLine: file.racingLine.map((p) => ({ ...p, x: -p.x })) } : {}),
  };
}
