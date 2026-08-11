import { describe, it, expect } from 'vitest';
import { loadBackdrops } from './loadBackdrops.js';

describe('loadBackdrops', () => {
  it('resolves to no plates when the manifest cannot be fetched', async () => {
    // Headless node: a relative asset URL has no origin to fetch from. The game
    // must fall back to the flat colour bands rather than fail to boot.
    await expect(loadBackdrops('/assets/')).resolves.toEqual(new Map());
  });

  it('resolves to no plates when the document is not a manifest', async () => {
    await expect(loadBackdrops('https://example.invalid/nope/')).resolves.toEqual(new Map());
  });
});
