export type ScreenState = 'hub' | 'guide' | 'garage' | 'settings' | 'playing' | 'paused';
export type SettingsOpener = 'hub' | 'guide' | 'garage';
export type SettingsTab = 'controls' | 'audio' | 'display' | 'account';

/** Pure navigation state machine for the DOM UI shell (spec §3/§5). No DOM,
 * no game-module deps — main.ts and every screen drive navigation only
 * through this class's methods, never by mutating state directly. */
export class ShellRouter {
  private current: ScreenState = 'hub';
  private opener: SettingsOpener = 'hub';
  private tab: SettingsTab = 'display';

  get state(): ScreenState { return this.current; }
  get settingsOpener(): SettingsOpener { return this.opener; }
  get settingsTab(): SettingsTab { return this.tab; }

  goHub(): void { this.current = 'hub'; }
  goGuide(): void { this.current = 'guide'; }
  goGarage(): void { this.current = 'garage'; }

  openSettings(tab: SettingsTab = 'display'): void {
    if (this.current === 'hub' || this.current === 'guide' || this.current === 'garage') {
      this.opener = this.current;
    }
    this.tab = tab;
    this.current = 'settings';
  }

  setSettingsTab(tab: SettingsTab): void {
    this.tab = tab;
  }

  closeSettings(): void {
    this.current = this.opener;
  }

  startPlaying(): void { this.current = 'playing'; }
  pause(): void { if (this.current === 'playing') this.current = 'paused'; }
  resume(): void { if (this.current === 'paused') this.current = 'playing'; }
  quitToHub(): void { this.current = 'hub'; }

  toggleEsc(): void {
    if (this.current === 'playing') this.current = 'paused';
    else if (this.current === 'paused') this.current = 'playing';
  }
}
