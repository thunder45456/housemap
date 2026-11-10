import { filterSort } from './model.js';
import { formatArea, formatPrice } from './units.js';
import { CATEGORIES, formatKm } from './landmarks.js';
import { formatDuration } from './routing.js';

const TYPE_TH = { house: 'บ้าน', land: 'ที่ดิน' };

export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n[k] = v;
  }
  for (const c of children) n.append(c);
  return n;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/** Shows the group-code gate. onSubmit(code) must throw ApiError on failure. */
export function showGate(onSubmit, initialError = '') {
  const gate = document.getElementById('gate');
  const err = el('div', { class: 'err', textContent: initialError });
  const input = el('input', { type: 'password', autocomplete: 'off', placeholder: 'รหัสกลุ่ม', required: true });
  const btn = el('button', { type: 'submit', class: 'primary', textContent: 'เข้าใช้งาน' });
  const form = el('form', {},
    el('h1', { textContent: 'HouseMap' }),
    el('p', { textContent: 'บันทึกบ้านและที่ดินที่น่าสนใจ ใส่รหัสกลุ่มเพื่อเข้าใช้งาน' }),
    input, err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    err.textContent = '';
    try {
      await onSubmit(input.value.trim());
    } catch (ex) {
      err.textContent = ex.message || 'เข้าใช้งานไม่ได้';
      btn.disabled = false;
      input.select();
    }
  });
  gate.replaceChildren(form);
  gate.hidden = false;
  input.focus();
}

export function hideGate() {
  document.getElementById('gate').hidden = true;
}

function nearLine(near) {
  if (!near) return document.createComment('');
  const parts = CATEGORIES.filter((c) => near[c.id]).map((c) => `${c.short} ${formatKm(near[c.id].km)}`);
  return el('div', { class: 'meta', textContent: parts.length ? `ใกล้: ${parts.join(' · ')} กม.` : '' });
}

function rowMeta(p) {
  const bits = [TYPE_TH[p.type] ?? p.type, formatPrice(p.price_baht)];
  if (p.type === 'house') {
    bits.push(`ใช้สอย ${formatArea(p.usable_sqm)}`);
    if (p.floors != null) bits.push(`${p.floors} ชั้น`);
    if (p.bedrooms != null) bits.push(`${p.bedrooms} นอน`);
    if (p.bathrooms != null) bits.push(`${p.bathrooms} น้ำ`);
  }
  bits.push(`${p.type === 'land' ? 'ขนาด' : 'ที่ดิน'} ${formatArea(p.land_sqm)}`);
  return bits.join(' · ');
}

/**
 * Builds filter controls once and a rows container.
 * onSelect(id) when a row is clicked; onVisible(parcels) whenever the filtered list changes.
 */
export function initList(root, { onSelect, onVisible, getNear, onLandmarkToggle, onRoute, onRouteAll, onClearRoutes, onEdit, routeInfo, canEdit }) {
  const opts = { type: 'all', minPrice: null, maxPrice: null, query: '', sortBy: 'created', dir: 'desc', dist: null };
  const distState = { category: '', maxKm: null };
  let all = [];
  let expandedId = null;

  const kv = (label, value) => el('div', { class: 'kv' }, el('span', { class: 'k', textContent: label }), el('span', { textContent: value }));

  function detailsNode(p, near) {
    const box = el('div', { class: 'details', onclick: (e) => e.stopPropagation() });
    box.append(kv('ราคา', formatPrice(p.price_baht)));
    if (p.type === 'house') {
      box.append(kv('พื้นที่ใช้สอย', formatArea(p.usable_sqm)));
      box.append(kv('ชั้น / นอน / น้ำ', `${p.floors ?? '-'} / ${p.bedrooms ?? '-'} / ${p.bathrooms ?? '-'}`));
    }
    box.append(kv(p.type === 'land' ? 'ขนาด' : 'ที่ดิน', formatArea(p.land_sqm)));
    if (p.note) box.append(kv('หมายเหตุ', p.note));
    if (p.source_url) {
      const v = el('span', {});
      if (/^https?:\/\//i.test(p.source_url)) v.append(el('a', { href: p.source_url, target: '_blank', rel: 'noopener noreferrer', textContent: 'เปิดลิงก์ต้นทาง' }));
      else v.textContent = p.source_url;
      box.append(el('div', { class: 'kv' }, el('span', { class: 'k', textContent: 'ลิงก์' }), v));
    }
    box.append(kv('เพิ่มโดย', p.added_by));
    if (canEdit?.()) box.append(el('button', { type: 'button', textContent: 'แก้ไข', onclick: () => onEdit?.(p.id) }));

    if (near && onRoute) {
      box.append(el('div', { class: 'k routes-h', textContent: 'เส้นทางไปสถานที่ใกล้สุด (ขับรถ)' }));
      for (const c of CATEGORIES) {
        const n = near[c.id];
        if (!n) continue;
        const info = routeInfo?.(p.id, c.id);
        const label = `${c.short}: ${n.name} · เส้นตรง ${formatKm(n.km)} กม.`;
        box.append(el('div', { class: 'route' },
          el('span', { class: 'dot', style: `background:${c.color}` }),
          el('span', { class: 'rtext', textContent: label + (info ? ` · ถนน ${formatKm(info.km)} กม. ${formatDuration(info.minutes)}` : '') }),
          el('button', { type: 'button', textContent: info?.shown ? 'ซ่อน' : 'แสดงเส้นทาง', onclick: () => onRoute(p, c.id) })));
      }
      box.append(el('div', { class: 'buttons' },
        el('button', { type: 'button', textContent: 'แสดงทุกเส้นทาง', onclick: () => onRouteAll?.(p) }),
        el('button', { type: 'button', textContent: 'ล้างเส้นทาง', onclick: () => onClearRoutes?.() })));
    }
    return box;
  }

  const refresh = () => {
    const nearOf = (p) => (getNear ? getNear(p) : null);
    opts.dist = distState.category && distState.maxKm != null && getNear
      ? { category: distState.category, maxKm: distState.maxKm, distOf: (p, c) => nearOf(p)?.[c]?.km ?? null }
      : null;
    const visible = filterSort(all, opts);
    rows.replaceChildren();
    if (visible.length === 0) {
      rows.append(el('div', { class: 'empty', textContent: 'ไม่พบรายการ' }));
    }
    for (const p of visible) {
      const open = expandedId === p.id;
      rows.append(el('div', { class: `row${open ? ' open' : ''}`, onclick: () => { expandedId = open ? null : p.id; onSelect(expandedId); refresh(); } },
        el('div', { class: 'name', textContent: `${open ? '▾' : '▸'} ${p.name}` }),
        el('div', { class: 'meta', textContent: rowMeta(p) }),
        nearLine(nearOf(p)),
        el('div', { class: 'meta', textContent: `เพิ่มโดย ${p.added_by}` }),
        ...(open ? [detailsNode(p, nearOf(p))] : [])));
    }
    count.textContent = `${visible.length} รายการ`;
    onVisible(visible);
  };

  const million = (v) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v) * 1_000_000);

  const typeSel = el('select', { onchange: (e) => { opts.type = e.target.value; refresh(); } },
    el('option', { value: 'all', textContent: 'ทุกประเภท' }),
    el('option', { value: 'house', textContent: 'บ้าน' }),
    el('option', { value: 'land', textContent: 'ที่ดิน' }));
  const sortSel = el('select', {
    onchange: (e) => { const [s, d] = e.target.value.split(':'); opts.sortBy = s; opts.dir = d; refresh(); },
  },
    el('option', { value: 'created:desc', textContent: 'ใหม่สุดก่อน' }),
    el('option', { value: 'price:asc', textContent: 'ราคาต่ำ → สูง' }),
    el('option', { value: 'price:desc', textContent: 'ราคาสูง → ต่ำ' }),
    el('option', { value: 'land:desc', textContent: 'ที่ดินใหญ่ → เล็ก' }),
    el('option', { value: 'usable:desc', textContent: 'พื้นที่ใช้สอยมาก → น้อย' }));
  const minIn = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ราคาต่ำสุด (ล้านบาท)', oninput: (e) => { opts.minPrice = million(e.target.value); refresh(); } });
  const maxIn = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ราคาสูงสุด (ล้านบาท)', oninput: (e) => { opts.maxPrice = million(e.target.value); refresh(); } });
  const qIn = el('input', { type: 'search', placeholder: 'ค้นหาชื่อ / หมายเหตุ / คนเพิ่ม', oninput: (e) => { opts.query = e.target.value; refresh(); } });
  qIn.className = 'wide';
  const distCat = el('select', { onchange: (e) => { distState.category = e.target.value; refresh(); } },
    el('option', { value: '', textContent: 'ไม่กรองตามระยะ' }),
    ...CATEGORIES.map((c) => el('option', { value: c.id, textContent: `ใกล้${c.label}` })));
  const distKm = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ไม่เกิน (กม.)', oninput: (e) => { const v = e.target.value.trim(); distState.maxKm = v === '' || !Number.isFinite(Number(v)) ? null : Number(v); refresh(); } });
  const visibleCats = new Set();
  const toggles = el('div', { class: 'wide toggles' }, el('span', { class: 'meta', textContent: 'แสดงบนแผนที่: ' }),
    ...CATEGORIES.map((c) => el('label', { class: 'tg' },
      el('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) visibleCats.add(c.id); else visibleCats.delete(c.id); onLandmarkToggle?.(new Set(visibleCats)); } }),
      el('span', { class: 'dot', style: `background:${c.color}` }), ` ${c.label}`)));
  const count = el('div', { class: 'meta' });
  const rows = el('div', { class: 'rows' });

  root.replaceChildren(el('div', { class: 'filters' }, typeSel, sortSel, minIn, maxIn, distCat, distKm, qIn, toggles), count, rows);

  return { setParcels(parcels) { all = parcels; refresh(); }, refresh, expand(id) { expandedId = id; refresh(); } };
}
