import { el, toast } from './ui.js';
import { setDeleted } from './api.js';

/** deps: { getCode(), isReadOnly(), onChanged(), onClose(), onNetworkError() } */
export function renderTrash(root, deleted, deps) {
  root.replaceChildren(
    el('div', { class: 'buttons' },
      el('h2', { textContent: `Bin (${deleted.length})` }),
      el('button', { type: 'button', class: 'btn sm', textContent: 'กลับ', onclick: deps.onClose })));
  if (deleted.length === 0) root.append(el('div', { class: 'empty', textContent: 'Bin ว่าง' }));
  for (const p of deleted) {
    const btn = el('button', {
      type: 'button', class: 'btn sm', textContent: 'กู้คืน', disabled: deps.isReadOnly(),
      onclick: async () => {
        btn.disabled = true;
        try {
          await setDeleted(deps.getCode(), p.id, false, p.version);
          toast('กู้คืนแล้ว');
          await deps.onChanged();
        } catch (e) {
          if (e.code === 'network') deps.onNetworkError();
          toast(e.code === 'conflict' ? 'มีคนอื่นแก้รายการนี้แล้ว กดรีโหลด' : e.message);
          btn.disabled = false;
        }
      },
    });
    root.append(el('div', { class: 'row' },
      el('div', { class: 'name', textContent: p.name }),
      el('div', { class: 'meta', textContent: `เพิ่มโดย ${p.added_by}` }),
      btn));
  }
}
