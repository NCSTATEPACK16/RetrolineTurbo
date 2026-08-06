import { describe, it, expect } from 'vitest';
import { RouteMap } from './RouteMap.js';
import { RouteState } from '../track/route.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { COLORS } from '../constants.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('RouteMap', () => {
  it('draws nothing while not flashing', () => {
    const map = new RouteMap(atlas);
    const b = new RecordingBackend();
    map.render(new RouteState(1), b);
    expect(b.quads.length).toBe(0);
    expect(b.sprites.length).toBe(0);
  });

  it('draws all 15 scene nodes while flashing', () => {
    const map = new RouteMap(atlas);
    map.flashMs = 1000;
    const b = new RecordingBackend();
    map.render(new RouteState(1), b);
    const nodes = b.quads.filter((q) => q.color === COLORS.rumbleLight || q.color === COLORS.road);
    expect(nodes.length).toBe(15);
  });

  it('highlights the visited path plus the current scene', () => {
    const map = new RouteMap(atlas);
    map.flashMs = 1000;
    const route = new RouteState(1);
    route.advance(1); route.advance(0); // two forks taken → stage 2
    const b = new RecordingBackend();
    map.render(route, b);
    const lit = b.quads.filter((q) => q.color === COLORS.rumbleLight);
    expect(lit.length).toBe(3); // stages 0,1 visited + current scene on stage 2
  });

  it('names the ending when finished', () => {
    const map = new RouteMap(atlas);
    map.flashMs = 1000;
    const route = new RouteState(1);
    for (let i = 0; i < 4; i++) route.advance(1);
    route.finish();
    const empty = new RecordingBackend();
    map.render(new RouteState(1), (map.flashMs = 1000, empty));
    const finished = new RecordingBackend();
    map.render(route, finished);
    expect(finished.sprites.length).toBeGreaterThan(empty.sprites.length); // extra ending label glyphs
  });
});
