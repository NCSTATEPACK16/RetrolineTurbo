/** Minimal pause overlay (spec §3/§4): Resume / Settings / Quit only, not
 * the full navbar — pausing mid-race should not tempt a full menu detour. */
export function renderPauseOverlay(onResume: () => void, onSettings: () => void, onQuit: () => void): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'rt-pause-overlay';

  const card = document.createElement('div');
  card.className = 'rt-card';
  const title = document.createElement('h2');
  title.textContent = 'Paused';

  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'rt-btn rt-btn-primary';
  resume.textContent = 'Resume';
  resume.addEventListener('click', onResume);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'rt-btn rt-btn-ghost';
  settings.textContent = 'Settings';
  settings.addEventListener('click', onSettings);

  const quit = document.createElement('button');
  quit.type = 'button';
  quit.className = 'rt-btn rt-btn-ghost';
  quit.textContent = 'Quit to Hub';
  quit.addEventListener('click', onQuit);

  card.append(title, resume, settings, quit);
  backdrop.appendChild(card);
  return backdrop;
}
