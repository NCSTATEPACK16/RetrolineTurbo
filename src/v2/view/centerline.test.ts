import { describe, it, expect } from 'vitest';
import { buildSimTrack } from '../sim/track.js';
import { buildCenterline, poseAt, type Pose } from './centerline.js';
import { TRACER_OVAL } from '../track/tracer.js';

describe('v2 centreline', () => {
  const track = buildSimTrack(TRACER_OVAL);
  const c = buildCenterline(track, 1);
  const pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };

  it('closes the oval loop', () => {
    poseAt(c, track.length - 0.001, 0, pose);
    expect(Math.hypot(pose.x, pose.z)).toBeLessThan(0.5);
  });

  it('starts heading down -Z with +X to the right', () => {
    poseAt(c, 10, 0, pose);
    expect(pose.z).toBeCloseTo(-10, 5);
    poseAt(c, 10, 3, pose);
    expect(pose.x).toBeCloseTo(3, 5);
  });

  it('turns right on positive curvature', () => {
    poseAt(c, 400 + 110, 0, pose); // halfway round the first 180-degree bend
    expect(pose.heading).toBeCloseTo(Math.PI / 2, 2);
    expect(pose.x).toBeGreaterThan(0);
  });
});
