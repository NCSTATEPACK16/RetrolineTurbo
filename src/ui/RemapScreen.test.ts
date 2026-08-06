import { describe, it, expect } from 'vitest';
import { RemapScreen, loadBindings, BINDINGS_KEY } from './RemapScreen.js';
import { InputManager, DEFAULT_BINDINGS, serializeBindings, rebind } from '../input/InputManager.js';
import { MemorySaveBackend } from '../economy/save.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const make = () => {
  const save = new MemorySaveBackend();
  const input = new InputManager();
  return { save, input, screen: new RemapScreen(atlas, save, input) };
};

describe('RemapScreen state machine', () => {
  it('opens and closes on Tab, consuming the key only while relevant', () => {
    const { screen } = make();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false); // closed: driving keys pass through
    expect(screen.handleKey('Tab')).toBe(true);
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyW')).toBe(true); // open: everything is consumed
    expect(screen.handleKey('Escape')).toBe(true);
    expect(screen.open).toBe(false);
  });

  it('captures the next key for the selected action and updates the InputManager', async () => {
    const { screen, input } = make();
    screen.handleKey('Tab');
    screen.handleKey('Enter'); // capture for the first action (throttle)
    expect(screen.capturing).toBe(true);
    screen.handleKey('KeyJ');
    await screen.lastPersist;
    expect(screen.capturing).toBe(false);
    expect(input.bindings.throttle[0]).toBe('KeyJ');
  });

  it('Escape cancels a capture without rebinding', () => {
    const { screen, input } = make();
    screen.handleKey('Tab');
    screen.handleKey('Enter');
    screen.handleKey('Escape');
    expect(screen.capturing).toBe(false);
    expect(input.bindings.throttle[0]).toBe('KeyW');
  });

  it('a rebind round-trips through the SaveBackend (persists across "reload")', async () => {
    const { screen, save } = make();
    screen.handleKey('Tab');
    screen.handleKey('ArrowDown'); // select brake
    screen.handleKey('Enter');
    screen.handleKey('KeyK');
    await screen.lastPersist;
    const reloaded = await loadBindings(save); // fresh session against the same store
    expect(reloaded.brake[0]).toBe('KeyK');
    expect(reloaded.throttle[0]).toBe('KeyW');
  });
});

describe('loadBindings fallback', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await loadBindings(new MemorySaveBackend())).toEqual(DEFAULT_BINDINGS);
  });
  it('returns defaults when the stored JSON is malformed', async () => {
    const save = new MemorySaveBackend();
    await save.set(BINDINGS_KEY, '{broken');
    expect(await loadBindings(save)).toEqual(DEFAULT_BINDINGS);
  });
  it('returns the stored table when valid', async () => {
    const save = new MemorySaveBackend();
    const custom = rebind(DEFAULT_BINDINGS, 'nitro', 'KeyN');
    await save.set(BINDINGS_KEY, serializeBindings(custom));
    expect(await loadBindings(save)).toEqual(custom);
  });
});

describe('RemapScreen render', () => {
  it('draws nothing when closed', () => {
    const { screen } = make();
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.sprites.length).toBe(0);
    expect(b.quads.length).toBe(0);
  });
  it('draws a backdrop and one text row per action when open', () => {
    const { screen } = make();
    screen.handleKey('Tab');
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.quads.length).toBeGreaterThan(0);
    expect(b.sprites.length).toBeGreaterThan(8 * 3); // ≥ a few glyphs per row × 8 rows
  });
});
