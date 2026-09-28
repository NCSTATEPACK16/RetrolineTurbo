import { describe, it, expect } from 'vitest';
import { PORTRAITS, PORTRAIT_SIZE, composePortrait } from './portraits.js';
import { ROSTER } from '../../sim/roster.js';

const MOODS = ['neutral', 'happy', 'angry'] as const;
const diff = (a: string[], b: string[]) => a.reduce((n, row, y) => n + [...row].filter((c, x) => c !== b[y]![x]).length, 0);

describe('driver portraits', () => {
  it('every driver on the roster (and the player) has one', () => {
    for (const d of ROSTER) expect(PORTRAITS[d.id], d.id).toBeDefined();
    expect(PORTRAITS.player).toBeDefined();
  });

  it('are 16x16 (32px at 2x) with known palette keys', () => {
    for (const [id, art] of Object.entries(PORTRAITS)) {
      expect(art.rows, id).toHaveLength(PORTRAIT_SIZE);
      for (const r of art.rows) expect(r, id).toMatch(/^[.kPwstneEglyOcbr]{16}$/);
    }
  });

  it('each mood reads differently, and eyes and mouth land on the face', () => {
    for (const [id, art] of Object.entries(PORTRAITS)) {
      const [n, h, a] = MOODS.map((m) => composePortrait(art, m));
      expect(diff(n!, h!), `${id} happy`).toBeGreaterThanOrEqual(4);
      expect(diff(n!, a!), `${id} angry`).toBeGreaterThanOrEqual(4);
      expect(diff(h!, a!), `${id} happy/angry`).toBeGreaterThanOrEqual(6);
      const [ey, el, er] = art.eyes;
      for (const x of [el, er]) expect(art.rows[ey]![x], `${id} eye`).not.toBe('.');
      const [my, mx, mw] = art.mouth;
      for (let x = mx; x < mx + mw; x++) expect(art.rows[my]![x], `${id} mouth`).not.toBe('.');
    }
  });

  it('silhouettes are distinct: no two drivers share a shape', () => {
    const sil = (id: string) => PORTRAITS[id]!.rows.map((r) => r.replace(/[^.]/g, '#'));
    const ids = Object.keys(PORTRAITS).filter((id) => id !== 'player');
    for (const a of ids) for (const b of ids) if (a < b) {
      const shapes = diff(sil(a), sil(b));
      const colours = diff([...PORTRAITS[a]!.rows], [...PORTRAITS[b]!.rows]);
      expect(shapes >= 12 || colours >= 60, `${a} vs ${b}`).toBe(true);
    }
  });
});
