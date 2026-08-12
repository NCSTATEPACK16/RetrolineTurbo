import type { PayoutLedger } from '../../economy/payout.js';

/** Post-Race Summary (spec §4): replaces the canvas SummaryScreen. Pure
 * ledger renderer — payout.ts math is reused unchanged; this only formats it. */
export function renderSummary(
  title: string, ledger: PayoutLedger, balance: number,
  onRaceAgain: () => void, onGarage: () => void, onHub: () => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';

  const card = document.createElement('div');
  card.className = 'rt-card';
  const heading = document.createElement('h1');
  heading.textContent = title;
  card.appendChild(heading);

  for (const line of ledger.lines) {
    const row = document.createElement('div');
    row.textContent = `${line.label}: ${line.credits}c`;
    card.appendChild(row);
  }
  if (ledger.cleanMultiplier > 1) {
    const bonus = document.createElement('div');
    bonus.textContent = `clean race bonus: x${ledger.cleanMultiplier}`;
    card.appendChild(bonus);
  }
  const total = document.createElement('div');
  total.textContent = `Total: ${ledger.total}c (balance ${balance}c)`;
  card.appendChild(total);

  const actions = document.createElement('div');
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'rt-btn rt-btn-primary';
  again.textContent = 'Race Again';
  again.addEventListener('click', onRaceAgain);
  const garage = document.createElement('button');
  garage.type = 'button';
  garage.className = 'rt-btn rt-btn-ghost';
  garage.textContent = 'Upgrade in Garage';
  garage.addEventListener('click', onGarage);
  const hub = document.createElement('button');
  hub.type = 'button';
  hub.className = 'rt-btn rt-btn-ghost';
  hub.textContent = 'Return to Hub';
  hub.addEventListener('click', onHub);
  actions.append(again, garage, hub);
  card.appendChild(actions);

  root.appendChild(card);
  return root;
}
