// Browser-side E2E script for edge_check.mjs --eval. __CODE__ is replaced at run time (never commit the real code).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('/js/api.js');
  window.confirm = () => true;

  const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  const formEl = (label) => [...document.querySelectorAll('#form label')].find((l) => l.textContent.startsWith(label)).nextElementSibling;
  const mapClick = () => {
    const r = $('#map').getBoundingClientRect();
    const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    $('#map').dispatchEvent(new MouseEvent('mousedown', o));
    $('#map').dispatchEvent(new MouseEvent('mouseup', o));
    $('#map').dispatchEvent(new MouseEvent('click', o));
  };
  const names = () => [...document.querySelectorAll('#list .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));
  const errs = () => [...document.querySelectorAll('#form .err')].map((e) => e.textContent).filter(Boolean);

  // login
  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3000);

  // 1. invalid submit: nothing filled, no pin
  $('#btn-add').click();
  await wait(200);
  $('#form form').requestSubmit();
  await wait(300);
  out.emptyErrors = errs();

  // 2. javascript: link rejected
  setv(formEl('ชื่อ'), 'E2E บ้านทดสอบ');
  setv(formEl('ลิงก์ต้นทาง'), 'javascript:alert(1)');
  setv(formEl('ชื่อคนเพิ่ม'), 'e2e');
  mapClick();
  await wait(300);
  out.locAfterClick = $('#form .meta').textContent;
  $('#form form').requestSubmit();
  await wait(300);
  out.jsLinkErrors = errs();

  // 3. valid save with blank price
  setv(formEl('ลิงก์ต้นทาง'), 'https://example.com/x');
  $('#form form').requestSubmit();
  await wait(2500);
  out.afterSave = { formHidden: $('#form').hidden, rows: names() };
  setv($('.fpanel select:nth-child(2)'), 'price:asc');
  out.blankPriceLast = names().slice(-1)[0];
  const savedRow = (await api.listParcels(code)).find((p) => p.name === 'E2E บ้านทดสอบ' && !p.deleted_at);
  out.savedWithRoadDistances = savedRow?.near ? Object.entries(savedRow.near).map(([k, v]) => `${k}:${v ? v.km : null}`) : null;

  // 4. conflict: open edit, another "user" bumps the version, then save
  const mine = (await api.listParcels(code)).find((p) => p.name === 'E2E บ้านทดสอบ');
  [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes('E2E บ้านทดสอบ')).querySelector('.name').click();
  await wait(800);
  $('.leaflet-popup-content button').click();
  await wait(300);
  out.editTitle = $('#form h2').textContent;
  await api.saveParcel(code, { ...mine, note: 'จากเพื่อนคนอื่น', roof: null, facing: null }, mine.version);
  setv(formEl('หมายเหตุ'), 'ของฉัน (เก่า)');
  $('#form form').requestSubmit();
  await wait(1500);
  out.conflictMsg = $('#form .err:not(:empty)')?.textContent;
  out.conflictBtnVisible = !![...document.querySelectorAll('#form button')].find((b) => b.textContent === 'โหลดข้อมูลล่าสุด' && !b.hidden);
  out.dbNoteAfterConflict = (await api.listParcels(code)).find((p) => p.id === mine.id).note;

  // 5. reload latest, then delete -> trash -> restore
  [...document.querySelectorAll('#form button')].find((b) => b.textContent === 'โหลดข้อมูลล่าสุด').click();
  await wait(1500);
  out.noteAfterReload = formEl('หมายเหตุ').value;
  [...document.querySelectorAll('#form button')].find((b) => b.textContent === 'ลบ').click();
  await wait(1500);
  out.afterDeleteRows = names();
  $('#btn-trash').click();
  await wait(300);
  out.trashRows = [...document.querySelectorAll('#trash .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));
  [...document.querySelectorAll('#trash button')].find((b) => b.textContent === 'กู้คืน' && b.closest('.row').textContent.includes('E2E')).click();
  await wait(1800);
  out.afterRestoreRows = names();

  // 6. network failure -> read only
  const realFetch = window.fetch;
  window.fetch = () => Promise.reject(new TypeError('offline'));
  $('#btn-reload').click();
  await wait(600);
  out.offline = { banner: $('#banner').textContent, addDisabled: $('#btn-add').disabled, bannerVisible: !$('#banner').hidden };
  window.fetch = realFetch;
  $('#btn-reload').click();
  await wait(1500);
  out.recovered = { bannerHidden: $('#banner').hidden, addDisabled: $('#btn-add').disabled };

  // cleanup: soft-delete the e2e parcel
  const again = (await api.listParcels(code)).find((p) => p.name === 'E2E บ้านทดสอบ' && !p.deleted_at);
  if (again) await api.setDeleted(code, again.id, true, again.version);
  return out;
})()
