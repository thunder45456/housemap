// Browser-side E2E (edge_check.mjs --eval): coordinates/link input, land vs house, rate pricing, auto name, picker.
// Supabase is faked in the page (no real database is touched), so no group code is needed.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { /* retry */ } await wait(200); } return false; };
  const $ = (s) => document.querySelector(s);
  const out = {};
  const code = 'fake';
  const db = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url).includes('/functions/v1/resolve-maps-link')) {
      if (!window.__fnOn) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ url: 'https://www.google.com/maps/place/x/@18.8179461,99.0632902,17z/data=!3d18.81678!4d99.063812' }), { status: 200 });
    }
    if (!String(url).includes('supabase.co/rest/v1/rpc/')) return realFetch(url, init);
    const fn = String(url).split('/rpc/')[1];
    const a = JSON.parse(init.body);
    const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (fn === 'list_parcels') return ok(db.map((r) => ({ ...r })));
    if (fn === 'save_parcel') {
      const v = a.p_parcel;
      let r = v.id ? db.find((x) => x.id === v.id) : null;
      if (!r) { r = { id: crypto.randomUUID(), version: 1, created_at: new Date().toISOString(), deleted_at: null }; db.push(r); } else r.version++;
      Object.assign(r, v, { id: r.id });
      return ok({ ...r });
    }
    if (fn === 'set_deleted') { const r = db.find((x) => x.id === a.p_id); r.deleted_at = a.p_deleted ? 'x' : null; r.version++; return ok({ ...r }); }
    return ok(null);
  };
  const api = await import('/js/api.js');
  window.confirm = () => true;
  const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  const lab = (t) => [...document.querySelectorAll('#form label')].find((l) => l.textContent.startsWith(t));
  const formEl = (t) => lab(t).nextElementSibling;

  $('#gate input').value = code;
  $('#gate form').requestSubmit();
  await wait(3500);

  $('#btn-add').click();
  await wait(300);
  // land hides house-only fields
  const houseOnly = () => $('#form form > div:nth-of-type(3)');
  out.houseFieldsVisibleForHouse = !!lab('ห้องนอน')?.offsetParent;
  setv($('#form select'), 'land');
  await wait(100);
  out.houseFieldsVisibleForLand = !!lab('ห้องนอน')?.offsetParent;
  // google link -> coordinates
  const locInput = [...document.querySelectorAll('#form input')].find((i) => i.placeholder.startsWith('วางพิกัด'));
  setv(locInput, 'https://www.google.com/maps/place/Foo/@18.7961,98.968,17z/data=!3d18.7955!4d98.9671');
  await wait(300);
  out.locAfterLink = $('#form .meta:not(.hint)').textContent;
  setv(locInput, 'https://maps.app.goo.gl/abc');
  await wait(1200);
  out.shortLinkNoFn = locInput.nextElementSibling.textContent.slice(0, 30);
  window.__fnOn = true;
  setv(locInput, 'https://maps.app.goo.gl/abd');
  await wait(1500);
  out.shortLinkWithFn = locInput.nextElementSibling.textContent;
  setv(locInput, '18.7955, 98.9671');
  await wait(300);
  out.locAfterCoord = [...document.querySelectorAll('#form .meta')].map((m) => m.textContent).find((t) => /^\d+\.\d+, /.test(t));
  // rate pricing: 35000 / wah x 100 wah
  setv(formEl('ขนาดที่ดิน').querySelector('input'), '100');
  const priceSel = [...document.querySelectorAll('#form select')].find((s) => [...s.options].some((o) => o.value === 'rate'));
  setv(priceSel, 'rate');
  const priceIn = [...document.querySelectorAll('#form input')].find((i) => i.placeholder.startsWith('บาทต่อหน่วย'));
  setv(priceIn, '35000');
  await wait(200);
  out.preview = [...document.querySelectorAll('#form .meta.hint')].map((m) => m.textContent).filter(Boolean);
  setv(formEl('ชื่อคนเพิ่ม'), 'e2e');
  $('#form form').requestSubmit();
  await waitFor(() => $('#form').hidden, 40000);
  await wait(800);
  const row = [...document.querySelectorAll('#list .row')].find((r) => r.textContent.includes('ที่ดิน 3.5M 100ตร.วา'));
  out.autoNameRow = row ? row.querySelector('.name').textContent : null;
  const mine = db.find((p) => p.added_by === 'e2e' && p.type === 'land');
  out.saved = mine ? { price: mine.price_baht, land: mine.land_sqm, beds: mine.bedrooms, name: mine.name } : null;

  if (mine) {
    row.querySelector('.rhead').click();
    await wait(500);
    out.details = [...document.querySelectorAll('#list .details .line .t')].map((x) => x.textContent);
    // picker
    [...document.querySelectorAll('#list .details button')].find((b) => b.textContent.includes('เลือกสถานที่')).click();
    await wait(600);
    out.pickerTitle = $('#pick h2')?.textContent;
    [...document.querySelectorAll('#pick .ptabs button')].find((b) => b.textContent.includes('โรงเรียน')).click();
    await waitFor(() => document.querySelectorAll('#pick .prow').length > 0);
    out.schoolRows = document.querySelectorAll('#pick .prow').length;
    out.firstSchool = $('#pick .prow .pn')?.textContent;
    $('#pick .prow input').click();
    await waitFor(() => /เลือกแล้ว 1\//.test($('#pick .meta').textContent), 30000);
    out.afterTick = $('#pick .meta').textContent.slice(0, 20);
    out.routeDrawn = document.querySelectorAll('.leaflet-overlay-pane path').length > 0;
    [...document.querySelectorAll('#pick .ptabs button')].find((b) => b.textContent.includes('ห้าง')).click();
    await waitFor(() => document.querySelectorAll('#pick .prow').length > 0);
    out.mallRows = [...document.querySelectorAll('#pick .prow .pn')].slice(0, 6).map((x) => x.textContent);
    [...document.querySelectorAll('#pick button')].find((b) => b.textContent === 'บันทึกที่เลือก').click();
    await waitFor(() => $('#pick').hidden, 20000);
    await wait(1200);
    const after = db.find((p) => p.id === mine.id);
    out.dbPicks = after.near?.picks?.map((k) => `${k.c}:${k.km}km`) ?? null;
    out.dbRoutePicks = after.routes?.picks ? Object.keys(after.routes.picks).length : 0;
    out.detailsAfter = [...document.querySelectorAll('#list .details .line .t')].map((x) => x.textContent);
  }
  return out;
})()
