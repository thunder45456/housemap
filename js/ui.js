import { filterSort } from './model.js';
import { formatArea, formatPrice } from './units.js';

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
export function initList(root, { onSelect, onVisible }) {
  const opts = { type: 'all', minPrice: null, maxPrice: null, query: '', sortBy: 'created', dir: 'desc' };
  let all = [];

  const refresh = () => {
    const visible = filterSort(all, opts);
    rows.replaceChildren();
    if (visible.length === 0) {
      rows.append(el('div', { class: 'empty', textContent: 'ไม่พบรายการ' }));
    }
    for (const p of visible) {
      rows.append(el('div', { class: 'row', onclick: () => onSelect(p.id) },
        el('div', { class: 'name', textContent: p.name }),
        el('div', { class: 'meta', textContent: rowMeta(p) }),
        el('div', { class: 'meta', textContent: `เพิ่มโดย ${p.added_by}` })));
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
  const count = el('div', { class: 'meta' });
  const rows = el('div', { class: 'rows' });

  root.replaceChildren(el('div', { class: 'filters' }, typeSel, sortSel, minIn, maxIn, qIn), count, rows);

  return { setParcels(parcels) { all = parcels; refresh(); } };
}
