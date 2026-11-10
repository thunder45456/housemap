// Browser E2E for landmarks. __CODE__ replaced at run time (never commit the real code).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('./js/api.js');
  const base = { source_url: '', note: '', added_by: 'e2e', roof: null, facing: null, footprint_w: null, footprint_d: null,
    type: 'house', price_baht: 1000000, usable_sqm: 100, floors: 1, bedrooms: 2, bathrooms: 1, land_sqm: 200 };
  const a = await api.saveParcel(code, { ...base, name: 'LM ใกล้เมือง', lat: 18.7961, lng: 98.9680 }, null);
  const b = await api.saveParcel(code, { ...base, name: 'LM ไกลเมือง', lat: 19.30, lng: 98.60 }, null);

  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);
  const names = () => [...document.querySelectorAll('#list .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));
  const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };

  const rowOf = (n) => [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes(n));
  out.nearRow = rowOf('LM ใกล้เมือง')?.querySelectorAll('.meta')[1]?.textContent;
  out.farRow = rowOf('LM ไกลเมือง')?.querySelectorAll('.meta')[1]?.textContent;

  const selects = document.querySelectorAll('.filters select');
  const distSel = selects[2];
  const distKm = document.querySelector('.filters input[placeholder*=กม]');
  setv(distSel, 'hospital');
  setv(distKm, '3');
  out.within3kmHospital = names().filter((n) => n.startsWith('LM'));
  setv(distKm, '100');
  out.within100km = names().filter((n) => n.startsWith('LM'));
  setv(distKm, '');
  out.filterOff = names().filter((n) => n.startsWith('LM'));
  setv(distSel, '');

  // popup shows nearest list
  rowOf('LM ใกล้เมือง').click();
  await wait(900);
  out.popupNear = $('.leaflet-popup-content .near')?.innerText;

  // toggles draw markers on the canvas layer
  const cb = [...document.querySelectorAll('.toggles input')];
  out.toggleCount = cb.length;
  cb[0].click(); cb[3].click();
  await wait(1200);
  out.canvasPresent = document.querySelectorAll('.leaflet-overlay-pane canvas').length;
  cb[0].click(); cb[3].click();

  for (const p of [a, b]) {
    const cur = (await api.listParcels(code)).find((x) => x.id === p.id);
    await api.setDeleted(code, cur.id, true, cur.version);
  }
  return out;
})()
