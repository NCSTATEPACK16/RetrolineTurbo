import { buildTabBar } from '../components/tabBar.js';
import { buildToggle } from '../components/toggle.js';
import { buildSlider } from '../components/slider.js';
import { buildModal } from '../components/modal.js';
import { ACTIONS, type Action } from '../../input/InputManager.js';
import type { ShellRouter, SettingsTab } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

const ACTION_LABEL: Record<Action, string> = {
  throttle: 'Throttle', brake: 'Brake', steerLeft: 'Steer Left', steerRight: 'Steer Right',
  handbrake: 'Handbrake', gearUp: 'Gear Up', gearDown: 'Gear Down', nitro: 'Nitro',
};

const TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display & Retro FX' },
  { id: 'account', label: 'Driver Account' },
];

function renderControlsTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rt-col';
  const bindings = bridge.getBindings();
  for (const action of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'rt-row-between';
    const label = document.createElement('span');
    label.textContent = ACTION_LABEL[action];
    const current = document.createElement('span');
    current.textContent = bindings[action].join(' / ');
    const rebindBtn = document.createElement('button');
    rebindBtn.type = 'button';
    rebindBtn.className = 'rt-btn rt-btn-ghost';
    rebindBtn.textContent = 'Rebind';
    rebindBtn.addEventListener('click', () => {
      rebindBtn.textContent = 'Press a key…';
      const onKey = (e: KeyboardEvent): void => {
        bridge.rebind(action, e.code);
        current.textContent = bridge.getBindings()[action].join(' / ');
        rebindBtn.textContent = 'Rebind';
        window.removeEventListener('keydown', onKey);
      };
      window.addEventListener('keydown', onKey, { once: true });
    });
    row.append(label, current, rebindBtn);
    wrap.appendChild(row);
  }
  return wrap;
}

function renderAudioTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rt-col';
  const engineRow = document.createElement('div');
  engineRow.className = 'rt-col';
  const engineLabel = document.createElement('span');
  engineLabel.textContent = 'Engine & SFX';
  const engineSlider = buildSlider(bridge.getVolume('engine'), 0, 1, 0.05, (v) => bridge.setVolume('engine', v));
  engineRow.append(engineLabel, engineSlider);

  const musicRow = document.createElement('div');
  musicRow.className = 'rt-col';
  const musicLabel = document.createElement('span');
  musicLabel.textContent = 'Soundtrack';
  const musicSlider = buildSlider(bridge.getVolume('music'), 0, 1, 0.05, (v) => bridge.setVolume('music', v));
  musicRow.append(musicLabel, musicSlider);

  wrap.append(engineRow, musicRow);
  return wrap;
}

function renderDisplayTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rt-col';
  const settings = bridge.getCrtSettings();

  const scanLabel = document.createElement('span');
  scanLabel.textContent = 'Scanlines';
  const scanRow = document.createElement('div');
  scanRow.className = 'rt-row-between';
  scanRow.append(scanLabel, buildToggle(settings.scanline, (v) => bridge.setCrtSettings({ scanline: v })));

  const aberrationLabel = document.createElement('span');
  aberrationLabel.textContent = 'Screen Curvature';
  const aberrationRow = document.createElement('div');
  aberrationRow.className = 'rt-row-between';
  aberrationRow.append(aberrationLabel, buildToggle(settings.aberration, (v) => bridge.setCrtSettings({ aberration: v })));

  const bloomLabel = document.createElement('span');
  bloomLabel.textContent = 'Bloom';
  const bloomRow = document.createElement('div');
  bloomRow.className = 'rt-col';
  bloomRow.append(bloomLabel, buildSlider(settings.bloom, 0, 1, 0.05, (v) => bridge.setCrtSettings({ bloom: v })));

  wrap.append(scanRow, aberrationRow, bloomRow);
  return wrap;
}

function renderAccountTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rt-col';
  const status = document.createElement('p');
  status.textContent = 'Checking account status…';
  void bridge.getIdentity().then((identity) => {
    status.textContent = identity.linked
      ? `Signed in as ${identity.displayName}`
      : 'Guest Driver (progress is local to this browser)';
  });

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'rt-btn rt-btn-primary';
  linkBtn.textContent = 'Link Email';
  linkBtn.addEventListener('click', () => {
    const email = window.prompt('Email address:');
    if (!email) return;
    void bridge.linkEmail(email).then((result) => {
      status.textContent = result === 'ok' ? 'Check your email to confirm.' : `Link failed (${result}).`;
    });
  });

  const passBtn = document.createElement('button');
  passBtn.type = 'button';
  passBtn.className = 'rt-btn rt-btn-ghost';
  passBtn.textContent = 'Set Password';
  passBtn.addEventListener('click', () => {
    const password = window.prompt('New password:');
    if (!password) return;
    void bridge.setPassword(password).then((result) => {
      status.textContent = result === 'ok' ? 'Password set.' : `Failed (${result}).`;
    });
  });

  const buttonRow = document.createElement('div');
  buttonRow.className = 'rt-row';
  buttonRow.append(linkBtn, passBtn);

  wrap.append(status, buttonRow);
  return wrap;
}

function renderTab(tab: SettingsTab, bridge: ShellBridge): HTMLElement {
  if (tab === 'controls') return renderControlsTab(bridge);
  if (tab === 'audio') return renderAudioTab(bridge);
  if (tab === 'display') return renderDisplayTab(bridge);
  return renderAccountTab(bridge);
}

/** Settings overlay (spec §4): 4 tabs, opens on Display by default, closes
 * back to whichever screen opened it (ShellRouter.closeSettings). Rendered
 * as a modal — the caller (main.ts) composes this over whatever screen is
 * "underneath" per ShellRouter.settingsOpener. */
export function renderSettings(router: ShellRouter, bridge: ShellBridge): HTMLElement {
  const body = document.createElement('div');
  body.className = 'rt-col';
  const tabBarSlot = document.createElement('div');
  const tabBody = document.createElement('div');
  tabBody.className = 'rt-col';
  tabBody.style.paddingTop = '16px';
  function rerender(): void {
    tabBarSlot.innerHTML = '';
    tabBarSlot.appendChild(buildTabBar(TABS, router.settingsTab, (tab) => {
      router.setSettingsTab(tab);
      rerender();
    }));
    tabBody.innerHTML = '';
    tabBody.appendChild(renderTab(router.settingsTab, bridge));
  }
  rerender();
  body.append(tabBarSlot, tabBody);

  const footer = document.createElement('div');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rt-btn rt-btn-primary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => router.closeSettings());
  footer.appendChild(closeBtn);

  return buildModal(body, footer, () => router.closeSettings());
}
