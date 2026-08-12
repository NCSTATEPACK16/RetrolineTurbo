export function buildModal(body: HTMLElement, footer: HTMLElement, onClose: () => void): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'rt-modal-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) onClose();
  });

  const modal = document.createElement('div');
  modal.className = 'rt-modal rt-card';
  modal.appendChild(body);

  const footerRow = document.createElement('div');
  footerRow.className = 'rt-modal-footer';
  footerRow.appendChild(footer);
  modal.appendChild(footerRow);

  backdrop.appendChild(modal);
  return backdrop;
}
