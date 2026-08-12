import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';

vi.mock('../net/account.js', () => ({ linkEmail: vi.fn(), setPassword: vi.fn(), isAccountLinked: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

// The test environment is `node` (see vite.config.ts) — there is no global
// `window`, so stub the one property AccountScreen reads from it.
const windowPrompt = vi.fn();

describe('AccountScreen', () => {
  beforeEach(() => {
    windowPrompt.mockReset();
    vi.stubGlobal('window', { prompt: windowPrompt });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('toggle opens/closes and checks link status on open', async () => {
    const { isAccountLinked } = await import('../net/account.js');
    vi.mocked(isAccountLinked).mockResolvedValue(false);
    const { AccountScreen } = await import('./AccountScreen.js');
    const screen = new AccountScreen(atlas);
    expect(screen.open).toBe(false);
    screen.toggle();
    expect(screen.open).toBe(true);
    await screen.lastAction;
  });

  it('KeyE prompts for an email and calls linkEmail', async () => {
    const { linkEmail, isAccountLinked } = await import('../net/account.js');
    vi.mocked(isAccountLinked).mockResolvedValue(false);
    vi.mocked(linkEmail).mockResolvedValue('ok');
    windowPrompt.mockReturnValue('a@b.com');
    const { AccountScreen } = await import('./AccountScreen.js');
    const screen = new AccountScreen(atlas);
    screen.toggle();
    await screen.lastAction;
    screen.handleKey('KeyE');
    await screen.lastAction;
    expect(linkEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('closes on F5 or Escape; passes other keys through when closed', async () => {
    const { isAccountLinked } = await import('../net/account.js');
    vi.mocked(isAccountLinked).mockResolvedValue(false);
    const { AccountScreen } = await import('./AccountScreen.js');
    const screen = new AccountScreen(atlas);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle();
    expect(screen.handleKey('F5')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
