import { describe, it, expect } from 'vitest';
import { parseTrackFile, expandSections, formatTrackFile, type TrackFile } from './schema.js';

const valid: TrackFile = {
  trackId: 'test-track', stageName: 'Test', segmentLength: 200, roadWidth: 2000, lanes: 3,
  sections: [
    { length: 10, curve: 0, pitch: 0, sprites: [{ name: 'tree', offset: -1.6, every: 5 }] },
    { length: 5, curve: -2.5, pitch: 20 },
  ],
};

describe('parseTrackFile accepts', () => {
  it('a valid object and expands its segments', () => {
    const r = parseTrackFile(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.totalSegments).toBe(15);
    expect(r.track.file.trackId).toBe('test-track');
  });
  it('a valid JSON string', () => {
    expect(parseTrackFile(JSON.stringify(valid)).ok).toBe(true);
  });
  it('formatTrackFile round-trips through parse', () => {
    const r = parseTrackFile(formatTrackFile(valid));
    expect(r.ok).toBe(true);
  });
});

describe('parseTrackFile rejects with path-naming errors', () => {
  const mutate = (fn: (t: Record<string, unknown>) => void): unknown => {
    const t = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    fn(t);
    return t;
  };
  const errorsOf = (input: unknown): string[] => {
    const r = parseTrackFile(input);
    expect(r.ok).toBe(false);
    return r.ok ? [] : r.errors;
  };

  it('invalid JSON string', () => {
    expect(errorsOf('{nope')[0]).toMatch(/invalid JSON/);
  });
  it('non-object input', () => {
    expect(errorsOf(42)[0]).toMatch(/expected an object/);
  });
  it('missing required field', () => {
    expect(errorsOf(mutate((t) => { delete t['stageName']; })).join()).toMatch(/stageName/);
  });
  it('bad trackId charset', () => {
    expect(errorsOf(mutate((t) => { t['trackId'] = 'Bad Id!'; })).join()).toMatch(/trackId/);
  });
  it('non-finite curve, naming the section index', () => {
    const errs = errorsOf(mutate((t) => {
      (t['sections'] as Record<string, unknown>[])[1]!['curve'] = 'x';
    }));
    expect(errs.join()).toMatch(/sections\[1\]\.curve/);
  });
  it('empty sections array', () => {
    expect(errorsOf(mutate((t) => { t['sections'] = []; })).join()).toMatch(/sections/);
  });
  it('non-integer or < 1 section length', () => {
    expect(errorsOf(mutate((t) => {
      (t['sections'] as Record<string, unknown>[])[0]!['length'] = 0;
    })).join()).toMatch(/sections\[0\]\.length/);
  });
  it('unknown sprite name', () => {
    expect(errorsOf(mutate((t) => {
      ((t['sections'] as Record<string, unknown>[])[0]!['sprites'] as Record<string, unknown>[])[0]!['name'] = 'dragon';
    })).join()).toMatch(/sections\[0\]\.sprites\[0\]\.name.*dragon/);
  });
  it('sprite every < 1', () => {
    expect(errorsOf(mutate((t) => {
      ((t['sections'] as Record<string, unknown>[])[0]!['sprites'] as Record<string, unknown>[])[0]!['every'] = 0;
    })).join()).toMatch(/every/);
  });
  it('unknown keys (typo protection), $schema exempt', () => {
    expect(errorsOf(mutate((t) => { t['sectons'] = []; })).join()).toMatch(/sectons/);
    expect(parseTrackFile(mutate((t) => { t['$schema'] = 'x'; })).ok).toBe(true);
  });
  it('collects multiple errors in one pass', () => {
    const errs = errorsOf(mutate((t) => { delete t['stageName']; t['lanes'] = 0; }));
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('branchPoint validation', () => {
  const withBranch = (bp: unknown): unknown => ({ ...JSON.parse(JSON.stringify(valid)) as object, branchPoint: bp });
  it('accepts a well-formed branchPoint and carries it through', () => {
    const r = parseTrackFile(withBranch({ startSegment: 500, splitDurationSegments: 60, ways: 2 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.track.file.branchPoint).toEqual({ startSegment: 500, splitDurationSegments: 60, ways: 2 });
  });
  it('accepts null / absent (an ending)', () => {
    expect(parseTrackFile(withBranch(null)).ok).toBe(true);
    expect(parseTrackFile(valid).ok).toBe(true);
  });
  it('rejects bad shapes with paths', () => {
    expect(parseTrackFile(withBranch({ startSegment: -1, splitDurationSegments: 60, ways: 2 })).ok).toBe(false);
    expect(parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 0, ways: 2 })).ok).toBe(false);
    expect(parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 60, ways: 4 })).ok).toBe(false);
    const r = parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 60, ways: 2, extra: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/branchPoint\.extra/);
  });
});

describe('expandSections', () => {
  it('lays segments with z = index * segmentLength across section boundaries', () => {
    const segs = expandSections(valid);
    expect(segs.length).toBe(15);
    expect(segs[0]!.z).toBe(0);
    expect(segs[12]!.z).toBe(12 * 200);
    expect(segs[12]!.curve).toBe(-2.5);
    expect(segs[12]!.pitch).toBe(20);
  });
  it('applies sprite rules on section-local every-th segments', () => {
    const segs = expandSections(valid);
    expect(segs[0]!.sprites).toEqual([{ name: 'tree', offset: -1.6 }]);
    expect(segs[1]!.sprites).toEqual([]);
    expect(segs[5]!.sprites).toEqual([{ name: 'tree', offset: -1.6 }]);
    expect(segs[10]!.sprites).toEqual([]); // second section has no rules
  });
});
