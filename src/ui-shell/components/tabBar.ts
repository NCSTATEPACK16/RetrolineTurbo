export function buildTabBar<T extends string>(
  tabs: readonly { id: T; label: string }[],
  active: T,
  onSelect: (id: T) => void,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'rt-tabbar';
  bar.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = tab.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(tab.id === active));
    btn.addEventListener('click', () => onSelect(tab.id));
    bar.appendChild(btn);
  }
  return bar;
}
