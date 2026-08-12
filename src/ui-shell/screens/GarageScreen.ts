import { buildNavbar } from '../components/navbar.js';
import { PART_CATEGORIES, type PartCategory, type Part } from '../../types/inventory.js';
import type { ShellRouter } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

const CATEGORY_LABEL: Record<PartCategory, string> = {
  engine: 'Engine', transmission: 'Transmission', suspension: 'Suspension', wheels: 'Wheels',
};

function statBar(label: string, delta: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'rt-col';
  const cap = document.createElement('span');
  cap.textContent = `${label} ${delta >= 0 ? '+' : ''}${delta}`;
  const track = document.createElement('div');
  track.className = 'rt-stat-bar-track';
  const fill = document.createElement('div');
  fill.className = 'rt-stat-bar-fill';
  fill.dataset.sign = delta >= 0 ? 'positive' : 'negative';
  fill.style.width = `${Math.min(100, Math.abs(delta) * 5)}%`;
  track.appendChild(fill);
  row.append(cap, track);
  return row;
}

function partRow(part: Part, bridge: ShellBridge, onChange: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'rt-card rt-col';
  const header = document.createElement('div');
  header.className = 'rt-row-between';
  const name = document.createElement('span');
  name.textContent = part.name;
  const state = bridge.getPartState(part);
  const stateLabel = document.createElement('span');
  stateLabel.textContent = state === 'unaffordable' ? `${part.cost}c (need more)`
    : state === 'purchasable' ? `${part.cost}c` : state;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'rt-btn rt-btn-primary';
  action.textContent = state === 'equipped' ? 'Fitted' : state === 'owned' ? 'Fit' : 'Buy & Fit';
  action.disabled = state === 'equipped' || state === 'locked' || state === 'unaffordable';
  action.addEventListener('click', () => {
    if (bridge.buyAndEquip(part)) onChange();
  });
  header.append(name, stateLabel, action);

  const diff = bridge.getStatDiff(part);
  const diffBox = document.createElement('div');
  diffBox.className = 'rt-col';
  diffBox.append(
    statBar('Speed', diff.speed), statBar('Accel', diff.accel),
    statBar('Handling', diff.handling), statBar('Grip', diff.grip),
  );

  row.append(header, diffBox);
  return row;
}

/** Garage & Marketplace (spec §4): a category carousel + per-part rows with a
 * stat-diff readout. The Engine tab's layout is reused unchanged for the
 * other three categories, data-driven off `getCatalog` — not a separate
 * design per spec §2. */
export function renderGarage(router: ShellRouter, bridge: ShellBridge): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen rt-garage-layout';
  root.appendChild(buildNavbar('garage', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const header = document.createElement('div');
  const credits = document.createElement('span');
  credits.textContent = `${bridge.getCredits()}c`;
  header.appendChild(credits);
  root.appendChild(header);

  let activeCategory: PartCategory = 'engine';
  const listWrap = document.createElement('div');
  listWrap.className = 'rt-col';

  function renderList(): void {
    listWrap.innerHTML = '';
    for (const part of bridge.getCatalog(activeCategory)) {
      listWrap.appendChild(partRow(part, bridge, () => {
        credits.textContent = `${bridge.getCredits()}c`;
        renderList();
      }));
    }
  }

  const carousel = document.createElement('div');
  carousel.className = 'rt-tabbar';
  for (const category of PART_CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = CATEGORY_LABEL[category];
    btn.setAttribute('aria-selected', String(category === activeCategory));
    btn.addEventListener('click', () => {
      activeCategory = category;
      for (const sibling of Array.from(carousel.children)) {
        sibling.setAttribute('aria-selected', String(sibling === btn));
      }
      renderList();
    });
    carousel.appendChild(btn);
  }
  root.append(carousel, listWrap);
  renderList();

  return root;
}
