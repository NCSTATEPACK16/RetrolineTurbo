import { buildNavbar } from '../components/navbar.js';
import { buildCard } from '../components/card.js';
import type { ShellRouter } from '../ShellRouter.js';

/** net-new Driver's Guide (spec §4): static driving-mechanics + route-pyramid
 * explainer content. No backing code — this screen is prose. */
export function renderGuide(router: ShellRouter): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';
  root.appendChild(buildNavbar('guide', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const title = document.createElement('h1');
  title.textContent = "Driver's Guide";

  const controlsHeading = document.createElement('h3');
  controlsHeading.textContent = 'Controls';
  const controlsBody = document.createElement('p');
  controlsBody.textContent = 'WASD or Arrow Keys to drive. Space for handbrake. Mouse (click to lock) '
    + 'or a gamepad also steer. Rebind anything from Settings > Controls.';
  const controlsCard = buildCard([controlsHeading, controlsBody]);

  const routeHeading = document.createElement('h3');
  routeHeading.textContent = 'The Route Pyramid';
  const routeBody = document.createElement('p');
  routeBody.textContent = 'Five stages, each ending in a fork. Steer left or right of the median '
    + 'through a split to choose your next scene — 25 possible routes to five different endings.';
  const routeCard = buildCard([routeHeading, routeBody]);

  const economyHeading = document.createElement('h3');
  economyHeading.textContent = 'Earning & Upgrades';
  const economyBody = document.createElement('p');
  economyBody.textContent = 'Clearing stages, banking time, and passing traffic all earn credits at '
    + "the finish. Spend them in the Garage on Engine, Transmission, Suspension, and Wheels parts "
    + '— every part is a trade-off, not a strict upgrade.';
  const economyCard = buildCard([economyHeading, economyBody]);

  root.append(title, controlsCard, routeCard, economyCard);
  return root;
}
