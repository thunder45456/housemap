// Browser E2E for the zone overlay UI using a tiny fixture (fetch of zones.json is intercepted). __CODE__ replaced at run time.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('./js/api.js');
  const sq = (la, ln, d) => [la - d, ln - d, la - d, ln + d, la + d, ln + d, la + d, ln - d];
  const fixture = { v: 1, classes: ['industrial', 'commercial', 'residential', 'agriculture', 'forest'], polys: [
    { c: 2, b: [18.78, 98.95, 18.81, 98.99], r: sq(18.7961, 98.968, 0.012) },
    { c: 0, b: [18.90, 99.05, 18.92, 99.07], r: sq(18.91, 99.06, 0.01) },
  ] };
  const realFetch = window.fetch;
  window.fetch = (u, o) => (String(u).includes('zones.json') ? Promise.resolve(new Response(JSON.stringify(fixture))) : realFetch(u, o));

  const base = { source_url: '', note: '', added_by: 'e2e', roof: null, facing: null, footprint_w: null, footprint_d: null, near: null,
    type: 'house', price_baht: 1000000, usable_sqm: 100, floors: 2, bedrooms: 2, bathrooms: 1, land_sqm: 200 };
  const a = await api.saveParcel(code, { ...base, name: 'ZN ในโซนอยู่อาศัย', lat: 18.7961, lng: 98.9680 }, null);
  const b = await api.saveParcel(code, { ...base, name: 'ZN นอกโซน', lat: 19.30, lng: 98.60 }, null);

  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);
  const names = () => [...document.querySelectorAll('#list .row .name')].map((x) => x.textContent.replace(/^[▸▾] /, ''));
  const rowOf = (n) => [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes(n));
  const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };

  rowOf('ZN ในโซนอยู่อาศัย').querySelector('.name').click();
  await wait(900);
  const zoneLine = (n) => [...rowOf(n).querySelectorAll('.details .line')].find((k) => k.textContent.includes('โซน'))?.textContent;
  out.zoneInRes = zoneLine('ZN ในโซนอยู่อาศัย');
  out.popupZone = [...document.querySelectorAll('.leaflet-popup-content div')].map((d) => d.textContent).find((t) => t.includes('โซน'));
  rowOf('ZN ในโซนอยู่อาศัย').querySelector('.name').click();
  rowOf('ZN นอกโซน').querySelector('.name').click();
  await wait(500);
  out.zoneOutside = zoneLine('ZN นอกโซน');
  rowOf('ZN นอกโซน').querySelector('.name').click();

  const zoneSel = [...document.querySelectorAll('.fpanel select')].find((s) => [...s.options].some((o) => o.value === 'residential'));
  const only = (arr) => arr.filter((n) => n.startsWith('ZN'));
  setv(zoneSel, 'residential'); out.filterRes = only(names());
  setv(zoneSel, 'industrial'); out.filterInd = only(names());
  setv(zoneSel, 'unknown'); out.filterUnknown = only(names());
  setv(zoneSel, ''); out.filterOff = only(names());

  const boxes = [...document.querySelectorAll('#layers input')].slice(4);
  out.zoneToggleCount = boxes.length;
  boxes[2].click(); boxes[0].click();
  await wait(1200);
  out.zonePaneCanvas = document.querySelectorAll('.leaflet-zones-pane canvas').length;
  out.pinsStillClickable = document.querySelectorAll('.pin').length > 0;
  boxes[2].click(); boxes[0].click();

  for (const p of [a, b]) {
    const cur = (await api.listParcels(code)).find((x) => x.id === p.id);
    await api.setDeleted(code, cur.id, true, cur.version);
  }
  return out;
})()
