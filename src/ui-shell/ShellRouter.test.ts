import { describe, it, expect } from 'vitest';
import { ShellRouter } from './ShellRouter.js';

describe('ShellRouter', () => {
  it('starts on hub', () => {
    expect(new ShellRouter().state).toBe('hub');
  });

  it('every non-playing screen can reach hub in one call', () => {
    for (const enter of [
      (r: ShellRouter) => r.goGuide(),
      (r: ShellRouter) => r.goGarage(),
      (r: ShellRouter) => r.openSettings(),
    ]) {
      const router = new ShellRouter();
      enter(router);
      router.goHub();
      expect(router.state).toBe('hub');
    }
  });

  it('settings always returns to whichever screen opened it', () => {
    const fromHub = new ShellRouter();
    fromHub.openSettings();
    expect(fromHub.settingsOpener).toBe('hub');
    fromHub.closeSettings();
    expect(fromHub.state).toBe('hub');

    const fromGarage = new ShellRouter();
    fromGarage.goGarage();
    fromGarage.openSettings();
    expect(fromGarage.settingsOpener).toBe('garage');
    fromGarage.closeSettings();
    expect(fromGarage.state).toBe('garage');

    const fromGuide = new ShellRouter();
    fromGuide.goGuide();
    fromGuide.openSettings();
    expect(fromGuide.settingsOpener).toBe('guide');
    fromGuide.closeSettings();
    expect(fromGuide.state).toBe('guide');
  });

  it('openSettings defaults to the display tab, and setSettingsTab swaps without navigating', () => {
    const router = new ShellRouter();
    router.openSettings();
    expect(router.settingsTab).toBe('display');
    router.setSettingsTab('controls');
    expect(router.state).toBe('settings');
    expect(router.settingsTab).toBe('controls');
  });

  it('playing <-> paused toggles on Esc, and is a no-op everywhere else', () => {
    const router = new ShellRouter();
    router.startPlaying();
    expect(router.state).toBe('playing');
    router.toggleEsc();
    expect(router.state).toBe('paused');
    router.toggleEsc();
    expect(router.state).toBe('playing');

    router.goHub();
    router.toggleEsc();
    expect(router.state).toBe('hub'); // Esc does nothing outside playing/paused
  });

  it('quitToHub returns to hub from paused', () => {
    const router = new ShellRouter();
    router.startPlaying();
    router.pause();
    router.quitToHub();
    expect(router.state).toBe('hub');
  });

  it('resume from paused returns to playing', () => {
    const router = new ShellRouter();
    router.startPlaying();
    router.pause();
    router.resume();
    expect(router.state).toBe('playing');
  });

  it('subscribe notifies listeners on every state-changing method', () => {
    const router = new ShellRouter();
    let calls = 0;
    router.subscribe(() => { calls++; });
    router.goGarage();
    router.openSettings();
    router.setSettingsTab('audio');
    router.closeSettings();
    router.startPlaying();
    router.toggleEsc();
    router.resume();
    router.quitToHub();
    expect(calls).toBe(8);
  });

  it('subscribe does not notify on a no-op (pause while not playing)', () => {
    const router = new ShellRouter();
    let calls = 0;
    router.subscribe(() => { calls++; });
    router.pause(); // no-op: state is 'hub', not 'playing'
    expect(calls).toBe(0);
  });

  it('the unsubscribe function returned by subscribe stops further notifications', () => {
    const router = new ShellRouter();
    let calls = 0;
    const unsubscribe = router.subscribe(() => { calls++; });
    router.goGarage();
    unsubscribe();
    router.goHub();
    expect(calls).toBe(1);
  });
});
