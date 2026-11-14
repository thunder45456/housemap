import { el, toast } from './ui.js';
import { validateParcel, cleanNear, cleanRoutes, hasNearCats, hasRouteCats } from './model.js';
import { toSqm, fromSqm, RATE_UNITS, totalFromRate, ratePerUnit, formatRate, formatPrice } from './units.js';
import { parseLocation, isShortMapsLink } from './gmaps.js';
import { resolveShortLink } from './resolve.js';
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
    ctl.type = el('select', { onchange: () => { applyType(); updatePricePreview(); } }, el('option', { value: 'house', textContent: 'บ้าน' }), el('option', { value: 'land', textContent: 'ที่ดิน' }));
    ctl.name = el('input', { type: 'text', maxLength: 120 });
    ctl.price = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'บาท เช่น 3500000', oninput: () => updatePricePreview() });
    ctl.priceMode = el('select', { onchange: () => { applyPriceMode(); updatePricePreview(); } },
      el('option', { value: 'total', textContent: 'ราคารวม (บาท)' }), el('option', { value: 'rate', textContent: 'ราคาต่อพื้นที่' }));
    ctl.rateUnit = el('select', { onchange: () => updatePricePreview() }, ...RATE_UNITS.map(([v, t]) => el('option', { value: v, textContent: `บาท / ${t}` })));
    ctl.rateBasis = el('select', { onchange: () => updatePricePreview() },
      el('option', { value: 'usable', textContent: 'คิดจากพื้นที่ใช้สอย' }), el('option', { value: 'land', textContent: 'คิดจากที่ดิน' }));
    ctl.pricePreview = el('div', { class: 'meta hint' });
    ctl.locText = el('input', { type: 'text', placeholder: 'วางพิกัด 18.7961, 98.968 หรือลิงก์ Google Maps', oninput: () => applyLocText(false), onchange: () => applyLocText(true) });
    ctl.locMsg = el('div', { class: 'meta' });
    ctl.usable = areaControl('sqm');
    ctl.land = areaControl('wah');
    for (const c of [ctl.usable, ctl.land]) { c.input.addEventListener('input', () => updatePricePreview()); c.unit.addEventListener('change', () => updatePricePreview()); }
    ctl.floors = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.beds = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.baths = el('input', { type: 'text', inputMode: 'numeric' });
    ctl.garage = el('select', {}, el('option', { value: '', textContent: 'ไม่ระบุ' }), el('option', { value: 'yes', textContent: 'มี' }), el('option', { value: 'no', textContent: 'ไม่มี' }));
    ctl.url = el('input', { type: 'text', placeholder: 'https://...' });
    ctl.note = el('textarea', { rows: 3 });
    ctl.by = el('input', { type: 'text', maxLength: 40 });
    ctl.loc = el('div', { class: 'meta' });
    ctl.hint = el('div', { class: 'meta hint' });
    ctl.msg = el('div', { class: 'err' });
    ctl.save = el('button', { type: 'submit', class: 'btn primary', textContent: 'บันทึก' });
    ctl.cancel = el('button', { type: 'button', class: 'btn', textContent: 'ยกเลิก', onclick: () => { const q = !!current?.prefill; close(); if (q) deps.onFinished?.(false); } });
    ctl.stopQueue = el('button', { type: 'button', class: 'btn', textContent: 'หยุดนำเข้าที่เหลือ', hidden: true, onclick: () => { close(); deps.onAbortQueue?.(); } });
    ctl.del = el('button', { type: 'button', class: 'btn danger', textContent: 'ลบ', onclick: onDelete });
    ctl.conflict = el('button', { type: 'button', class: 'btn', textContent: 'โหลดข้อมูลล่าสุด', hidden: true });

    const form = el('form', { noValidate: true },
      ctl.title,
      field('ชื่อ (ไม่ใส่ก็ได้ ระบบตั้งให้)', 'name', ctl.name),
      field('ประเภท', 'type', ctl.type),
      field('ขนาดที่ดิน', 'land_sqm', ctl.land.node),
      (ctl.houseOnly = el('div', {}, field('พื้นที่ใช้สอย', 'usable_sqm', ctl.usable.node),
        el('div', { class: 'grid3' }, field('ชั้น', 'floors', ctl.floors), field('ห้องนอน', 'bedrooms', ctl.beds), field('ห้องน้ำ', 'bathrooms', ctl.baths)),
        field('โรงรถ', 'garage', ctl.garage))),
      el('div', {}, el('label', { textContent: 'ราคา' }), ctl.priceMode,
        el('div', { class: 'pair' }, ctl.price, ctl.rateUnit), ctl.rateBasis, ctl.pricePreview, (errEls.price_baht = el('div', { class: 'err' }))),
      el('div', {}, el('label', { textContent: 'ตำแหน่ง · คลิกบนแผนที่ หรือวางพิกัด/ลิงก์ Google Maps' }), ctl.locText, ctl.locMsg, ctl.loc, ctl.hint, (errEls.lat = el('div', { class: 'err' }))),
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

  function applyType() {
    const land = ctl.type.value === 'land';
    ctl.houseOnly.hidden = land;
    ctl.rateBasis.hidden = land || ctl.priceMode.value !== 'rate';
  }

  function applyPriceMode() {
    const rate = ctl.priceMode.value === 'rate';
    ctl.rateUnit.hidden = !rate;
    ctl.rateBasis.hidden = !rate || ctl.type.value === 'land';
    ctl.price.placeholder = rate ? 'บาทต่อหน่วย เช่น 35000' : 'บาท เช่น 3500000';
  }

  /** The total price in baht from what is typed (total or rate x area). Returns {total} or {error}. */
  function priceFromInputs() {
    const raw = ctl.price.value.trim().replace(/,/g, '');
    if (raw === '') return { total: '' };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: 'ราคาต้องเป็นตัวเลข' };
    if (ctl.priceMode.value === 'total') return { total: raw };
    const useLand = ctl.type.value === 'land' || ctl.rateBasis.value === 'land';
    const area = areaValue(useLand ? ctl.land : ctl.usable);
    if (area === '' || !(area > 0)) return { error: useLand ? 'ใส่ขนาดที่ดินก่อน ระบบจึงคิดราคารวมให้ได้' : 'ใส่พื้นที่ใช้สอยก่อน ระบบจึงคิดราคารวมให้ได้' };
    const total = totalFromRate(n, area, ctl.rateUnit.value);
    return total == null ? { error: 'คิดราคารวมไม่ได้' } : { total: String(total) };
  }

  function updatePricePreview() {
    if (!ctl.pricePreview) return;
    const r = priceFromInputs();
    if (r.error) { ctl.pricePreview.textContent = ctl.priceMode.value === 'rate' ? r.error : ''; return; }
    if (r.total === '') { ctl.pricePreview.textContent = ''; return; }
    const total = Number(r.total);
    const bits = [`ราคารวม ${formatPrice(total)}`];
    const land = areaValue(ctl.land);
    const use = areaValue(ctl.usable);
    if (land > 0) bits.push(`ต่อ ตร.วา ${formatRate(ratePerUnit(total, land, 'wah'))}`);
    if (ctl.type.value === 'house' && use > 0) bits.push(`ต่อ ตร.ม. ใช้สอย ${formatRate(ratePerUnit(total, use, 'sqm'))}`);
    ctl.pricePreview.textContent = bits.join(' · ');
  }

  let shortSeq = 0;
  /** Short link: ask the Edge Function to follow it; if that is not possible, explain the manual way. */
  async function resolveShort(link) {
    const seq = ++shortSeq;
    ctl.locMsg.textContent = 'กำลังอ่านลิงก์สั้น...';
    await new Promise((r) => setTimeout(r, 500)); // typing a link char by char must not fire a request per key
    if (seq !== shortSeq) return;
    const loc = await resolveShortLink(link);
    if (seq !== shortSeq || !current || ctl.locText.value.trim() !== link) return; // text changed or form closed meanwhile
    if (loc) {
      ctl.locMsg.textContent = `ใช้พิกัด ${loc.lat}, ${loc.lng} (จากลิงก์สั้น)`;
      setLocation(loc.lat, loc.lng);
      deps.map.view(loc.lat, loc.lng, 16);
    } else {
      ctl.locMsg.textContent = 'อ่านลิงก์สั้นไม่ได้: เปิดลิงก์ในเบราว์เซอร์ก่อน แล้วคัดลอกลิงก์ยาวจากแถบที่อยู่มาวาง หรือคัดลอกพิกัดที่ Google แสดง (เช่น 18.8168, 99.0638)';
    }
  }

  /** Coordinates typed or pasted (or a long Google Maps link) place the pin. No GPS involved. */
  function applyLocText(final) {
    const t = ctl.locText.value;
    if (t.trim() === '') { ctl.locMsg.textContent = ''; return; }
    const loc = parseLocation(t);
    // while typing, "18.7961, 9" must not fly the map away: only coordinates inside Thailand are applied live
    const inThailand = loc && loc.lat >= 5.5 && loc.lat <= 20.5 && loc.lng >= 97.3 && loc.lng <= 105.7;
    if (loc && (final || inThailand)) {
      ctl.locMsg.textContent = `ใช้พิกัด ${loc.lat}, ${loc.lng}`;
      setLocation(loc.lat, loc.lng);
      deps.map.view(loc.lat, loc.lng, 16);
    } else if (isShortMapsLink(t)) {
      resolveShort(t.trim());
    } else if (final) {
      ctl.locMsg.textContent = 'อ่านพิกัดจากข้อความนี้ไม่ได้ ลองรูปแบบ 18.7961, 98.968';
    }
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
    ctl.priceMode.value = 'total';
    ctl.rateUnit.value = 'wah';
    ctl.rateBasis.value = 'usable';
    ctl.locText.value = '';
    ctl.locMsg.textContent = '';
    ctl.usable.unit.value = 'sqm';
    ctl.land.unit.value = 'wah';
    setArea(ctl.usable, src?.usable_sqm);
    setArea(ctl.land, src?.land_sqm);
    ctl.floors.value = src?.floors ?? '';
    ctl.beds.value = src?.bedrooms ?? '';
    ctl.baths.value = src?.bathrooms ?? '';
    ctl.garage.value = src?.garage === true ? 'yes' : src?.garage === false ? 'no' : '';
    ctl.url.value = src?.source_url ?? '';
    ctl.note.value = prefill?.address ? `ที่อยู่: ${prefill.address}${src?.note ? '\n' + src.note : ''}` : (src?.note ?? '');
    ctl.by.value = parcel ? parcel.added_by : getName();
    ctl.by.disabled = !!parcel;
    ctl.del.hidden = !parcel;
    applyType();
    applyPriceMode();
    updatePricePreview();
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
    const price = priceFromInputs();
    if (price.error) { errEls.price_baht.textContent = price.error; return; }
    const input = {
      type: ctl.type.value, name: ctl.name.value, price_baht: price.total,
      usable_sqm: areaValue(ctl.usable), land_sqm: areaValue(ctl.land),
      floors: ctl.floors.value, bedrooms: ctl.beds.value, bathrooms: ctl.baths.value,
      garage: ctl.garage.value === 'yes' ? true : ctl.garage.value === 'no' ? false : null,
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
      const same = !!p && p.lat === v.value.lat && p.lng === v.value.lng;
      let near = same && hasNearCats(p.near) ? p.near : null;
      let nearFailed = false;
      if (!near) {
        ctl.msg.textContent = 'กำลังคำนวณระยะทาง...';
        try { near = await deps.computeNear(v.value.lat, v.value.lng); } catch { near = null; nearFailed = true; }
        ctl.msg.textContent = '';
      }
      // extra places the user ticked stay as long as the pin did not move
      if (same && p.near?.picks?.length && near !== p.near) near = { ...(near ?? {}), picks: p.near.picks };
      v.value.near = cleanNear(near);
      // routes drawn on the map are stored too, so nobody has to ask the routing server again
      let routes = same && hasRouteCats(p.routes) && near === p.near ? p.routes : null;
      if (!routes && hasNearCats(near)) {
        ctl.msg.textContent = 'กำลังคำนวณเส้นทาง...';
        try { routes = await deps.computeRoutes(v.value.lat, v.value.lng, near); } catch { routes = null; }
        ctl.msg.textContent = '';
      }
      if (same && p.routes?.picks && routes !== p.routes) routes = { ...(routes ?? {}), picks: p.routes.picks };
      v.value.routes = cleanRoutes(routes);
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
    if (!confirm(`ลบ "${p.name}" ใช่ไหม? (กู้คืนได้จาก Bin)`)) return;
    try {
      await setDeleted(deps.getCode(), p.id, true, p.version);
      close();
      toast('ย้ายไป Bin แล้ว');
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
