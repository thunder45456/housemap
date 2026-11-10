import { filterSort } from './model.js';
import { formatPriceShort } from './units.js';
import { infoLines, rowSummary } from './info.js';
import { CATEGORIES } from './landmarks.js';
import { ZONE_CLASSES } from './zones.js';
import { icon } from './icons.js';

// Tiny DOM builder: aria- and data- keys become attributes, on-prefixed keys become listeners.
export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') || k.startsWith('data-')) n.setAttribute(k, v);
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
  const btn = el('button', { type: 'submit', class: 'btn primary', textContent: 'เข้าใช้งาน' });
  const form = el('form', {}, el('h1', { textContent: 'HouseMap' }), el('p', { class: 'muted', textContent: 'ใส่รหัสกลุ่มเพื่อเข้าใช้งาน' }), input, err, btn);
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

/**
 * Search + collapsible filters + the list of parcels. Each row expands into the vertical info list.
 * Handlers: onSelect(id|null), onVisible(parcels), getNear(p), getZone(p), onRoute(p,cat), onRouteAll(p),
 * onClearRoutes(), onEdit(id), onComputeNear(p), routeInfo(id,cat) -> {shown}|null, canEdit().
 */
export function initList(root, h) {
  const { onSelect, onVisible, getNear, getZone, onRoute, onRouteAll, onClearRoutes, onEdit, onComputeNear, routeInfo, canEdit } = h;
  const opts = { type: 'all', minPrice: null, maxPrice: null, query: '', sortBy: 'created', dir: 'desc', dist: null, zone: null };
  const distState = { category: '', maxKm: null };
  const zoneState = { id: '' };
  let all = [];
  let expandedId = null;
  let lastSig = null;

  const million = (v) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v) * 1_000_000);

  // ---------- one parcel ----------
  function detailsNode(p) {
    const near = getNear ? getNear(p) : null;
    const box = el('div', { class: 'details', onclick: (e) => e.stopPropagation() });
    for (const l of infoLines(p, { near, zone: getZone ? getZone(p) : undefined })) {
      const line = el('div', { class: `line${l.cat ? ' route' : ''}`, title: l.title ?? '' });
      if (l.cat) {
        const c = CATEGORIES.find((x) => x.id === l.cat);
        const shown = !!routeInfo?.(p.id, l.cat)?.shown;
        line.append(el('span', { class: 'swatch', style: `background:${c.color}` }), el('span', { class: 't', textContent: l.text }),
          el('button', {
            type: 'button', class: `rbtn${shown ? ' on' : ''}`, title: shown ? 'ซ่อนเส้นทาง' : 'แสดงเส้นทาง', 'aria-label': `เส้นทางไป${c.label}`,
            style: shown ? `background:${c.color};border-color:${c.color}` : '', onclick: () => onRoute?.(p, l.cat),
          }, icon('route', 15)));
      } else {
        line.append(el('span', { class: 't', textContent: l.text }));
      }
      box.append(line);
    }
    if (/^https?:\/\//i.test(p.source_url || '')) {
      box.append(el('div', { class: 'line' }, el('a', { href: p.source_url, target: '_blank', rel: 'noopener noreferrer', class: 'lnk' }, icon('link', 14), ' ลิงก์ต้นทาง')));
    }
    const actions = el('div', { class: 'actions-row' });
    if (canEdit?.()) actions.append(el('button', { type: 'button', class: 'btn sm', onclick: () => onEdit?.(p.id) }, icon('pencil', 14), ' แก้ไข'));
    if (!near && canEdit?.()) actions.append(el('button', { type: 'button', class: 'btn sm', onclick: () => onComputeNear?.(p) }, icon('calc', 14), ' คำนวณระยะทาง'));
    if (near) {
      actions.append(el('button', { type: 'button', class: 'btn sm', onclick: () => onRouteAll?.(p) }, icon('route', 14), ' ทุกเส้นทาง'));
      actions.append(el('button', { type: 'button', class: 'btn sm', onclick: () => onClearRoutes?.() }, icon('x', 14), ' ล้าง'));
    }
    if (actions.childNodes.length) box.append(actions);
    return box;
  }

  function rowNode(p) {
    const open = expandedId === p.id;
    const head = el('div', { class: 'rhead', onclick: () => { expandedId = open ? null : p.id; refresh(); onSelect(expandedId); } },
      el('span', { class: `tdot ${p.type}` }),
      el('div', { class: 'rmain' },
        el('div', { class: 'name', textContent: p.name }),
        el('div', { class: 'sum', textContent: rowSummary(p) })),
      el('div', { class: 'rprice', textContent: formatPriceShort(p.price_baht) }),
      el('span', { class: 'chev' }, icon('chevron', 16)));
    return el('div', { class: `row${open ? ' open' : ''}` }, head, ...(open ? [detailsNode(p)] : []));
  }

  // ---------- filters ----------
  function activeFilterCount() {
    return (opts.type !== 'all' ? 1 : 0) + (opts.minPrice != null ? 1 : 0) + (opts.maxPrice != null ? 1 : 0)
      + (distState.category && distState.maxKm != null ? 1 : 0) + (zoneState.id ? 1 : 0);
  }

  function refresh() {
    const nearOf = (p) => (getNear ? getNear(p) : null);
    opts.dist = distState.category && distState.maxKm != null && getNear
      ? { category: distState.category, maxKm: distState.maxKm, distOf: (p, c) => nearOf(p)?.[c]?.km ?? null }
      : null;
    opts.zone = zoneState.id && getZone ? { id: zoneState.id, zoneOf: (p) => { const z = getZone(p); return z === 'outside' ? null : z ?? null; } } : null;
    const visible = filterSort(all, opts);
    rows.replaceChildren();
    if (visible.length === 0) rows.append(el('div', { class: 'empty', textContent: 'ไม่พบรายการ' }));
    for (const p of visible) rows.append(rowNode(p));
    const n = activeFilterCount();
    badge.textContent = String(n);
    badge.hidden = n === 0;
    count.textContent = `${visible.length} รายการ`;
    const sig = visible.map((p) => `${p.id}:${p.version}:${p.lat}:${p.lng}:${p.type}`).join('|');
    if (sig !== lastSig) { lastSig = sig; onVisible(visible); }
  }

  const sel = (onchange, ...opts_) => el('select', { onchange }, ...opts_.map(([v, t]) => el('option', { value: v, textContent: t })));
  const typeSel = sel((e) => { opts.type = e.target.value; refresh(); }, ['all', 'ทุกประเภท'], ['house', 'บ้าน'], ['land', 'ที่ดิน']);
  const sortSel = sel((e) => { const [s, d] = e.target.value.split(':'); opts.sortBy = s; opts.dir = d; refresh(); },
    ['created:desc', 'ใหม่สุดก่อน'], ['price:asc', 'ราคาต่ำ → สูง'], ['price:desc', 'ราคาสูง → ต่ำ'], ['land:desc', 'ที่ดินใหญ่ → เล็ก'], ['usable:desc', 'ใช้สอยมาก → น้อย']);
  const minIn = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ราคาต่ำสุด (M)', oninput: (e) => { opts.minPrice = million(e.target.value); refresh(); } });
  const maxIn = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ราคาสูงสุด (M)', oninput: (e) => { opts.maxPrice = million(e.target.value); refresh(); } });
  const distCat = sel((e) => { distState.category = e.target.value; refresh(); }, ['', 'ระยะถนน: ไม่กรอง'], ...CATEGORIES.map((c) => [c.id, `ใกล้${c.label}`]));
  const distKm = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'ไม่เกิน (ก.ม.)', oninput: (e) => { const v = e.target.value.trim(); distState.maxKm = v === '' || !Number.isFinite(Number(v)) ? null : Number(v); refresh(); } });
  const zoneSel = sel((e) => { zoneState.id = e.target.value; refresh(); }, ['', 'ทุกโซน'], ...ZONE_CLASSES.map((c) => [c.id, `โซน${c.label}`]), ['unknown', 'โซนไม่ระบุ']);
  const resetBtn = el('button', { type: 'button', class: 'btn sm', onclick: () => {
    opts.type = 'all'; opts.minPrice = null; opts.maxPrice = null; distState.category = ''; distState.maxKm = null; zoneState.id = '';
    typeSel.value = 'all'; minIn.value = ''; maxIn.value = ''; distCat.value = ''; distKm.value = ''; zoneSel.value = '';
    refresh();
  } }, 'ล้างตัวกรอง');

  zoneSel.hidden = true; // shown once zone data has loaded
  const panel = el('div', { class: 'fpanel', hidden: true }, typeSel, sortSel, minIn, maxIn, distCat, distKm, zoneSel, resetBtn);
  const badge = el('span', { class: 'badge', hidden: true });
  const filterBtn = el('button', { type: 'button', class: 'btn fbtn', 'aria-expanded': 'false', onclick: () => {
    panel.hidden = !panel.hidden;
    filterBtn.setAttribute('aria-expanded', String(!panel.hidden));
    filterBtn.classList.toggle('on', !panel.hidden);
  } }, icon('filter', 16), ' ตัวกรอง', badge);
  const qIn = el('input', { type: 'search', placeholder: 'ค้นหา', 'aria-label': 'ค้นหา', oninput: (e) => { opts.query = e.target.value; refresh(); } });
  const search = el('label', { class: 'search' }, icon('search', 16), qIn);
  const count = el('div', { class: 'count' });
  const rows = el('div', { class: 'rows' });

  root.replaceChildren(el('div', { class: 'toolbar' }, search, filterBtn), panel, count, rows);

  return {
    setParcels(parcels) { all = parcels; refresh(); },
    refresh,
    expand(id) { expandedId = id; refresh(); },
    setZonesAvailable(on) { zoneSel.hidden = !on; },
  };
}
