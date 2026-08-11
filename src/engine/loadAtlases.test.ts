import { describe, it, expect } from 'vitest';
import { loadAtlases } from './loadAtlases.js';

describe('loadAtlases', () => {
  it('resolves to no atlases when nothing is reachable', async () => {
    await expect(loadAtlases('/assets/')).resolves.toEqual(new Map());
  });

  it('resolves rather than rejecting for an unreachable absolute base', async () => {
    await expect(loadAtlases('https://example.invalid/nope/')).resolves.toEqual(new Map());
  });

  it('never rejects — the render loop must not die on a bad asset', async () => {
    await expect(loadAtlases('::::not a url::::')).resolves.toBeInstanceOf(Map);
  });
});
