import { el, toast } from './ui.js';
import { PICK_CATEGORIES, MAX_PICKS, catOf, pickId, formatKm, withinRadius } from './landmarks.js';
import { fetchRoute, packRoute, round1 } from './routing.js';
import { cleanPicks, cleanNear } from './model.js';
import { decodePolyline } from './polyline.js';

const RADII = [5, 10, 15, 20];
const SHOW_ROWS = 80;

/**
 * "Choose places" panel for one parcel: tick the places (important malls, schools, hospitals, ...) within a radius;
 * every tick draws the driving route and measures road km/minutes. Nothing is stored until "บันทึก".
 *
 * deps: { parcel, getItems(cat) -> Promise<items>, map: {showRoute,hideRoute,clearRoutes,showCandidates,clearCandidates},
 *         canSave(), onSave(picks, routesByPickId), onClose() }
 */
export function renderPicker(root, deps) {
  const p = deps.parcel;
  const origin = { lat: p.lat, lng: p.lng };
  const state = { cat: 'mall', radius: 10, query: '', items: [], busy: new Set(), epoch: 0, closed: false };
  /** id -> { pick: {id,c,name,lat,lng,km,min}, coords: [[lat,lng]], enc: string|null } */
  const chosen = new Map();
  // would the picks still fit the stored record? (cleanNear trims by byte budget, so compare what survives)
  const fitsStore = (picks) => cleanNear({ picks }).picks?.length === picks.length;
  const routeKey = (id) => `pick:${p.id}:${id}`;

  // start from what is already stored on the parcel
  for (const k of p.near?.picks ?? []) {
    const enc = p.routes?.picks?.[k.id] ?? null;
    chosen.set(k.id, { pick: k, enc, coords: enc ? decodePolyline(enc) : null });
  }

  deps.map.clearRoutes();
  const colorOf = (c) => catOf(c)?.color ?? '#555';

  async function draw(entry) {
    if (!entry.coords || entry.coords.length < 2) {
      const r = await fetchRoute(origin, { lat: entry.pick.lat, lng: entry.pick.lng });
      entry.coords = r.coords;
      entry.pick = { ...entry.pick, km: round1(r.km), min: Math.round(r.minutes) };
      entry.enc = packRoute(r.coords, 5000);
    }
    deps.map.showRoute(routeKey(entry.pick.id), entry.coords, colorOf(entry.pick.c));
  }

  async function toggle(it, box) {
    const id = pickId(it.t, it.lat, it.lng);
    if (state.busy.has(id)) return;
    if (chosen.has(id)) {
      chosen.delete(id);
      deps.map.hideRoute(routeKey(id));
      renderRows();
      renderFoot();
      return;
    }
    if (chosen.size + state.busy.size >= MAX_PICKS) {
      box.checked = false;
      toast(`เลือกได้ไม่เกิน ${MAX_PICKS} แห่งต่อรายการ`);
      return;
    }
    // the stored record has a size limit (long Thai names): stop before the save would be rejected
    const trial = [...[...chosen.values()].map((e) => e.pick), { id, c: it.t, name: it.n, lat: it.lat, lng: it.lng, km: 0, min: 0 }];
    if (cleanPicks(trial).length < trial.length || !fitsStore(trial)) {
      box.checked = false;
      toast('เก็บสถานที่ได้เท่านี้แล้ว (ข้อมูลเต็ม) เอาสถานที่อื่นออกก่อน');
      return;
    }
    state.busy.add(id);
    renderFoot();
    box.disabled = true;
    try {
      const entry = { pick: { id, c: it.t, name: it.n, lat: it.lat, lng: it.lng, km: 0, min: 0 }, coords: null, enc: null };
      await draw(entry);
      if (state.closed) { deps.map.hideRoute(routeKey(id)); return; } // panel closed meanwhile
      chosen.set(id, entry);
    } catch (e) {
      box.checked = false;
      toast(e.message);
    } finally {
      state.busy.delete(id);
      if (!state.closed) { renderRows(); renderFoot(); }
    }
  }

  // ---------- UI ----------
  const rows = el('div', { class: 'prows' });
  const foot = el('div', { class: 'meta' });
  const msg = el('div', { class: 'err' });
  const tabs = el('div', { class: 'ptabs' });
  const search = el('input', { type: 'search', placeholder: 'ค้นหาชื่อ', oninput: (e) => { state.query = e.target.value.trim().toLowerCase(); renderRows(); } });
  const radiusSel = el('select', { onchange: (e) => { state.radius = Number(e.target.value); loadCat(); } }, ...RADII.map((r) => el('option', { value: String(r), textContent: `รัศมี ${r} ก.ม.`, selected: r === state.radius })));
  const saveBtn = el('button', { type: 'button', class: 'btn primary', textContent: 'บันทึกที่เลือก', onclick: onSave });
  const cancelBtn = el('button', { type: 'button', class: 'btn', textContent: 'ปิด', onclick: close });

  function renderTabs() {
    tabs.replaceChildren(...PICK_CATEGORIES.map((c) => el('button', {
      type: 'button', class: `btn sm${c.id === state.cat ? ' on' : ''}`, onclick: () => { state.cat = c.id; renderTabs(); loadCat(); },
    }, el('span', { class: 'swatch', style: `background:${c.color}` }), ` ${c.label}`)));
  }

  function renderFoot() {
    foot.textContent = `เลือกแล้ว ${chosen.size}/${MAX_PICKS}${state.busy.size ? ' · กำลังหาเส้นทาง...' : ''} · เส้นทางที่เลือกจะแสดงบนแผนที่ และถูกเก็บเมื่อกดบันทึก`;
    saveBtn.disabled = !deps.canSave() || state.busy.size > 0;
  }

  let markerSig = '';
  function renderRows() {
    const q = state.query;
    // search the whole radius first, then cut to what fits on screen
    const list = state.items.filter((it) => !q || it.n.toLowerCase().includes(q)).slice(0, SHOW_ROWS);
    const shownIds = new Set(list.map((it) => pickId(it.t, it.lat, it.lng)));
    const extra = [...chosen.values()].filter((e) => e.pick.c === state.cat && !shownIds.has(e.pick.id)).map((e) => ({ t: e.pick.c, n: e.pick.name, lat: e.pick.lat, lng: e.pick.lng, straightKm: null }));
    const all = [...extra, ...list];
    rows.replaceChildren();
    if (all.length === 0) rows.append(el('div', { class: 'empty', textContent: state.loading ? 'กำลังโหลด...' : `ไม่พบ${catOf(state.cat).label}ในรัศมี ${state.radius} ก.ม.` }));
    for (const it of all) {
      const id = pickId(it.t, it.lat, it.lng);
      const e = chosen.get(id);
      const box = el('input', { type: 'checkbox', checked: !!e, disabled: state.busy.has(id) });
      const dist = e && e.pick.km ? `ถนน ${formatKm(e.pick.km)} ก.ม. · ${e.pick.min} นาที` : it.straightKm != null ? `เส้นตรง ~${formatKm(it.straightKm)} ก.ม.` : '';
      const row = el('label', { class: 'prow' }, box, el('span', { class: 'swatch', style: `background:${colorOf(it.t)}` }),
        el('span', { class: 'pn' }, it.n, el('span', { class: 'pd', textContent: dist })));
      box.addEventListener('change', () => toggle(it, box));
      rows.append(row);
    }
    // map markers only change when the visible list changes (not on every tick)
    const sig = `${state.cat}|${list.map((it) => `${it.lat},${it.lng}`).join(';')}`;
    if (sig !== markerSig) {
      markerSig = sig;
      deps.map.showCandidates(list, colorOf(state.cat), (it) => `${catOf(state.cat).short}: ${it.n}`);
    }
  }

  async function loadCat() {
    const epoch = ++state.epoch;
    state.loading = true;
    state.items = [];
    renderRows();
    try {
      const items = await deps.getItems(state.cat);
      if (epoch !== state.epoch) return;
      state.items = withinRadius(origin, items, state.cat, state.radius, 600);
    } catch {
      if (epoch === state.epoch) msg.textContent = 'โหลดรายชื่อสถานที่ไม่ได้';
    }
    if (epoch === state.epoch) { state.loading = false; renderRows(); }
  }

  async function onSave() {
    if (!deps.canSave()) return;
    if (state.busy.size) { toast('รอให้หาเส้นทางเสร็จก่อน'); return; }
    saveBtn.disabled = true;
    msg.textContent = '';
    const picks = [];
    const routes = {};
    for (const e of chosen.values()) {
      picks.push(e.pick);
      if (e.enc) routes[e.pick.id] = e.enc;
    }
    try {
      await deps.onSave(picks, routes);
    } catch (e) {
      msg.textContent = e.message || 'บันทึกไม่สำเร็จ';
    } finally {
      saveBtn.disabled = !deps.canSave();
    }
  }

  function close() {
    state.closed = true;
    state.epoch++;
    deps.map.clearCandidates();
    deps.onClose();
  }

  root.replaceChildren(el('div', {},
    el('h2', { textContent: `เลือกสถานที่ · ${p.name}` }),
    el('p', { class: 'muted', textContent: 'ติ๊กเฉพาะที่อยากรู้ระยะทาง/เส้นทาง เช่น ห้างที่ใช้จริง โรงเรียนลูก' }),
    tabs, el('div', { class: 'grid2 prow-ctl' }, radiusSel, search), foot, rows, msg,
    el('div', { class: 'buttons' }, saveBtn, cancelBtn)));
  renderTabs();
  renderFoot();
  // existing picks are drawn straight away (route data is stored with the parcel)
  for (const e of chosen.values()) if (e.coords) deps.map.showRoute(routeKey(e.pick.id), e.coords, colorOf(e.pick.c));
  loadCat();
  return { close };
}
