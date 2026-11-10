import { listParcels, saveParcel } from './api.js';
import { initMap } from './mapview.js';
import { initList, showGate, hideGate, toast } from './ui.js';
import { initForm } from './form.js';
import { renderTrash } from './trash.js';
import { exportJson, planImport } from './importer.js';

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

function setReadOnly(on) {
  readOnly = on;
  const b = $('banner');
  b.textContent = on ? 'เชื่อมต่อฐานข้อมูลไม่ได้ — ดูข้อมูลล่าสุดได้อย่างเดียว (กดรีโหลดเพื่อลองใหม่)' : '';
  b.hidden = !on;
  $('btn-add').disabled = on;
  if (form) form.refreshDisabled();
}

function showTrash(on) {
  $('trash').hidden = !on;
  if (on) {
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

function ensureApp() {
  $('app').hidden = false;
  if (map) return;
  map = initMap($('map'));
  list = initList($('list'), {
    onSelect: (id) => map.focus(id),
    onVisible: (visible) => map.setParcels(visible),
  });
  form = initForm($('form'), {
    listRoot: $('list'),
    map,
    getCode: () => code,
    isReadOnly: () => readOnly,
    onChanged: async (id) => { await reload(); if (id) map.focus(id); },
    onConflict: async (id) => {
      await reload();
      const latest = parcels.find((p) => p.id === id && !p.deleted_at);
      if (latest) form.openEdit(latest);
      else { form.close(); toast('รายการนี้ถูกลบหรือไม่มีแล้ว'); }
    },
    onNetworkError: () => setReadOnly(true),
  });
  map.onMapClick((lat, lng) => { if (form.isOpen() && !readOnly) form.setLocation(lat, lng); });
  map.onEdit((id) => {
    const p = parcels.find((x) => x.id === id);
    if (p && !readOnly) { $('trash').hidden = true; form.openEdit(p); }
  });
  map.invalidateSize();
}

/** Reloads from the database. Returns true on success. */
let reloadSeq = 0;
async function reload() {
  const seq = ++reloadSeq;
  try {
    const data = await listParcels(code);
    if (seq !== reloadSeq || !code) return seq === reloadSeq && !!code; // a newer reload (or logout) superseded this one
    parcels = data;
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
  parcels = data;
  hideGate();
  ensureApp();
  setReadOnly(false);
  list.setParcels(parcels);
}

function logout(message = '') {
  store.clear();
  code = null;
  reloadSeq++;
  parcels = [];
  if (form) form.close();
  $('trash').hidden = true;
  $('list').hidden = false;
  if (list) list.setParcels([]);
  $('app').hidden = true;
  showGate(enter, message);
}

$('btn-add').addEventListener('click', () => { $('trash').hidden = true; form.openNew(); });
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

const remembered = store.get();
if (remembered) {
  enter(remembered).catch((e) => {
    if (e.code === 'bad_code') store.clear();
    showGate(enter, e.message);
  });
} else {
  showGate(enter);
}
