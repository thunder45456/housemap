import { el } from './ui.js';
import { icon } from './icons.js';
import { CATEGORIES } from './landmarks.js';
import { ZONE_CLASSES } from './zones.js';

/** Map-corner "layers" box: toggles for landmarks and land-use zones, with colour legend. */
export function initLayersPanel(root, { onLandmarkToggle, onZoneToggle }) {
  const landmarks = new Set();
  const zones = new Set();

  const row = (c, set, cb) =>
    el('label', { class: 'lrow' },
      el('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) set.add(c.id); else set.delete(c.id); cb(new Set(set)); } }),
      el('span', { class: 'swatch', style: `background:${c.color}` }),
      el('span', { textContent: c.label }));

  const zoneSection = el('div', { class: 'zsec', hidden: true },
    el('div', { class: 'lhead', textContent: 'โซนพื้นที่' }),
    ...ZONE_CLASSES.map((c) => row(c, zones, onZoneToggle)),
    el('div', { class: 'lnote', textContent: 'โซนจาก OpenStreetMap ไม่ใช่ผังเมืองจริง' }));
  const panel = el('div', { class: 'lpanel', hidden: true },
    el('div', { class: 'lhead', textContent: 'สถานที่สำคัญ' }),
    ...CATEGORIES.map((c) => row(c, landmarks, onLandmarkToggle)),
    zoneSection);

  const btn = el('button', { type: 'button', class: 'lbtn', title: 'ชั้นแผนที่', 'aria-label': 'ชั้นแผนที่',
    onclick: () => { panel.hidden = !panel.hidden; btn.classList.toggle('on', !panel.hidden); } },
    icon('layers', 18), el('span', { textContent: 'ชั้นแผนที่' }));
  btn.setAttribute('aria-expanded', 'false');
  root.replaceChildren(btn, panel);
  // do not let clicks/drags on the box move the map underneath
  for (const ev of ['click', 'dblclick', 'mousedown', 'touchstart', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());
  return { setZonesAvailable: (on) => { zoneSection.hidden = !on; } };
}
