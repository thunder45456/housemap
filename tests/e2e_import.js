// Browser-side E2E for export/import. __CODE__ is replaced at run time (never commit the real code).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('/js/api.js');
  const names = () => [...document.querySelectorAll('#list .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));

  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3000);
  const before = names().length;

  // export: capture the blob
  let exported = null;
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { b.text().then((t) => { exported = t; }); return 'blob:fake'; };
  HTMLAnchorElement.prototype.click = function () { out.downloadName = this.download; };
  $('#btn-export').click();
  await wait(300);
  URL.createObjectURL = realCreate;
  const data = JSON.parse(exported);
  out.export = { app: data.app, count: data.parcels.length };

  const pick = async (obj) => {
    const dt = new DataTransfer();
    dt.items.add(new File([typeof obj === 'string' ? obj : JSON.stringify(obj)], 'x.json', { type: 'application/json' }));
    const input = $('#file-import');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(2500);
  };
  const toastText = () => $('#toast').textContent;

  // a) re-import own export: everything already exists
  window.confirm = () => { out.confirmCalledOnReimport = true; return true; };
  await pick(data);
  out.reimport = { toast: toastText(), rows: names().length - before };

  // b) not JSON
  await pick('not json');
  out.notJson = toastText();

  // c) new parcel, user cancels
  const fresh = { ...data.parcels[0], id: crypto.randomUUID(), name: 'IMPORT ทดสอบ', deleted_at: null };
  let asked = '';
  window.confirm = (m) => { asked = m; return false; };
  await pick({ ...data, parcels: [fresh, { ...fresh, id: 'bad', name: 'bad-id' }] });
  out.cancel = { asked, rowsAdded: names().length - before };

  // d) same file, user confirms
  window.confirm = () => true;
  await pick({ ...data, parcels: [fresh] });
  out.confirmed = { toast: toastText(), hasRow: names().includes('IMPORT ทดสอบ'), rowsAdded: names().length - before };

  // cleanup
  const row = (await api.listParcels(code)).find((p) => p.name === 'IMPORT ทดสอบ' && !p.deleted_at);
  if (row) await api.setDeleted(code, row.id, true, row.version);
  return out;
})()
