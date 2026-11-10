import { listParcels, saveParcel } from './api.js';
import { initMap } from './mapview.js';
import { initList, showGate, hideGate, toast } from './ui.js';
import { initForm } from './form.js';
import { renderTrash } from './trash.js';
import { exportJson, planImport } from './importer.js';
import { loadLandmarks, CATEGORIES } from './landmarks.js';
import { fetchRoute, computeNear } from './routing.js';
import { cleanNear, validateParcel } from './model.js';
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
const normalize = (rows) => rows.map((p) => ({ ...p, near: cleanNear(p.near) }));
const hasNear = (p) => !!p.near && Object.values(p.near).some(Boolean);
const getNear = (p) => (hasNear(p) ? p.near : null);

let landmarks = [];
let landmarksReady = Promise.resolve();
async function computeNearFor(lat, lng) {
  await landmarksReady;
  return computeNear({ lat, lng }, landmarks);
}

/** For parcels saved without distances (or before this feature existed). */
async function fillNear(p) {
  if (readOnly) return;
  toast('กำลังคำนวณระยะทางถนน...');
  try {
    const near = await computeNearFor(p.lat, p.lng);
    const v = validateParcel({ ...p, near });
    if (!v.ok) { toast('ข้อมูลรายการไม่ครบ กรุณากดแก้ไขแล้วบันทึกใหม่'); return; }
    await saveParcel(code, { ...v.value, id: p.id }, p.version);
    await reload();
    toast('คำนวณและบันทึกระยะทางแล้ว');
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

const colorOf = (cat) => CATEGORIES.find((c) => c.id === cat).color;
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
  const n = getNear(p)?.[cat];
  if (!n) return;
  const key = routeKey(p, cat, n);
  if (routeBusy.has(key)) return;
  routeBusy.add(key);
  try {
    let r = routeCache.get(key);
    if (!r) { r = await fetchRoute({ lat: p.lat, lng: p.lng }, { lat: n.lat, lng: n.lng }); routeCache.set(key, r); }
    if (epoch !== routeEpoch || routeOwner !== p.id) return; // cleared or switched parcel meanwhile
    routeShown.add(key);
    map.showRoute(key, r.coords, colorOf(cat));
  } catch (e) {
    toast(e.message);
  } finally {
    routeBusy.delete(key);
  }
  list?.refresh();
}

async function toggleRoute(p, cat) {
  if (routeOwner !== p.id) resetRoutes(p.id);
  const n = getNear(p)?.[cat];
  if (!n) return;
  const key = routeKey(p, cat, n);
  if (routeShown.has(key)) { routeShown.delete(key); map.hideRoute(key); list.refresh(); return; }
  await drawRoute(p, cat, routeEpoch);
}

async function showAllRoutes(p) {
  if (routeOwner !== p.id) resetRoutes(p.id);
  const epoch = routeEpoch;
  for (const c of CATEGORIES) {
    if (epoch !== routeEpoch) return; // cleared / switched while looping
    const n = getNear(p)?.[c.id];
    if (!n || routeShown.has(routeKey(p, c.id, n))) continue;
    await drawRoute(p, c.id, epoch);
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
  if (p && !readOnly) { setSheet('half'); abortAi(); $('trash').hidden = true; form.openEdit(p); }
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
    canEdit: () => !readOnly,
    routeInfo: (id, cat) => {
      const p = parcels.find((x) => x.id === id);
      const n = p && getNear(p)?.[cat];
      return n ? { shown: routeShown.has(routeKey(p, cat, n)) } : null;
    },
    onVisible: (visible) => map.setParcels(visible),
    getNear,
    getZone,
  });
  initLayersPanel($('layers'), {
    onLandmarkToggle: (set) => map.showLandmarkCategories(set),
    onZoneToggle: (set) => map.showZoneClasses(set),
  });
  map.setNearFn(getNear);
  map.setZoneFn(getZone);
  loadZones().then((d) => {
    zones = prepareZones(d);
    zoneCache.clear();
    map.setZones(zones);
    list.refresh();
  }).catch(() => toast('โหลดข้อมูลโซนพื้นที่ไม่ได้'));
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
  parcels = [];
  if (form) form.close();
  $('trash').hidden = true;
  $('list').hidden = false;
  if (list) list.setParcels([]);
  $('app').hidden = true;
  showGate(enter, message);
}

$('btn-add').addEventListener('click', () => { setSheet('half'); abortAi(); $('trash').hidden = true; $('ai').hidden = true; form.openNew(); });
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
