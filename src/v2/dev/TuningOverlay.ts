/**
 * DEV-only live tuning panel (F8). Edits the shared tuning objects in place and
 * calls `onChange` so derived values (per-car params) can be rebuilt. Imported
 * dynamically behind `import.meta.env.DEV`, so it never ships in production.
 */
export interface TuningGroup {
  title: string;
  target: Record<string, number | boolean>;
}

export class TuningOverlay {
  private readonly root = document.createElement('div');

  constructor(groups: TuningGroup[], onChange: () => void) {
    const r = this.root;
    r.hidden = true;
    Object.assign(r.style, {
      position: 'fixed', top: '8px', right: '8px', width: '300px', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
      background: 'rgba(16,16,24,0.92)', color: '#e8e8f0', font: '11px/1.3 ui-monospace, monospace',
      padding: '8px', border: '1px solid #5060c0', zIndex: '10', borderRadius: '4px',
    });
    const copy = document.createElement('button');
    copy.textContent = 'Copy constants';
    copy.onclick = () => {
      const text = JSON.stringify(Object.fromEntries(groups.map((g) => [g.title, g.target])), null, 2);
      navigator.clipboard.writeText(text).then(() => { copy.textContent = 'Copied'; }, () => console.info(text));
    };
    r.append(copy);

    for (const g of groups) {
      const h = document.createElement('div');
      h.textContent = g.title;
      Object.assign(h.style, { margin: '10px 0 4px', color: '#40e0e0', fontWeight: 'bold' });
      r.append(h);
      for (const [key, value] of Object.entries(g.target)) {
        const row = document.createElement('label');
        Object.assign(row.style, { display: 'grid', gridTemplateColumns: '1fr 90px 42px', gap: '4px', alignItems: 'center' });
        const name = document.createElement('span');
        name.textContent = key;
        const out = document.createElement('span');
        const input = document.createElement('input');
        if (typeof value === 'boolean') {
          input.type = 'checkbox';
          input.checked = value;
          input.onchange = () => { g.target[key] = input.checked; onChange(); };
        } else {
          const span = Math.max(Math.abs(value) * 3, 1);
          input.type = 'range';
          input.min = String(value < 0 ? -span : 0);
          input.max = String(span);
          input.step = String(span / 300);
          input.value = String(value);
          out.textContent = value.toFixed(3);
          input.oninput = () => {
            g.target[key] = Number(input.value);
            out.textContent = Number(input.value).toFixed(3);
            onChange();
          };
        }
        row.append(name, input, out);
        r.append(row);
      }
    }
    document.body.append(r);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F8') {
        e.preventDefault();
        r.hidden = !r.hidden;
      }
    });
  }
}
