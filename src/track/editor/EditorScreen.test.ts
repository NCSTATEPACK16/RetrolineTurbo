import { describe, it, expect } from 'vitest';
import { EditorScreen, TRACK_KEY_PREFIX, TRACK_INDEX_KEY } from './EditorScreen.js';
import { MemorySaveBackend } from '../../economy/save.js';
import { SpriteAtlas } from '../../engine/SpriteAtlas.js';
import { packAtlas } from '../../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../../assets/spriteManifest.js';
import { RecordingBackend } from '../../engine/testing/RecordingBackend.js';
import { DEFAULT_TRACK_FILE } from '../tracks.js';
import { formatTrackFile, type ParsedTrack } from '../schema.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const make = (activate: (t: ParsedTrack) => boolean = () => true) => {
  const save = new MemorySaveBackend();
  const changes: ParsedTrack[] = [];
  const screen = new EditorScreen(atlas, save, (t) => { changes.push(t); return activate(t); });
  return { save, screen, changes };
};
const opened = () => {
  const m = make();
  m.screen.handleKey('F2');
  return m;
};

describe('EditorScreen toggle + consumption', () => {
  it('is closed by default, opens on F2, passes keys through when closed', () => {
    const { screen } = make();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false);
    expect(screen.handleKey('F2')).toBe(true);
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyW')).toBe(true); // open swallows everything
    screen.handleKey('Escape');
    expect(screen.open).toBe(false);
  });
});

describe('section editing fires live rebuilds', () => {
  it('adjusting length re-expands and notifies', () => {
    const { screen, changes } = opened();
    const before = screen.working.sections[0]!.length;
    screen.handleKey('ArrowRight'); // focused field starts at length, +5
    expect(screen.working.sections[0]!.length).toBe(before + 5);
    expect(changes.length).toBe(1);
    expect(changes[0]!.totalSegments).toBe(605); // default 600 + 5
  });
  it('cycling to curve and adjusting steps by 0.5', () => {
    const { screen } = opened();
    screen.handleKey('BracketRight'); // length → curve
    screen.handleKey('ArrowRight');
    expect(screen.working.sections[0]!.curve).toBe(0.5);
  });
  it('length clamps at 1', () => {
    const { screen } = opened();
    for (let i = 0; i < 30; i++) screen.handleKey('ArrowLeft');
    expect(screen.working.sections[0]!.length).toBe(1);
  });
  it('add, duplicate, delete respect bounds', () => {
    const { screen } = opened();
    const n0 = screen.working.sections.length;
    screen.handleKey('KeyN');
    expect(screen.working.sections.length).toBe(n0 + 1);
    screen.handleKey('KeyD');
    expect(screen.working.sections.length).toBe(n0 + 2);
    for (let i = 0; i < n0 + 5; i++) screen.handleKey('KeyX');
    expect(screen.working.sections.length).toBe(1); // never below 1
  });
  it('editing never mutates DEFAULT_TRACK_FILE (deep working copy)', () => {
    const { screen } = opened();
    screen.handleKey('ArrowRight');
    expect(DEFAULT_TRACK_FILE.sections[0]!.length).toBe(60);
  });
  it('preset cycling from custom visits every preset in order, both directions', () => {
    const { screen } = opened();
    // Focus the preset field (length → curve → pitch → preset).
    screen.handleKey('BracketRight');
    screen.handleKey('BracketRight');
    screen.handleKey('BracketRight');
    const spritesOf = () => screen.working.sections[0]!.sprites;
    screen.handleKey('ArrowRight'); // custom → none
    expect(spritesOf()).toBeUndefined();
    screen.handleKey('ArrowRight'); // none → sparse
    expect(spritesOf()!.map((s) => s.name)).toEqual(['tree', 'rock']);
    screen.handleKey('ArrowRight'); // sparse → trees
    expect(spritesOf()!.map((s) => s.name)).toEqual(['tree', 'tree']);
    screen.handleKey('ArrowRight'); // trees → mixed
    expect(spritesOf()!.map((s) => s.name)).toEqual(['tree', 'bush', 'rock']);
    screen.handleKey('ArrowRight'); // mixed → wraps to none
    expect(spritesOf()).toBeUndefined();
    screen.handleKey('ArrowLeft'); // none → wraps back to mixed
    expect(spritesOf()!.map((s) => s.name)).toEqual(['tree', 'bush', 'rock']);
  });
  it('surfaces a non-activating track in the status line', () => {
    const { screen } = make(() => false);
    screen.handleKey('F2');
    screen.handleKey('ArrowRight');
    expect(screen.status).toMatch(/not activated/);
  });
});

describe('generator integration', () => {
  it('G loads a generated track for the current seed and notifies', () => {
    const { screen, changes } = opened();
    screen.handleKey('KeyG');
    expect(screen.working.trackId).toBe(`gen-${screen.seed}`);
    expect(changes.length).toBe(1);
  });
  it('Equal/Minus step the seed', () => {
    const { screen } = opened();
    const s0 = screen.seed;
    screen.handleKey('Equal');
    expect(screen.seed).toBe(s0 + 1);
    screen.handleKey('Minus');
    expect(screen.seed).toBe(s0);
  });
});

describe('persistence + import/export', () => {
  it('S saves the working track and updates the index', async () => {
    const { screen, save } = opened();
    screen.handleKey('KeyS');
    await screen.lastPersist;
    expect(await save.get(TRACK_KEY_PREFIX + 'default')).toBe(formatTrackFile(screen.working));
    expect(JSON.parse((await save.get(TRACK_INDEX_KEY))!)).toEqual(['default']);
  });
  it('exportJson round-trips through importJson', () => {
    const a = opened().screen;
    a.handleKey('ArrowRight');
    const json = a.exportJson();
    const b = opened().screen;
    expect(b.importJson(json)).toBe(true);
    expect(b.working.sections[0]!.length).toBe(a.working.sections[0]!.length);
  });
  it('importJson surfaces validator errors in status and keeps the working track', () => {
    const { screen } = opened();
    const before = screen.working.trackId;
    expect(screen.importJson('{"trackId": 42}')).toBe(false);
    expect(screen.status).toMatch(/trackId|stageName/);
    expect(screen.working.trackId).toBe(before);
  });
  it('a stale in-flight saved-track load never overwrites a newer cycle choice', async () => {
    const { screen } = opened();
    screen.handleKey('KeyG'); // working = gen-1
    screen.handleKey('KeyS'); // saved: 'gen-1' → cycle is default, gen, saved gen-1
    await screen.lastPersist;
    screen.handleKey('KeyL'); // → generated (sync)
    screen.handleKey('KeyL'); // → saved 'gen-1' (async load in flight)
    screen.handleKey('KeyL'); // → default (sync) — must win over the in-flight load
    await screen.lastLoad;
    expect(screen.working.trackId).toBe('default');
    expect(screen.status).toMatch(/loaded default/);
  });
});

describe('render', () => {
  it('draws nothing closed; a backdrop + header + section rows open', () => {
    const { screen } = make();
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.quads.length).toBe(0);
    screen.handleKey('F2');
    const b2 = new RecordingBackend();
    screen.render(b2);
    expect(b2.quads.length).toBeGreaterThan(0);
    expect(b2.sprites.length).toBeGreaterThan(20);
  });
});
