import { buildNavbar } from '../components/navbar.js';
import { buildCard } from '../components/card.js';
import type { ShellRouter } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

/** net-new Dashboard/Hub (spec §4): hero Race Route CTA, Garage preview card,
 * Leaderboard preview card (links out — full leaderboard screen is a canvas
 * F3 overlay, out of scope for this spec per §2), and three subcards. */
export function renderHub(router: ShellRouter, bridge: ShellBridge, onRace: () => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';

  root.appendChild(buildNavbar('hub', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const hero = document.createElement('div');
  hero.className = 'rt-card';
  const heroTitle = document.createElement('h1');
  heroTitle.textContent = 'Retroline Turbo';
  const raceBtn = document.createElement('button');
  raceBtn.type = 'button';
  raceBtn.className = 'rt-btn rt-btn-primary';
  raceBtn.textContent = 'Race Route';
  raceBtn.addEventListener('click', onRace);
  hero.append(heroTitle, raceBtn);
  root.appendChild(hero);

  const grid = document.createElement('div');
  grid.className = 'rt-grid';

  const garageTitle = document.createElement('h3');
  garageTitle.textContent = 'Garage';
  const garageCredits = document.createElement('p');
  garageCredits.textContent = `${bridge.getCredits()}c`;
  const garageBtn = document.createElement('button');
  garageBtn.type = 'button';
  garageBtn.className = 'rt-btn rt-btn-ghost';
  garageBtn.textContent = 'Open Garage';
  garageBtn.addEventListener('click', () => router.goGarage());
  grid.appendChild(buildCard([garageTitle, garageCredits, garageBtn]));

  const guideTitle = document.createElement('h3');
  guideTitle.textContent = 'How to Play';
  const guideBtn = document.createElement('button');
  guideBtn.type = 'button';
  guideBtn.className = 'rt-btn rt-btn-ghost';
  guideBtn.textContent = "Driver's Guide";
  guideBtn.addEventListener('click', () => router.goGuide());
  grid.appendChild(buildCard([guideTitle, guideBtn]));

  const settingsTitle = document.createElement('h3');
  settingsTitle.textContent = 'Settings & Retro FX';
  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'rt-btn rt-btn-ghost';
  settingsBtn.textContent = 'Open Settings';
  settingsBtn.addEventListener('click', () => router.openSettings());
  grid.appendChild(buildCard([settingsTitle, settingsBtn]));

  const editorTitle = document.createElement('h3');
  editorTitle.textContent = 'Track Editor';
  const editorBadge = document.createElement('span');
  editorBadge.textContent = 'BETA';
  const editorNote = document.createElement('p');
  editorNote.textContent = 'Press Tab in-game to open the track editor.';
  grid.appendChild(buildCard([editorTitle, editorBadge, editorNote]));

  root.appendChild(grid);
  return root;
}
