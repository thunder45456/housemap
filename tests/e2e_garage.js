// Browser E2E for the garage field. __CODE__ replaced at run time.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('./js/api.js');
  const base = { source_url: '', note: '', added_by: 'e2e', roof: null, facing: null, footprint_w: null, footprint_d: null, near: null,
    type: 'house', price_baht: 1000000, usable_sqm: 100, floors: 2, bedrooms: 2, bathrooms: 1, land_sqm: 200 };
  const a = await api.saveParcel(code, { ...base, garage: true, name: 'GR บ้านมีโรงรถ', lat: 18.7961, lng: 98.9680 }, null);
  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);
  const rowOf = () => [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes('GR บ้านมีโรงรถ'));
  rowOf().querySelector('.name').click();
  await wait(700);
  out.lines = [...rowOf().querySelectorAll('.details .line')].map((x) => x.textContent.trim());
  out.priceShown = rowOf().querySelector('.rprice').textContent;
  [...rowOf().querySelectorAll('.details .actions-row button')].find((b) => b.textContent.includes('แก้ไข')).click();
  await wait(500);
  const label = [...document.querySelectorAll('#form label')].find((l) => l.textContent.startsWith('โรงรถ'));
  const sel = label.nextElementSibling;
  out.formValue = sel.value;
  sel.value = 'no';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  $('#form form').requestSubmit();
  for (let i = 0; i < 100 && !$('#form').hidden; i++) await wait(150);
  await wait(600);
  const row = (await api.listParcels(code)).find((x) => x.id === a.id);
  out.dbGarage = row.garage;
  out.dbNearStored = !!row.near;
  await api.setDeleted(code, row.id, true, row.version);
  return out;
})()
