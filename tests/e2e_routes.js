// Browser E2E for expandable details + coloured routes. __CODE__ replaced at run time.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = '__CODE__';
  const api = await import('./js/api.js');
  const base = { source_url: 'https://example.com/listing', note: 'หมายเหตุทดสอบ', added_by: 'e2e', roof: null, facing: null, footprint_w: null, footprint_d: null,
    type: 'house', price_baht: 1000000, usable_sqm: 100, floors: 2, bedrooms: 2, bathrooms: 1, land_sqm: 200 };
  const rt = await import('./js/routing.js');
  const lm = (await (await fetch('landmarks.json')).json()).items;
  const nearA = await rt.computeNear({ lat: 18.7961, lng: 98.9680 }, lm);
  const routesA = await rt.computeRoutes({ lat: 18.7961, lng: 98.9680 }, nearA);
  const a = await api.saveParcel(code, { ...base, near: nearA, routes: routesA, name: 'RT บ้านทดสอบ', lat: 18.7961, lng: 98.9680 }, null);
  const stored = (await api.listParcels(code)).find((x) => x.id === a.id);
  out.storedNear = !!stored.near;
  out.storedRoutes = Object.values(stored.routes || {}).filter(Boolean).length;

  let osrmCalls = 0;
  const realFetch = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('router.project-osrm.org')) osrmCalls++; return realFetch(u, o); };
  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);
  const rowOf = () => [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes('RT บ้านทดสอบ'));
  out.detailsBefore = !!rowOf().querySelector('.details');
  rowOf().querySelector('.name').click();
  await wait(700);
  const d = rowOf().querySelector('.details');
  out.detailsAfter = !!d;
  out.detailsText = [...d.querySelectorAll('.line')].map((x) => x.textContent.trim());
  out.linkOk = d?.querySelector('a')?.href;
  const paths = () => [...document.querySelectorAll('.leaflet-overlay-pane svg path')].map((p) => p.getAttribute('stroke')).filter((c) => c && c !== '#fff');

  const btns = () => [...rowOf().querySelectorAll('.line.route .rbtn')];
  out.routeButtons = btns().length;
  btns()[0].click();
  await wait(4000);
  out.afterOne = { strokes: paths(), text: rowOf().querySelector('.line.route .t').textContent, on: btns()[0].classList.contains('on') };
  btns()[0].click();
  await wait(300);
  out.afterHide = paths();

  [...rowOf().querySelectorAll('.details .actions-row button')].find((b) => b.textContent.includes('ทุกเส้นทาง')).click();
  await wait(9000);
  out.afterAll = [...new Set(paths())];
  [...rowOf().querySelectorAll('.details .actions-row button')].find((b) => b.textContent.includes('ล้าง')).click();
  await wait(300);
  out.afterClear = paths();
  out.osrmCallsWhileDrawing = osrmCalls;

  rowOf().querySelector('.name').click();
  await wait(300);
  out.collapsed = !rowOf().querySelector('.details');

  const cur = (await api.listParcels(code)).find((x) => x.id === a.id);
  await api.setDeleted(code, cur.id, true, cur.version);
  return out;
})()
