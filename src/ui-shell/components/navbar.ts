export type NavTarget = 'hub' | 'garage' | 'guide' | 'settings';

const LABELS: Record<NavTarget, string> = {
  hub: 'Dashboard',
  garage: 'Garage',
  guide: 'Guide',
  settings: 'Retro FX',
};

/** Shared nav present on every non-playing/paused screen (spec §3): a
 * one-click path back to the hub from anywhere. `active` is null on screens
 * (like Settings) that render as an overlay rather than owning a nav slot. */
export function buildNavbar(active: NavTarget | null, onNavigate: (target: NavTarget) => void): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'rt-navbar';
  (['hub', 'garage', 'guide', 'settings'] as const).forEach((target) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = LABELS[target];
    btn.setAttribute('aria-current', String(target === active));
    btn.addEventListener('click', () => onNavigate(target));
    nav.appendChild(btn);
  });
  return nav;
}
