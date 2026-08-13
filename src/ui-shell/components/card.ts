export function buildCard(children: HTMLElement[], extraClass = ''): HTMLElement {
  const card = document.createElement('div');
  card.className = extraClass ? `rt-card ${extraClass}` : 'rt-card';
  for (const child of children) card.appendChild(child);
  return card;
}
