import type { TrackDef } from '../sim/track.js';

/**
 * Tracer-bullet circuit: a plain oval (two straights, two 180-degree bends) so
 * the loop closes exactly. Replaced by Sunset Beach in issue v2-03.
 */
const STRAIGHT = 400;
const BEND = 220;

export const TRACER_OVAL: TrackDef = {
  name: 'tracer-oval',
  halfWidth: 9,
  sections: [
    { length: STRAIGHT, curvature: 0 },
    { length: BEND, curvature: Math.PI / BEND },
    { length: STRAIGHT, curvature: 0 },
    { length: BEND, curvature: Math.PI / BEND },
  ],
};
