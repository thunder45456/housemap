import { el, toast } from './ui.js';
import { buildPrompt, extractItems, normalizeItem } from './aiimport.js';

/** deps: { onItems(items), onClose() } where items = normalizeItem() results */
export function renderAiPanel(root, deps) {
  const status = el('div', { class: 'err' });
  const box = el('textarea', { rows: 8, placeholder: 'วางคำตอบของ AI (JSON)' });
  const copyBtn = el('button', { type: 'button', class: 'btn', textContent: 'คัดลอก prompt', onclick: async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      toast('คัดลอก prompt แล้ว นำไปวางในแชท AI พร้อมข้อความหรือรูปจากประกาศ');
    } catch {
      promptBox.hidden = false;
      promptBox.select();
      toast('คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกจากกล่องข้อความ');
    }
  } });
  const promptBox = el('textarea', { rows: 6, readOnly: true, hidden: true, value: buildPrompt() });
  const readBtn = el('button', { type: 'button', class: 'btn primary', textContent: 'อ่านคำตอบ', onclick: () => {
    const { items, error } = extractItems(box.value);
    if (error) { status.textContent = error; return; }
    status.textContent = '';
    deps.onItems(items.map(normalizeItem));
  } });
  root.replaceChildren(
    el('h2', { textContent: 'AI prompt' }),
    el('p', { class: 'muted', textContent: '1) คัดลอก prompt  2) ให้ AI อ่านประกาศ  3) วางคำตอบด้านล่าง' }),
    el('div', { class: 'buttons' }, copyBtn),
    promptBox,
    box, status,
    el('div', { class: 'buttons' }, readBtn, el('button', { type: 'button', class: 'btn', textContent: 'ปิด', onclick: deps.onClose })),
    el('p', { class: 'muted', textContent: 'AI อาจอ่านผิด โปรดตรวจก่อนบันทึก' }));
  box.focus();
}
