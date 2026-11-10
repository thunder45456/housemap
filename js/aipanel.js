import { el, toast } from './ui.js';
import { buildPrompt, extractItems, normalizeItem } from './aiimport.js';

/** deps: { onItems(items), onClose() } where items = normalizeItem() results */
export function renderAiPanel(root, deps) {
  const status = el('div', { class: 'err' });
  const box = el('textarea', { rows: 8, placeholder: 'วางคำตอบของ AI ที่นี่ (JSON)' });
  const copyBtn = el('button', { type: 'button', textContent: 'คัดลอก prompt', onclick: async () => {
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
  const readBtn = el('button', { type: 'button', class: 'primary', textContent: 'อ่านคำตอบ แล้วเปิดฟอร์ม', onclick: () => {
    const { items, error } = extractItems(box.value);
    if (error) { status.textContent = error; return; }
    status.textContent = '';
    deps.onItems(items.map(normalizeItem));
  } });
  root.replaceChildren(
    el('h2', { textContent: 'นำเข้าด้วย AI' }),
    el('p', { class: 'meta', textContent: '1) คัดลอก prompt  2) นำไปวางใน AI (เช่น Claude) พร้อมข้อความหรือรูปจากหน้าประกาศ  3) วางคำตอบกลับมาด้านล่าง เว็บจะเปิดฟอร์มที่กรอกให้แล้ว ให้คุณตรวจและกดบันทึก' }),
    el('div', { class: 'buttons' }, copyBtn),
    promptBox,
    el('label', { textContent: 'คำตอบจาก AI' }),
    box, status,
    el('div', { class: 'buttons' }, readBtn, el('button', { type: 'button', textContent: 'ปิด', onclick: deps.onClose })),
    el('p', { class: 'meta', textContent: 'AI อาจอ่านผิด ตรวจทุกช่องก่อนบันทึก และอย่าใส่เบอร์โทรหรือข้อมูลส่วนตัว' }));
  box.focus();
}
