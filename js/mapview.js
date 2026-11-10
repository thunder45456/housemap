import { infoLines } from './info.js';
import { icon } from './icons.js';
import { CATEGORIES } from './landmarks.js';
import { ZONE_CLASSES } from './zones.js';

const CHIANG_MAI = [18.7883, 98.9853];
const TYPE_TH = { house: 'บ้าน', land: 'ที่ดิน' };

const KINDS = ['house', 'land', 'draft'];
function pinIcon(kind) {
  const pin = document.createElement('div');
  pin.className = `pin ${KINDS.includes(kind) ? kind : 'house'}`;
  return L.divIcon({ className: '', html: pin, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
}

function popupNode(p, onEdit, near, zone) {
  const box = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'pname';
  name.textContent = p.name;
  box.appendChild(name);
  for (const l of infoLines(p, { near, zone })) {
    if (l.key === 'note') continue; // notes live in the list; keep the popup short
    const d = document.createElement('div');
    d.className = `pl${l.key === 'by' ? ' sub' : ''}`;
    d.textContent = l.text;
    box.appendChild(d);
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn sm';
  b.append(icon('pencil', 14), ' แก้ไข');
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
  let nearFn = () => null;
  let zoneFn = () => undefined;
  let zoneData = null;
  let wantedZones = new Set();
  const zoneLayers = new Map(); // class id -> LayerGroup
  map.createPane('zones');
  map.getPane('zones').style.zIndex = 350; // under pins, above tiles
  const zoneCanvas = L.canvas({ pane: 'zones', padding: 0.3 });
  const canvas = L.canvas({ padding: 0.3 });
  const lmLayers = new Map(); // category -> LayerGroup
  let lmItems = [];
  const routeLayers = new Map(); // key -> polyline
  let draft = null;
  let openId = null;
  let rebuilding = false;

  map.on('click', (e) => clickCb(e.latlng.lat, e.latlng.lng));

  return {
    invalidateSize: () => map.invalidateSize(),
    view: (lat, lng, zoom) => map.setView([lat, lng], zoom),
    setParcels(parcels) {
      const reopen = openId; // rebuilding markers closes popups; restore the open one afterwards
      rebuilding = true;
      layer.clearLayers();
      markers.clear();
      for (const p of parcels) {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.type) });
        m.bindPopup(() => popupNode(p, (id) => editCb(id), nearFn(p), zoneFn(p)), { autoPan: true });
        m.on('popupopen', () => { openId = p.id; });
        m.on('popupclose', () => { if (!rebuilding && openId === p.id) openId = null; });
        m.on('click', () => markerCb(p.id));
        m.addTo(layer);
        markers.set(p.id, m);
      }
      rebuilding = false;
      if (reopen && markers.has(reopen)) {
        const m = markers.get(reopen);
        const pop = m.getPopup();
        pop.options.autoPan = false; // restoring, not a user click: do not move the map
        m.openPopup();
        pop.options.autoPan = true;
      } else openId = null;
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
    setNearFn: (fn) => { nearFn = fn; },
    setZoneFn: (fn) => { zoneFn = fn; },
    setZones(data) {
      zoneData = data;
      for (const g of zoneLayers.values()) map.removeLayer(g);
      zoneLayers.clear();
      this.showZoneClasses(wantedZones); // toggles ticked before the data arrived
    },
    /** visible: Set of zone class ids to draw (polygon layers are built lazily per class) */
    showZoneClasses(visible) {
      wantedZones = visible;
      for (const c of ZONE_CLASSES) {
        const on = visible.has(c.id);
        let g = zoneLayers.get(c.id);
        if (on && !g && zoneData) {
          g = L.layerGroup();
          for (const poly of zoneData.byClass.get(c.id) ?? []) {
            const ll = [];
            for (let i = 0; i < poly.r.length; i += 2) ll.push([poly.r[i], poly.r[i + 1]]);
            L.polygon(ll, { renderer: zoneCanvas, pane: 'zones', interactive: false, stroke: false, fillColor: c.color, fillOpacity: 0.4 }).addTo(g);
          }
          zoneLayers.set(c.id, g);
        }
        if (g) { if (on) g.addTo(map); else map.removeLayer(g); }
      }
    },
    showRoute(key, coords, color) {
      this.hideRoute(key);
      const line = L.polyline(coords, { color, weight: 5, opacity: 0.85 }).addTo(map);
      routeLayers.set(key, line);
      const group = L.featureGroup([...routeLayers.values()]);
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 16 });
    },
    hideRoute(key) {
      const l = routeLayers.get(key);
      if (l) { map.removeLayer(l); routeLayers.delete(key); }
    },
    clearRoutes() {
      for (const l of routeLayers.values()) map.removeLayer(l);
      routeLayers.clear();
    },
    setLandmarks(items) {
      lmItems = items;
      for (const g of lmLayers.values()) map.removeLayer(g);
      lmLayers.clear();
    },
    /** visible: Set of category ids to draw */
    showLandmarkCategories(visible) {
      for (const c of CATEGORIES) {
        const on = visible.has(c.id);
        let g = lmLayers.get(c.id);
        if (on && !g) {
          g = L.layerGroup();
          for (const it of lmItems) {
            if (it.t !== c.id) continue;
            L.circleMarker([it.lat, it.lng], { renderer: canvas, radius: 6, color: '#fff', weight: 1, fillColor: c.color, fillOpacity: 0.9 })
              .bindTooltip(`${c.label}: ${it.n}`).addTo(g);
          }
          lmLayers.set(c.id, g);
        }
        if (g) { if (on) g.addTo(map); else map.removeLayer(g); }
      }
    },
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
