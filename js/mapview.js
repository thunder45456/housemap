import { formatArea, formatPrice } from './units.js';

const CHIANG_MAI = [18.7883, 98.9853];
const TYPE_TH = { house: 'บ้าน', land: 'ที่ดิน' };

const pinIcon = (kind) =>
  L.divIcon({ className: '', html: `<div class="pin ${kind}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });

function popupNode(p, onEdit) {
  const box = document.createElement('div');
  const line = (text, bold) => {
    const d = document.createElement(bold ? 'strong' : 'div');
    d.textContent = text;
    box.appendChild(d);
    if (bold) box.appendChild(document.createElement('br'));
  };
  line(p.name, true);
  line(`${TYPE_TH[p.type] ?? p.type} · ${formatPrice(p.price_baht)}`);
  if (p.type === 'house') line(`ใช้สอย ${formatArea(p.usable_sqm)} · ที่ดิน ${formatArea(p.land_sqm)}`);
  else line(`ที่ดิน ${formatArea(p.land_sqm)}`);
  line(`เพิ่มโดย ${p.added_by}`);
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'แก้ไข';
  b.addEventListener('click', () => onEdit(p.id));
  box.appendChild(b);
  return box;
}

export function initMap(el) {
  const map = L.map(el).setView(CHIANG_MAI, 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const markers = new Map();
  let markerCb = () => {};
  let clickCb = () => {};
  let editCb = () => {};
  let draft = null;

  map.on('click', (e) => clickCb(e.latlng.lat, e.latlng.lng));

  return {
    invalidateSize: () => map.invalidateSize(),
    setParcels(parcels) {
      layer.clearLayers();
      markers.clear();
      for (const p of parcels) {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.type) });
        m.bindPopup(() => popupNode(p, (id) => editCb(id)));
        m.on('click', () => markerCb(p.id));
        m.addTo(layer);
        markers.set(p.id, m);
      }
    },
    focus(id) {
      const m = markers.get(id);
      if (!m) return;
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
      m.openPopup();
    },
    onMarkerClick: (cb) => { markerCb = cb; },
    onMapClick: (cb) => { clickCb = cb; },
    onEdit: (cb) => { editCb = cb; },
    setDraft(lat, lng, onDrag) {
      if (draft) map.removeLayer(draft);
      draft = L.marker([lat, lng], { icon: pinIcon('draft'), draggable: true }).addTo(map);
      draft.on('drag dragend', () => {
        const ll = draft.getLatLng();
        onDrag(ll.lat, ll.lng);
      });
    },
    clearDraft() {
      if (draft) map.removeLayer(draft);
      draft = null;
    },
  };
}
