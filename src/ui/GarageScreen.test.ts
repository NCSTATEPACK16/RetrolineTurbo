import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { GarageState } from '../economy/GarageState.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import { GarageScreen } from './GarageScreen.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

function openScreen(): { screen: GarageScreen; garage: GarageState; onChange: () => void } {
  const garage = new GarageState();
  garage.bestStage = 4;
  garage.credits = 100_000;
  const onChange = vi.fn();
  const screen = new GarageScreen(atlas, garage, PART_CATALOG, onChange);
  screen.toggle();
  return { screen, garage, onChange };
}

describe('GarageScreen contract', () => {
  it('starts closed, renders nothing, and swallows nothing', () => {
    const screen = new GarageScreen(atlas, new GarageState());
    const backend = new RecordingBackend();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('ArrowLeft')).toBe(false);
    screen.render(backend);
    expect(backend.sprites).toHaveLength(0);
  });

  it('swallows every key while open and closes on F6 or Escape', () => {
    const { screen } = openScreen();
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyZ')).toBe(true);
    expect(screen.handleKey('Escape')).toBe(true);
    expect(screen.open).toBe(false);
    screen.toggle();
    expect(screen.handleKey('F6')).toBe(true);
    expect(screen.open).toBe(false);
  });
});

describe('GarageScreen navigation', () => {
  it('left/right walks the four categories and wraps', () => {
    const { screen } = openScreen();
    expect(screen.highlighted.category).toBe('engine');
    screen.handleKey('ArrowRight');
    expect(screen.highlighted.category).toBe('transmission');
    screen.handleKey('ArrowLeft');
    screen.handleKey('ArrowLeft');
    expect(screen.highlighted.category).toBe('wheels');
  });

  it('up/down walks parts within the category and clamps at the ends', () => {
    const { screen } = openScreen();
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowUp');
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowDown');
    expect(screen.highlighted.tier).toBe(2);
  });

  it('remembers the selected part per category', () => {
    const { screen } = openScreen();
    screen.handleKey('ArrowDown');
    screen.handleKey('ArrowDown');
    screen.handleKey('ArrowRight');
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowLeft');
    expect(screen.highlighted.tier).toBe(3);
  });
});

describe('GarageScreen purchase flow', () => {
  it('Enter buys then equips, and notifies on change', () => {
    const { screen, garage, onChange } = openScreen();
    const part = screen.highlighted;
    screen.handleKey('Enter');
    expect(garage.owns(part.id)).toBe(true);
    expect(garage.equipped[part.category]).toBe(part.id);
    expect(onChange).toHaveBeenCalled();
  });

  it('Enter on a locked part changes nothing', () => {
    const garage = new GarageState();
    garage.bestStage = 0;
    garage.credits = 100_000;
    const onChange = vi.fn();
    const screen = new GarageScreen(atlas, garage, PART_CATALOG, onChange);
    screen.toggle();
    for (let i = 0; i < 19; i++) screen.handleKey('ArrowDown'); // tier 20, unlockStage 3
    expect(screen.highlighted.tier).toBe(20);
    screen.handleKey('Enter');
    expect(garage.owns(screen.highlighted.id)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GarageScreen rendering', () => {
  it('draws the panel, the part list and four stat-diff bars', () => {
    const { screen } = openScreen();
    const backend = new RecordingBackend();
    screen.handleKey('ArrowDown'); // a part that differs from the empty loadout
    screen.render(backend);
    expect(backend.quads.length).toBeGreaterThanOrEqual(5); // panel + 4 bars
    expect(backend.sprites.length).toBeGreaterThan(40);
  });
});
