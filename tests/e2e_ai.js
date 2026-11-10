// Browser E2E for AI import. __CODE__ replaced at run time.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('./js/api.js');
  window.confirm = () => true;
  const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const formEl = (label) => [...document.querySelectorAll('#form label')].find((l) => l.textContent.startsWith(label)).nextElementSibling;
  const mapClick = () => {
    const r = $('#map').getBoundingClientRect();
    const o = { bubbles: true, clientX: r.left + r.width / 3, clientY: r.top + r.height / 3 };
    for (const t of ['mousedown', 'mouseup', 'click']) $('#map').dispatchEvent(new MouseEvent(t, o));
  };
  const names = () => [...document.querySelectorAll('#list .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));

  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);

  $('#btn-ai').click();
  await wait(300);
  out.panelOpen = !$('#ai').hidden && $('#list').hidden;
  const readBtn = () => [...document.querySelectorAll('#ai button')].find((b) => b.textContent.startsWith('อ่านคำตอบ'));

  // bad paste
  $('#ai textarea:not([readonly])').value = 'ขออภัย ฉันอ่านรูปไม่ได้';
  readBtn().click();
  out.badPaste = $('#ai .err').textContent;

  // good paste with chatter + fenced json, 2 items
  const reply = 'ได้เลยครับ นี่คือข้อมูล:\n```json\n' + JSON.stringify([
    { type: 'ที่ดิน', name: 'AI ที่ดินแม่ริม', price_baht: '2,500,000', land_rai: 1, land_ngan: 2, land_wah: 25,
      address_text: 'ตำบลแม่ริม อำเภอแม่ริม เชียงใหม่', note: 'ใกล้ถนนใหญ่', source_url: 'https://example.com/land' },
    { type: 'house', name: 'AI บ้านพิกัดครบ', price_baht: 4200000, usable_sqm: 150, land_wah: 60, floors: 2, bedrooms: 3, bathrooms: 2,
      lat: 18.8, lng: 98.99, facing: 'ใต้', roof: 'จั่ว' },
  ]) + '\n```\nหวังว่าจะช่วยได้';
  $('#ai textarea:not([readonly])').value = reply;
  readBtn().click();
  await wait(4500);

  out.form1 = {
    title: $('#form h2').textContent,
    name: formEl('ชื่อ').value,
    price: formEl('ราคา').value,
    landSize: formEl('ขนาดที่ดิน').querySelector('input').value,
    landUnit: formEl('ขนาดที่ดิน').querySelector('select').value,
    type: formEl('ประเภท').value,
    note: formEl('หมายเหตุ').value,
    hint: $('#form .meta + .meta')?.textContent || [...document.querySelectorAll('#form .meta')].map((m) => m.textContent).join(' | '),
  };
  const hasPin = !/ยังไม่ได้วางหมุด/.test($('#form').innerText);
  out.geocodedPin = hasPin;
  if (!hasPin) mapClick();
  await wait(300);
  setv(formEl('ชื่อคนเพิ่ม'), 'e2e-ai');
  $('#form form').requestSubmit();
  await wait(3000);

  out.form2 = { title: $('#form h2')?.textContent, hidden: $('#form').hidden, name: formEl('ชื่อ')?.value,
    price: formEl('ราคา')?.value, beds: formEl('ห้องนอน')?.value, hasPin: !/ยังไม่ได้วางหมุด/.test($('#form').innerText),
    landWah: formEl('ขนาดที่ดิน')?.querySelector('input').value };
  setv(formEl('ชื่อคนเพิ่ม'), 'e2e-ai');
  $('#form form').requestSubmit();
  await wait(3000);
  out.after = { formHidden: $('#form').hidden, rows: names().filter((n) => n.startsWith('AI ')) };

  const all = await api.listParcels(code);
  const saved = all.filter((p) => p.name.startsWith('AI ') && !p.deleted_at);
  out.saved = saved.map((p) => ({ name: p.name, land_sqm: p.land_sqm, price: p.price_baht, by: p.added_by, hasNoteAddress: p.note.includes('ที่อยู่:'), lat: p.lat, lng: p.lng }));
  for (const p of saved) await api.setDeleted(code, p.id, true, p.version);
  return out;
})()
