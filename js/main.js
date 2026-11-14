import { listParcels, saveParcel } from './api.js';
import { initMap } from './mapview.js';
import { initList, showGate, hideGate, toast } from './ui.js';
import { initForm } from './form.js';
import { renderTrash } from './trash.js';
import { exportJson, planImport } from './importer.js';
import { loadLandmarks, loadSchools, CATEGORIES, catOf } from './landmarks.js';
import { renderPicker } from './picker.js';
import { fetchRoute, computeNear, computeRoutes } from './routing.js';
import { cleanNear, cleanRoutes, validateParcel, hasNearCats } from './model.js';
import { decodePolyline } from './polyline.js';
import { geocode } from './geocode.js';
import { loadZones, prepareZones, zoneAt, inCoverage } from './zones.js';
import { renderAiPanel } from './aipanel.js';
import { initLayersPanel } from './layers.js';
import { decorate } from './icons.js';

const CODE_KEY = 'housemap.code';
const $ = (id) => document.getElementById(id);

const store = {
  get() { try { return localStorage.getItem(CODE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(CODE_KEY, v); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(CODE_KEY); } catch { /* ignore */ } },
};

let code = null;
let parcels = [];
let readOnly = false;
let map = null;
let list = null;
let form = null;

// ---- road distances (stored with each parcel as `near`) ----
const normalize = (rows) => rows.map((p) => ({ ...p, near: cleanNear(p.near), routes: cleanRoutes(p.routes) }));
const hasNear = (p) => hasNearCats(p.near);
// extra ticked places count too: a parcel can show picks without the automatic nearest ones
const getNear = (p) => (hasNear(p) || p.near?.picks?.length ? p.near : null);

/** A destination of a parcel: an automatic nearest category ('hospital') or a ticked place ('p:<id>'). */
function destOf(p, key) {
  const near = getNear(p);
  if (!near) return null;
  if (key.startsWith('p:')) return near.picks?.find((k) => k.id === key.slice(2)) ?? null;
  return near[key] ?? null;
}
const routeEnc = (p, key) => (key.startsWith('p:') ? p.routes?.picks?.[key.slice(2)] : p.routes?.[key]) ?? null;
const destKeys = (p) => [...CATEGORIES.map((c) => c.id), ...(getNear(p)?.picks ?? []).map((k) => `p:${k.id}`)];

let landmarks = [];
let landmarksReady = Promise.resolve();
async function computeNearFor(lat, lng) {
  await landmarksReady;
  return computeNear({ lat, lng }, landmarks);
}

async function computeRoutesFor(lat, lng, near) {
  return computeRoutes({ lat, lng }, near);
}

/** For parcels saved without distances or without stored routes (older parcels). */
async function fillNear(p) {
  if (readOnly) return;
  toast('กำลังคำนวณ...');
  try {
    let near = hasNear(p) ? p.near : await computeNearFor(p.lat, p.lng);
    if (near !== p.near && p.near?.picks) near = { ...near, picks: p.near.picks };
    let routes = await computeRoutesFor(p.lat, p.lng, near);
    if (p.routes?.picks) routes = { ...routes, picks: p.routes.picks };
    const v = validateParcel({ ...p, near, routes });
    if (!v.ok) { toast('ข้อมูลรายการไม่ครบ กรุณากดแก้ไขแล้วบันทึกใหม่'); return; }
    await saveParcel(code, { ...v.value, id: p.id }, p.version);
    await reload();
    toast('บันทึกระยะทางและเส้นทางแล้ว');
  } catch (e) {
    toast(e.code === 'conflict' ? 'มีคนอื่นแก้รายการนี้แล้ว กดรีโหลดแล้วลองใหม่' : e.message);
  }
}

// ---- land-use zones (OpenStreetMap) ----
let zones = null;
const zoneCache = new Map();
/** undefined = zone data not loaded yet; null = inside the fetched area but no zone mapped; 'outside' = area not fetched */
function getZone(p) {
  if (!zones) return undefined;
  const key = `${p.id}:${p.lat},${p.lng}`;
  if (!zoneCache.has(key)) zoneCache.set(key, inCoverage(p.lat, p.lng, zones) ? zoneAt(p.lat, p.lng, zones) : 'outside');
  return zoneCache.get(key);
}

// ---- AI import queue ----
let aiQueue = [];
let aiIndex = 0;
let aiToken = 0;

function abortAi() {
  aiToken++;
  aiQueue = [];
}

function closeAi() {
  $('ai').hidden = true;
  if (!form.isOpen() && $('trash').hidden) $('list').hidden = false;
}

async function nextAi() {
  const token = aiToken;
  if (aiIndex >= aiQueue.length) { aiQueue = []; toast('นำเข้าด้วย AI ครบแล้ว'); return; }
  const item = aiQueue[aiIndex];
  let { lat, lng } = item.values;
  let hint = '';
  if (lat == null && item.addressText) {
    try {
      const g = await geocode(item.addressText);
      if (g) { lat = g.lat; lng = g.lng; hint = `พิกัดประมาณจากที่อยู่ (${g.label.slice(0, 80)}) ตรวจสอบและลากหมุดปรับ`; }
      else hint = 'หาพิกัดจากที่อยู่ไม่ได้ คลิกบนแผนที่เพื่อวางหมุดเอง';
    } catch {
      hint = 'หาพิกัดจากที่อยู่ไม่ได้ (เชื่อมต่อไม่ได้) คลิกบนแผนที่เพื่อวางหมุดเอง';
    }
  } else if (lat == null) {
    hint = 'ไม่มีที่อยู่หรือพิกัดในข้อมูล คลิกบนแผนที่เพื่อวางหมุด';
  }
  if (token !== aiToken || !code) return; // user abandoned the import (or logged out) while we were geocoding
  form.openNew({ values: item.values, address: item.addressText, lat, lng, hint: `รายการที่ ${aiIndex + 1}/${aiQueue.length}. ${hint}` });
}

function openAiPanel() {
  if (readOnly) return;
  closePicker();
  setSheet('full');
  abortAi();
  form.close();
  $('trash').hidden = true;
  $('list').hidden = true;
  $('ai').hidden = false;
  renderAiPanel($('ai'), {
    onClose: closeAi,
    onItems: (items) => { abortAi(); aiQueue = items; aiIndex = 0; closeAi(); nextAi(); },
  });
}

// ---- coloured driving routes ----
const routeCache = new Map(); // key -> {coords}
const routeShown = new Set(); // keys currently drawn
const routeBusy = new Set(); // keys being fetched
let routeOwner = null;
let routeEpoch = 0; // bump to cancel in-flight "show all" loops and stale fetches

const colorOf = (cat) => (cat.startsWith('p:') ? '#e8590c' : CATEGORIES.find((c) => c.id === cat).color);
const routeKey = (p, cat, n) => `${p.id}:${cat}:${p.lat},${p.lng}:${n.lat},${n.lng}`;

function resetRoutes(owner) {
  routeOwner = owner;
  routeEpoch++;
  routeShown.clear();
  map?.clearRoutes();
}

function clearRoutes() {
  resetRoutes(routeOwner);
  list?.refresh();
}

async function drawRoute(p, cat, epoch) {
  const n = destOf(p, cat);
  if (!n) return;
  const key = routeKey(p, cat, n);
  if (routeBusy.has(key)) return;
  routeBusy.add(key);
  try {
    let r = routeCache.get(key);
    if (!r && routeEnc(p, cat)) {
      const coords = decodePolyline(routeEnc(p, cat));
      if (coords.length >= 2) { r = { coords }; routeCache.set(key, r); }
    }
    if (!r) { r = await fetchRoute({ lat: p.lat, lng: p.lng }, { lat: n.lat, lng: n.lng }); routeCache.set(key, r); } // older parcels: ask the routing server
    if (epoch !== routeEpoch || routeOwner !== p.id) return; // cleared or switched parcel meanwhile
    routeShown.add(key);
    map.showRoute(key, r.coords, cat.startsWith('p:') ? catOf(destOf(p, cat)?.c)?.color ?? colorOf(cat) : colorOf(cat));
  } catch (e) {
    toast(e.message);
  } finally {
    routeBusy.delete(key);
  }
  list?.refresh();
}

async function toggleRoute(p, cat) {
  if (routeOwner !== p.id) resetRoutes(p.id);
  const n = destOf(p, cat);
  if (!n) return;
  const key = routeKey(p, cat, n);
  if (routeShown.has(key)) { routeShown.delete(key); map.hideRoute(key); list.refresh(); return; }
  await drawRoute(p, cat, routeEpoch);
}

async function showAllRoutes(p) {
  if (routeOwner !== p.id) resetRoutes(p.id);
  const epoch = routeEpoch;
  for (const key of destKeys(p)) {
    if (epoch !== routeEpoch) return; // cleared / switched while looping
    const n = destOf(p, key);
    if (!n || routeShown.has(routeKey(p, key, n))) continue;
    await drawRoute(p, key, epoch);
    await new Promise((r) => setTimeout(r, 400)); // be gentle with the free routing server
  }
}

function setReadOnly(on) {
  readOnly = on;
  const b = $('banner');
  b.textContent = on ? 'เชื่อมต่อฐานข้อมูลไม่ได้ — ดูข้อมูลล่าสุดได้อย่างเดียว (กดรีโหลดเพื่อลองใหม่)' : '';
  b.hidden = !on;
  $('btn-add').disabled = on;
  $('btn-ai').disabled = on;
  if (form) form.refreshDisabled();
}

function showTrash(on) {
  $('trash').hidden = !on;
  if (on) {
    setSheet('full');
    abortAi();
    closePicker();
    form.close();
    $('list').hidden = true;
    renderTrash($('trash'), parcels.filter((p) => p.deleted_at), {
      getCode: () => code,
      isReadOnly: () => readOnly,
      onChanged: async () => { if (await reload()) showTrash(true); },
      onClose: () => showTrash(false),
      onNetworkError: () => setReadOnly(true),
    });
  } else if (!form.isOpen()) {
    $('list').hidden = false;
  }
}

function editParcel(id) {
  const p = parcels.find((x) => x.id === id);
  if (p && !readOnly) { setSheet('half'); abortAi(); closePicker(); $('trash').hidden = true; form.openEdit(p); }
}

// ---- extra destinations (ticked places) ----
let picker = null;
let schoolsCache = null;
async function getPickItems(cat) {
  if (cat === 'school') {
    if (!schoolsCache) schoolsCache = loadSchools().catch((e) => { schoolsCache = null; throw e; });
    return schoolsCache;
  }
  await landmarksReady;
  return landmarks;
}

function closePicker() {
  if (!picker) return;
  picker.close?.();
  picker = null;
  $('pick').hidden = true;
  resetRoutes(null);
  if (!form.isOpen() && $('trash').hidden) $('list').hidden = false;
}

function openPicker(p) {
  setSheet('full');
  abortAi();
  form.close();
  $('trash').hidden = true;
  $('ai').hidden = true;
  closePicker();
  $('list').hidden = true;
  $('pick').hidden = false;
  resetRoutes(p.id);
  picker = renderPicker($('pick'), {
    parcel: p,
    getItems: getPickItems,
    map,
    canSave: () => !readOnly,
    onSave: async (picks, routesById) => {
      const latest = parcels.find((x) => x.id === p.id) ?? p;
      const v = validateParcel({ ...latest, near: { ...(latest.near ?? {}), picks }, routes: { ...(latest.routes ?? {}), picks: routesById } });
      if (!v.ok) throw new Error('ข้อมูลรายการไม่ครบ กรุณากดแก้ไขแล้วบันทึกใหม่');
      try {
        await saveParcel(code, { ...v.value, id: latest.id }, latest.version);
      } catch (e) {
        throw new Error(e.code === 'conflict' ? 'มีคนอื่นแก้รายการนี้แล้ว กดปิด รีโหลด แล้วเลือกใหม่' : e.message);
      }
      toast('บันทึกสถานที่ที่เลือกแล้ว');
      closePicker();
      await reload();
      list.expand(latest.id);
    },
    onClose: () => { picker = null; $('pick').hidden = true; resetRoutes(null); if (!form.isOpen() && $('trash').hidden) $('list').hidden = false; },
  });
}

// ---- bottom sheet (phone layout; on desktop the handle is hidden and these states have no effect) ----
const SHEET_CYCLE = ['half', 'full', 'mini'];
function setSheet(state) {
  const side = $('side');
  if (side.dataset.sheet === state) return;
  side.dataset.sheet = state;
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50); // let Leaflet re-measure the map
}
$('sheet-handle').addEventListener('click', () => {
  const cur = $('side').dataset.sheet;
  setSheet(SHEET_CYCLE[(SHEET_CYCLE.indexOf(cur) + 1) % SHEET_CYCLE.length]);
});

function ensureApp() {
  $('app').hidden = false;
  if (map) return;
  map = initMap($('map'));
  list = initList($('list'), {
    onSelect: (id) => { if (id) { setSheet('half'); map.focus(id); } if (id !== routeOwner) resetRoutes(id); },
    onRoute: toggleRoute,
    onRouteAll: showAllRoutes,
    onClearRoutes: clearRoutes,
    onEdit: editParcel,
    onComputeNear: fillNear,
    onPick: (p) => { if (!readOnly) openPicker(p); },
    canEdit: () => !readOnly,
    routeInfo: (id, cat) => {
      const p = parcels.find((x) => x.id === id);
      const n = p && destOf(p, cat);
      return n ? { shown: routeShown.has(routeKey(p, cat, n)) } : null;
    },
    onVisible: (visible) => map.setParcels(visible),
    getNear,
    getZone,
  });
  const layersUi = initLayersPanel($('layers'), {
    onLandmarkToggle: (set) => map.showLandmarkCategories(set),
    onZoneToggle: (set) => map.showZoneClasses(set),
  });
  map.setNearFn(getNear);
  map.setZoneFn(getZone);
  // zone data is ~1.3 MB: fetch it after the first paint so it does not compete with the parcel list
  const afterPaint = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
  afterPaint(() => loadZones().then((d) => {
    zones = prepareZones(d);
    zoneCache.clear();
    map.setZones(zones);
    layersUi.setZonesAvailable(true);
    list.setZonesAvailable(true);
    list.refresh();
  }).catch(() => { /* zone data is optional: the zone UI simply stays hidden */ }));
  landmarksReady = loadLandmarks().then((items) => {
    landmarks = items;
    map.setLandmarks(items);
  });
  landmarksReady.catch(() => toast('โหลดข้อมูลสถานที่สำคัญไม่ได้'));
  form = initForm($('form'), {
    listRoot: $('list'),
    map,
    getCode: () => code,
    isReadOnly: () => readOnly,
    computeNear: computeNearFor,
    computeRoutes: computeRoutesFor,
    queueActive: () => aiQueue.length > 0,
    onChanged: async (id) => { resetRoutes(null); await reload(); if (id) map.focus(id); },
    onConflict: async (id) => {
      await reload();
      const latest = parcels.find((p) => p.id === id && !p.deleted_at);
      if (latest) form.openEdit(latest);
      else { form.close(); toast('รายการนี้ถูกลบหรือไม่มีแล้ว'); }
    },
    onNetworkError: () => setReadOnly(true),
    onFinished: () => { if (aiQueue.length) { aiIndex++; nextAi(); } },
    onAbortQueue: () => { abortAi(); toast('หยุดนำเข้าที่เหลือแล้ว'); },
  });
  map.onMapClick((lat, lng) => { if (form.isOpen() && !readOnly) form.setLocation(lat, lng); });
  map.onEdit(editParcel);
  map.invalidateSize();
}

/** Reloads from the database. Returns true on success. */
let reloadSeq = 0;
async function reload() {
  const seq = ++reloadSeq;
  try {
    const data = await listParcels(code);
    if (seq !== reloadSeq || !code) return seq === reloadSeq && !!code; // a newer reload (or logout) superseded this one
    parcels = normalize(data);
    setReadOnly(false);
    list.setParcels(parcels);
    return true;
  } catch (e) {
    if (seq !== reloadSeq || !code) return false;
    if (e.code === 'bad_code') logout('รหัสกลุ่มถูกเปลี่ยนแล้ว กรุณาใส่รหัสใหม่');
    else { setReadOnly(true); toast(e.message); }
    return false;
  }
}

async function enter(c) {
  const data = await listParcels(c); // throws ApiError on bad code / network
  code = c;
  store.set(c);
  parcels = normalize(data);
  hideGate();
  ensureApp();
  setReadOnly(false);
  list.setParcels(parcels);
}

function logout(message = '') {
  store.clear();
  code = null;
  reloadSeq++;
  abortAi();
  resetRoutes(null);
  $('ai').hidden = true;
  closePicker();
  parcels = [];
  if (form) form.close();
  $('trash').hidden = true;
  $('list').hidden = false;
  if (list) list.setParcels([]);
  $('app').hidden = true;
  showGate(enter, message);
}

$('btn-add').addEventListener('click', () => { setSheet('half'); abortAi(); closePicker(); $('trash').hidden = true; $('ai').hidden = true; form.openNew(); });
$('btn-ai').addEventListener('click', openAiPanel);
$('btn-reload').addEventListener('click', async () => { if (await reload() && !$('trash').hidden) showTrash(true); });
$('btn-trash').addEventListener('click', () => showTrash($('trash').hidden));
$('btn-logout').addEventListener('click', () => logout());

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([exportJson(parcels)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `housemap-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('btn-import').addEventListener('click', () => { if (!readOnly) $('file-import').click(); });
$('file-import').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const plan = planImport(await file.text(), parcels);
  if (plan.error) return toast(plan.error);
  const summary = `เพิ่ม ${plan.toAdd.length} / ข้าม ${plan.skipped.length} / ผิดพลาด ${plan.invalid.length}`;
  if (plan.toAdd.length === 0) return toast(`ไม่มีรายการให้เพิ่ม (${summary})`);
  if (!confirm(`นำเข้าข้อมูล: ${summary}\nดำเนินการต่อไหม?`)) return;
  let ok = 0;
  let failed = 0;
  for (const p of plan.toAdd) {
    try { await saveParcel(code, p, null); ok++; } catch (e) {
      failed++;
      if (e.code === 'network') { setReadOnly(true); break; }
      if (e.code === 'bad_code') { logout('รหัสกลุ่มถูกเปลี่ยนแล้ว กรุณาใส่รหัสใหม่'); return; }
    }
  }
  await reload();
  toast(`นำเข้าสำเร็จ ${ok}${failed ? ` / ไม่สำเร็จ ${failed}` : ''}`);
});

decorate(); // icons on the toolbar buttons

const remembered = store.get();
if (remembered) {
  enter(remembered).catch((e) => {
    if (e.code === 'bad_code') store.clear();
    showGate(enter, e.message);
  });
} else {
  showGate(enter);
}
