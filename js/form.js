import { el, toast } from './ui.js';
import { validateParcel, cleanNear } from './model.js';
import { toSqm, fromSqm } from './units.js';
import { saveParcel, setDeleted } from './api.js';

const NAME_KEY = 'housemap.name';
const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const setName = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } };

const UNITS = [['sqm', 'ตร.ม.'], ['wah', 'ตร.วา'], ['rai', 'ไร่']];
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * deps: { listRoot, map, getCode(), isReadOnly(), onChanged(id?), onConflict(id), onNetworkError() }
 */
export function initForm(root, deps) {
  let current = null; // { parcel: Parcel|null, lat, lng }
  const errEls = {};
  const ctl = {};

  function field(label, key, control, extraClass = '') {
    const err = el('div', { class: 'err' });
    errEls[key] = err;
    return el('div', { class: extraClass }, el('label', { textContent: label }), control, err);
  }

  function areaControl(unitDefault) {
    const input = el('input', { type: 'text', inputMode: 'decimal' });
    const unit = el('select', {}, ...UNITS.map(([v, t]) => el('option', { value: v, textContent: t })));
    unit.value = unitDefault;
    return { input, unit, node: el('div', { class: 'pair' }, input, unit) };
  }

  function areaValue(ctrl) {
    const { input, unit } = ctrl;
    // untouched field: keep the exact stored value instead of the rounded display text
    if (ctrl.orig && input.value === ctrl.orig.text && unit.value === ctrl.orig.unit) return ctrl.orig.sqm;
    const raw = input.value.trim().replace(/,/g, '');
    if (raw === '') return '';
    const n = Number(raw);
    return Number.isFinite(n) ? toSqm(n, unit.value) : NaN;
  }

  function setArea(ctrl, sqm) {
    const { input, unit } = ctrl;
    input.value = sqm == null ? '' : String(round4(fromSqm(sqm, unit.value)));
    ctrl.orig = sqm == null ? null : { text: input.value, unit: unit.value, sqm };
  }

  function build() {
    ctl.title = el('h2', { textContent: '' });
    ctl.type = el('select', {}, el('option', { value: 'house', textContent: 'บ้าน' }), el('option', { value: 'land', textContent: 'ที่ดิน' }));
    ctl.name = el('input', { type: 'text', maxLength: 120 });
    ctl.price = el('input', { type: 'text', inputMode: 'numeric', placeholder: 'บาท เช่น 3500000' });
    ctl.usable = areaControl('sqm');
    ctl.land = areaControl('wah');
    ctl.floors = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.beds = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.baths = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.url = el('input', { type: 'text', placeholder: 'https://...' });
    ctl.note = el('textarea', { rows: 3 });
    ctl.by = el('input', { type: 'text', maxLength: 40 });
    ctl.loc = el('div', { class: 'meta' });
    ctl.hint = el('div', { class: 'meta' });
    ctl.msg = el('div', { class: 'err' });
    ctl.save = el('button', { type: 'submit', class: 'primary', textContent: 'บันทึก' });
    ctl.cancel = el('button', { type: 'button', textContent: 'ยกเลิก', onclick: () => { const q = !!current?.prefill; close(); if (q) deps.onFinished?.(false); } });
    ctl.stopQueue = el('button', { type: 'button', textContent: 'หยุดนำเข้าที่เหลือ', hidden: true, onclick: () => { close(); deps.onAbortQueue?.(); } });
    ctl.del = el('button', { type: 'button', class: 'danger', textContent: 'ลบ', onclick: onDelete });
    ctl.conflict = el('button', { type: 'button', textContent: 'โหลดข้อมูลล่าสุด', hidden: true });

    const form = el('form', { noValidate: true },
      ctl.title,
      field('ประเภท', 'type', ctl.type),
      field('ชื่อ', 'name', ctl.name),
      field('ราคา (บาท)', 'price_baht', ctl.price),
      field('พื้นที่ใช้สอย', 'usable_sqm', ctl.usable.node),
      field('ขนาดที่ดิน', 'land_sqm', ctl.land.node),
      field('จำนวนชั้น', 'floors', ctl.floors),
      field('ห้องนอน', 'bedrooms', ctl.beds),
      field('ห้องน้ำ', 'bathrooms', ctl.baths),
      el('div', {}, el('label', { textContent: 'ตำแหน่ง (คลิกบนแผนที่เพื่อวางหมุด แล้วลากปรับได้)' }), ctl.loc, ctl.hint, (errEls.lat = el('div', { class: 'err' }))),
      field('ลิงก์ต้นทาง', 'source_url', ctl.url),
      field('หมายเหตุ', 'note', ctl.note),
      field('ชื่อคนเพิ่ม', 'added_by', ctl.by),
      ctl.msg, ctl.conflict,
      el('div', { class: 'buttons' }, ctl.save, ctl.cancel, ctl.stopQueue, ctl.del));
    form.addEventListener('submit', onSubmit);
    root.replaceChildren(form);
  }

  function clearErrors() {
    for (const e of Object.values(errEls)) e.textContent = '';
    ctl.msg.textContent = '';
    ctl.conflict.hidden = true;
  }

  function showErrors(errors) {
    for (const [k, v] of Object.entries(errors)) if (errEls[k]) errEls[k].textContent = v;
    // lng errors share the location line
    if (errors.lng && !errors.lat) errEls.lat.textContent = errors.lng;
  }

  function updateLoc() {
    ctl.loc.textContent = current.lat == null ? 'ยังไม่ได้วางหมุด' : `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
  }

  function setLocation(lat, lng) {
    if (!current) return;
    current.lat = lat;
    current.lng = lng;
    updateLoc();
    errEls.lat.textContent = '';
    deps.map.setDraft(lat, lng, (la, ln) => { current.lat = la; current.lng = ln; updateLoc(); });
  }

  function refreshDisabled() {
    if (!ctl.save) return; // form not built yet
    const ro = deps.isReadOnly();
    ctl.save.disabled = ro;
    ctl.del.disabled = ro;
  }

  function show(parcel, prefill = null) {
    if (!root.firstChild) build();
    clearErrors();
    current = { parcel, prefill, lat: parcel ? parcel.lat : null, lng: parcel ? parcel.lng : null };
    ctl.stopQueue.hidden = !(prefill && deps.queueActive?.());
    const src = parcel ?? prefill?.values ?? null;
    ctl.title.textContent = parcel ? 'แก้ไขรายการ' : prefill ? 'ตรวจรายการที่ AI อ่านให้' : 'เพิ่มรายการใหม่';
    ctl.hint.textContent = prefill?.hint ?? '';
    ctl.type.value = src?.type ?? 'house';
    ctl.name.value = src?.name ?? '';
    ctl.price.value = src?.price_baht ?? '';
    ctl.usable.unit.value = 'sqm';
    ctl.land.unit.value = 'wah';
    setArea(ctl.usable, src?.usable_sqm);
    setArea(ctl.land, src?.land_sqm);
    ctl.floors.value = src?.floors ?? '';
    ctl.beds.value = src?.bedrooms ?? '';
    ctl.baths.value = src?.bathrooms ?? '';
    ctl.url.value = src?.source_url ?? '';
    ctl.note.value = prefill?.address ? `ที่อยู่: ${prefill.address}${src?.note ? '\n' + src.note : ''}` : (src?.note ?? '');
    ctl.by.value = parcel ? parcel.added_by : getName();
    ctl.by.disabled = !!parcel;
    ctl.del.hidden = !parcel;
    updateLoc();
    refreshDisabled();
    deps.listRoot.hidden = true;
    root.hidden = false;
    root.parentElement.scrollTop = 0;
    if (parcel) deps.map.setDraft(parcel.lat, parcel.lng, (la, ln) => { current.lat = la; current.lng = ln; updateLoc(); });
    else if (prefill && prefill.lat != null) {
      setLocation(prefill.lat, prefill.lng);
      deps.map.view(prefill.lat, prefill.lng, 16);
    } else deps.map.clearDraft();
  }

  function close() {
    deps.map.clearDraft();
    root.hidden = true;
    deps.listRoot.hidden = false;
    current = null;
  }

  function handleApiError(e) {
    if (e.code === 'conflict') {
      ctl.msg.textContent = 'มีคนอื่นแก้รายการนี้ไปแล้ว ข้อมูลของเขายังอยู่ครบ ยังไม่ถูกทับ';
      ctl.conflict.hidden = false;
      const id = current?.parcel?.id;
      ctl.conflict.onclick = () => deps.onConflict(id);
    } else if (e.code === 'network') {
      ctl.msg.textContent = 'เชื่อมต่อฐานข้อมูลไม่ได้ ยังไม่ได้บันทึก';
      deps.onNetworkError();
    } else if (e.code === 'bad_code') {
      ctl.msg.textContent = 'รหัสกลุ่มถูกเปลี่ยนแล้ว กรุณาออกจากระบบและเข้าใหม่';
    } else {
      ctl.msg.textContent = e.message || 'บันทึกไม่สำเร็จ';
    }
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!current || deps.isReadOnly()) return;
    clearErrors();
    const p = current.parcel;
    const input = {
      type: ctl.type.value, name: ctl.name.value, price_baht: ctl.price.value,
      usable_sqm: areaValue(ctl.usable), land_sqm: areaValue(ctl.land),
      floors: ctl.floors.value, bedrooms: ctl.beds.value, bathrooms: ctl.baths.value,
      source_url: ctl.url.value, note: ctl.note.value, added_by: ctl.by.value,
      lat: current.lat ?? NaN, lng: current.lng ?? NaN,
      roof: p?.roof ?? current.prefill?.values?.roof ?? null, facing: p?.facing ?? current.prefill?.values?.facing ?? null,
      footprint_w: p?.footprint_w ?? null, footprint_d: p?.footprint_d ?? null,
    };
    const v = validateParcel(input);
    if (!v.ok) {
      if (current.lat == null) v.errors.lat = 'คลิกบนแผนที่เพื่อวางหมุดตำแหน่ง';
      showErrors(v.errors);
      return;
    }
    ctl.save.disabled = true;
    const cur = current;
    try {
      // road distances to the nearest landmarks are computed once and stored with the parcel
      let near = p && p.lat === v.value.lat && p.lng === v.value.lng && p.near && Object.values(p.near).some(Boolean) ? p.near : null;
      let nearFailed = false;
      if (!near) {
        ctl.msg.textContent = 'กำลังคำนวณระยะทางถนน...';
        try { near = await deps.computeNear(v.value.lat, v.value.lng); } catch { near = null; nearFailed = true; }
        ctl.msg.textContent = '';
      }
      v.value.near = cleanNear(near);
      const saved = await saveParcel(deps.getCode(), p ? { ...v.value, id: p.id } : v.value, p ? p.version : null);
      if (!p) setName(v.value.added_by);
      const fromQueue = !!cur.prefill;
      if (current === cur) close();
      toast(nearFailed ? 'บันทึกแล้ว แต่ยังคำนวณระยะทางไม่ได้ (กด "คำนวณระยะทาง" ในรายละเอียดภายหลัง)' : 'บันทึกแล้ว');
      await deps.onChanged(saved.id);
      if (fromQueue) deps.onFinished?.(true);
    } catch (e) {
      handleApiError(e);
    } finally {
      refreshDisabled();
    }
  }

  async function onDelete() {
    const p = current?.parcel;
    if (!p || deps.isReadOnly()) return;
    if (!confirm(`ลบ "${p.name}" ใช่ไหม? (กู้คืนได้จากถังขยะ)`)) return;
    try {
      await setDeleted(deps.getCode(), p.id, true, p.version);
      close();
      toast('ย้ายไปถังขยะแล้ว');
      await deps.onChanged();
    } catch (e) {
      handleApiError(e);
    }
  }

  return {
    openNew: (prefill) => show(null, prefill ?? null),
    openEdit: (parcel) => show(parcel),
    close,
    isOpen: () => !!current,
    setLocation,
    refreshDisabled,
  };
}
