import { describe, it, expect } from 'vitest';
import { FONT, FONT_W, FONT_H, ICONS, ITEM_ICON, hasGlyph, textWidthPx, ordinal, positionColor, fitPoints } from './pixels.js';
import { Popups, POPUP_TICKS } from './popups.js';
import { createWorld } from '../../sim/world.js';
import { createRace } from '../../sim/race.js';
import { buildSimTrack } from '../../sim/track.js';

describe('HUD pixel data', () => {
  it('every glyph is 3x5 and uses only ink or blank', () => {
    for (const [ch, rows] of Object.entries(FONT)) {
      expect(rows, ch).toHaveLength(FONT_H);
      for (const r of rows) expect(r, ch).toMatch(new RegExp(`^[#.]{${FONT_W}}$`));
    }
  });

  it('covers everything the HUD writes', () => {
    for (const text of ['1ST', '2ND', '3RD', '8TH', '3/3', 'GO!', '0:12.34', 'JR']) {
      for (const ch of text) expect(hasGlyph(ch), `${text}:${ch}`).toBe(true);
    }
  });

  it('every icon is 11x11 with known colour keys, and each item has one', () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(11);
      for (const r of rows) expect(r, name).toMatch(/^[.wkyorcmgb]{11}$/);
    }
    for (const n of ITEM_ICON.slice(1)) expect(ICONS[n]).toBeDefined();
  });

  it('measures text and names positions', () => {
    expect(textWidthPx('12')).toBe(7);
    expect(ordinal(1)).toBe('ST');
    expect(ordinal(2)).toBe('ND');
    expect(ordinal(5)).toBe('TH');
    expect(positionColor(1)).toBe('y');
    expect(positionColor(2)).toBe('g');
    expect(positionColor(7)).toBe('w');
  });

  it('fits a track outline inside the mini-map box, keeping its shape', () => {
    const xs = [0, 100, 100, 0], zs = [0, 0, 50, 50];
    const f = fitPoints(xs, zs, 64, 48, 2);
    for (let i = 0; i < 4; i++) {
      const sx = (xs[i]! - f.minX) * f.scale + f.ox, sy = (zs[i]! - f.minZ) * f.scale + f.oy;
      expect(sx).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(sx).toBeLessThanOrEqual(62 + 1e-9);
      expect(sy).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(sy).toBeLessThanOrEqual(46 + 1e-9);
    }
    expect(f.scale).toBeCloseTo(0.6, 5); // width-limited: aspect kept, not stretched
  });
});

describe('portrait pop-ups', () => {
  const track = buildSimTrack({ name: 't', halfWidth: 9, sections: [{ length: 1000, curvature: 0 }] });
  const setup = () => {
    const w = createWorld(3);
    const race = createRace(w, track, { rows: 2, columns: 2, rowGap: 8, columnGap: 6 }, [0, 1, 2], [false, false, true], 3);
    race.phase = 'racing';
    return { w, race };
  };

  it('shows the driver you just passed, annoyed, then clears', () => {
    const { w, race } = setup();
    const p = new Popups();
    race.order.splice(0, 3, 0, 1, 2);
    race.racers[2]!.position = 3;
    p.update(race, w, 2, 0);
    w.tick++;
    race.order.splice(0, 3, 0, 2, 1);
    race.racers[2]!.position = 2;
    p.update(race, w, 2, 0);
    expect(p.current).toEqual({ car: 1, mood: 'angry', ticks: POPUP_TICKS });
    for (let t = 0; t < POPUP_TICKS; t++) { w.tick++; p.update(race, w, 2, 0); }
    expect(p.current).toBeNull();
  });

  it('shows a gloating face when you get hit', () => {
    const { w, race } = setup();
    const p = new Popups();
    race.order.splice(0, 3, 0, 2, 1);
    race.racers[2]!.position = 2;
    p.update(race, w, 2, 0);
    w.tick++;
    p.update(race, w, 2, 1);
    expect(p.current?.mood).toBe('happy');
    expect(p.current?.car).toBe(0);
  });
});
