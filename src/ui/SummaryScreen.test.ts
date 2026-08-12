import { describe, it, expect } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST, FONT_COLORS, glyphFrameName, type FontColor } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { computePayout } from '../economy/payout.js';
import { SummaryScreen } from './SummaryScreen.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const ledger = computePayout({
  stagesCleared: 5, finished: true, remainingMs: 20_000, points: 3000, collisions: 0,
});

describe('SummaryScreen', () => {
  it('renders nothing until shown', () => {
    const screen = new SummaryScreen(atlas);
    const backend = new RecordingBackend();
    expect(screen.visible).toBe(false);
    screen.render(backend);
    expect(backend.quads).toHaveLength(0);
    expect(backend.sprites).toHaveLength(0);
  });

  it('draws a panel and one glyph run per ledger line once shown', () => {
    const screen = new SummaryScreen(atlas);
    const backend = new RecordingBackend();
    screen.show('route complete', ledger, 4200);
    expect(screen.visible).toBe(true);
    screen.render(backend);
    expect(backend.quads.length).toBeGreaterThan(0);
    // title + 4 ledger lines + clean bonus + total + balance + prompt, all glyphs
    expect(backend.sprites.length).toBeGreaterThan(40);
  });

  it('omits the clean-bonus row when the multiplier is 1', () => {
    const dirty = computePayout({
      stagesCleared: 2, finished: false, remainingMs: 0, points: 0, collisions: 3,
    });
    const clean = new SummaryScreen(atlas);
    const dirtyScreen = new SummaryScreen(atlas);
    const a = new RecordingBackend();
    const b = new RecordingBackend();
    clean.show('route complete', ledger, 0);
    dirtyScreen.show('route complete', dirty, 0);
    clean.render(a);
    dirtyScreen.render(b);
    expect(a.sprites.length).toBeGreaterThan(b.sprites.length);
  });

  it('shows the clean bonus as credits, never as a decimal multiplier', () => {
    // The 3x5 font renders '.' as a colon, so "x1.1" would read as "x1:1".
    const screen = new SummaryScreen(atlas);
    const backend = new RecordingBackend();
    screen.show('route complete', ledger, 0);
    screen.render(backend);
    const subtotal = ledger.lines.reduce((sum, l) => sum + l.credits, 0);
    const bonus = ledger.total - subtotal;
    expect(bonus).toBeGreaterThan(0);
    // Every glyph drawn must come from the digit/letter sets — a colon frame in
    // any font colour would mean a decimal point slipped into the panel.
    const colons = (Object.keys(FONT_COLORS) as FontColor[])
      .map((c) => atlas.frame(glyphFrameName('glyph_colon', c)));
    expect(backend.sprites.some((s) => colons.some((f) => s.sx === f.x && s.sy === f.y))).toBe(false);
  });

  it('clear hides it again', () => {
    const screen = new SummaryScreen(atlas);
    screen.show('time up', ledger, 0);
    screen.clear();
    expect(screen.visible).toBe(false);
  });
});
