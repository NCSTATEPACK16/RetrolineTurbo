export type ScreenState = 'hub' | 'guide' | 'garage' | 'settings' | 'playing' | 'paused';
export type SettingsOpener = 'hub' | 'guide' | 'garage';
export type SettingsTab = 'controls' | 'audio' | 'display' | 'account';

/** Pure navigation state machine for the DOM UI shell (spec §3/§5). No DOM,
 * no game-module deps — main.ts and every screen drive navigation only
 * through this class's methods, never by mutating state directly.
 *
 * `subscribe` exists because screens call navigation methods from inside
 * their own click handlers (e.g. the Hub's "Open Garage" button calls
 * `router.goGarage()`), with no reference back to main.ts's render loop.
 * Without a notification hook, that click would update `state` but nothing
 * would ever re-render — the DOM would silently freeze on the old screen. */
export class ShellRouter {
  private current: ScreenState = 'hub';
  private opener: SettingsOpener = 'hub';
  private tab: SettingsTab = 'display';
  private listeners: Array<() => void> = [];

  get state(): ScreenState { return this.current; }
  get settingsOpener(): SettingsOpener { return this.opener; }
  get settingsTab(): SettingsTab { return this.tab; }

  /** Register a listener called after every state-changing method below.
   * Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  goHub(): void { this.current = 'hub'; this.notify(); }
  goGuide(): void { this.current = 'guide'; this.notify(); }
  goGarage(): void { this.current = 'garage'; this.notify(); }

  openSettings(tab: SettingsTab = 'display'): void {
    if (this.current === 'hub' || this.current === 'guide' || this.current === 'garage') {
      this.opener = this.current;
    }
    this.tab = tab;
    this.current = 'settings';
    this.notify();
  }

  setSettingsTab(tab: SettingsTab): void {
    this.tab = tab;
    this.notify();
  }

  closeSettings(): void {
    this.current = this.opener;
    this.notify();
  }

  startPlaying(): void { this.current = 'playing'; this.notify(); }
  pause(): void { if (this.current === 'playing') { this.current = 'paused'; this.notify(); } }
  resume(): void { if (this.current === 'paused') { this.current = 'playing'; this.notify(); } }
  quitToHub(): void { this.current = 'hub'; this.notify(); }

  toggleEsc(): void {
    if (this.current === 'playing') { this.current = 'paused'; this.notify(); }
    else if (this.current === 'paused') { this.current = 'playing'; this.notify(); }
  }
}
