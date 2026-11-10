import { ROOFS, FACINGS } from './model.js';
import { inThailand } from './geocode.js';

const MAX_ITEMS = 20;

export function buildPrompt() {
  return `คุณเป็นผู้ช่วยสรุปประกาศขายบ้าน/ที่ดิน ฉันจะให้ข้อความหรือรูปจากหน้าประกาศ
ให้ตอบกลับเป็น JSON อย่างเดียว (ไม่ต้องมีคำอธิบาย) ในรูปแบบนี้ ถ้าไม่มีข้อมูลช่องไหนให้ใส่ null อย่าเดา:

{
  "type": "house" หรือ "land",
  "name": "ชื่อโครงการ/ชื่อที่เข้าใจง่าย",
  "price_baht": ราคาเป็นบาท ตัวเลขล้วน เช่น 3500000,
  "usable_sqm": พื้นที่ใช้สอย หน่วยตารางเมตร (ตัวเลข),
  "land_rai": ที่ดิน จำนวนไร่ (ตามที่ประกาศเขียน),
  "land_ngan": ที่ดิน จำนวนงาน,
  "land_wah": ที่ดิน จำนวนตารางวา,
  "floors": จำนวนชั้น,
  "bedrooms": ห้องนอน,
  "bathrooms": ห้องน้ำ,
  "address_text": "ที่อยู่หรือที่ตั้งตามประกาศ เช่น ตำบล อำเภอ จังหวัด ถนน ชื่อหมู่บ้าน",
  "lat": ละติจูด ถ้าประกาศระบุพิกัดเท่านั้น ไม่เช่นนั้น null,
  "lng": ลองจิจูด ถ้าประกาศระบุพิกัดเท่านั้น ไม่เช่นนั้น null,
  "source_url": "ลิงก์ของหน้าประกาศ (ถ้ามี)",
  "note": "จุดเด่นหรือข้อสังเกตสั้นๆ ไม่เกิน 2 ประโยค",
  "roof": "gable" หรือ "hip" หรือ "flat" หรือ null,
  "facing": ทิศหน้าบ้าน "N","NE","E","SE","S","SW","W","NW" หรือ null
}

ข้อห้าม: ห้ามใส่เบอร์โทร ไลน์ อีเมล ชื่อเจ้าของ หรือข้อมูลส่วนตัวใด ๆ ลงใน JSON
ถ้ามีหลายรายการให้ตอบเป็น array ของ object ข้างต้น`;
}

/** Finds the first balanced JSON value (object or array) in text, string-aware. */
const STEP_BUDGET = 2_000_000; // bounds the scan on pathological pastes (thousands of unbalanced brackets)

function* jsonSlices(text) {
  let steps = 0;
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== '{' && open !== '[') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      if (++steps > STEP_BUDGET) return;
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === String.fromCharCode(92)) esc = true; // backslash
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) { yield text.slice(i, j + 1); break; }
      }
    }
  }
}

export function extractItems(text) {
  const src = String(text ?? '').trim();
  if (!src) return { items: [], error: 'ยังไม่ได้วางข้อความ' };
  const itemsOf = (data) => {
    const list = Array.isArray(data) ? data : Array.isArray(data?.parcels) ? data.parcels : Array.isArray(data?.items) ? data.items : [data];
    return list.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).slice(0, MAX_ITEMS);
  };
  let parsedAny = false;
  const candidates = [];
  try { candidates.push(JSON.parse(src)); parsedAny = true; } catch { /* look for embedded JSON */ }
  if (!parsedAny) {
    let tried = 0;
    for (const sl of jsonSlices(src)) {
      if (++tried > 50) break;
      try { candidates.push(JSON.parse(sl)); parsedAny = true; } catch { /* not JSON, try the next slice */ }
    }
  }
  if (!parsedAny) return { items: [], error: 'อ่าน JSON จากข้อความไม่ได้ ลองให้ AI ตอบเป็น JSON อย่างเดียวอีกครั้ง' };
  for (const data of candidates) {
    const items = itemsOf(data);
    if (items.length > 0) return { items }; // first piece of JSON that actually holds listings
  }
  return { items: [], error: 'ไม่พบรายการบ้านหรือที่ดินใน JSON' };
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(/,/g, '').trim().match(/^(-?\d+(?:\.\d+)?)\s*(ล้าน)?/);
  return m ? Number(m[1]) * (m[2] ? 1e6 : 1) : null;
}
const toInt = (v) => { const n = toNum(v); return n === null ? null : Math.round(n); };
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const ROOF_TH = { จั่ว: 'gable', ปั้นหยา: 'hip', แบน: 'flat', ดาดฟ้า: 'flat' };
const FACING_TH = {
  เหนือ: 'N', ตะวันออกเฉียงเหนือ: 'NE', ตะวันออก: 'E', ตะวันออกเฉียงใต้: 'SE',
  ใต้: 'S', ตะวันตกเฉียงใต้: 'SW', ตะวันตก: 'W', ตะวันตกเฉียงเหนือ: 'NW',
};

export function normalizeItem(raw) {
  const t = str(raw.type, 20).toLowerCase();
  const type = t === 'land' || t === 'ที่ดิน' ? 'land' : 'house';

  let landSqm = toNum(raw.land_sqm);
  if (!(landSqm > 0)) {
    const rai = toNum(raw.land_rai);
    const ngan = toNum(raw.land_ngan);
    const wah = toNum(raw.land_wah);
    const sum = (rai ?? 0) * 1600 + (ngan ?? 0) * 400 + (wah ?? 0) * 4;
    landSqm = sum > 0 ? sum : null;
  }

  const roofRaw = str(raw.roof, 20);
  const roof = ROOFS.includes(roofRaw) ? roofRaw : ROOF_TH[roofRaw] ?? null;
  const facingRaw = str(raw.facing, 40).replace(/^ทิศ/, '').trim();
  const facing = FACINGS.includes(facingRaw.toUpperCase()) ? facingRaw.toUpperCase() : FACING_TH[facingRaw] ?? null;

  const lat = toNum(raw.lat);
  const lng = toNum(raw.lng);
  const hasCoords = inThailand(lat, lng);

  const price = toNum(raw.price_baht);
  return {
    values: {
      type,
      name: str(raw.name, 120),
      price_baht: price === null ? null : Math.round(price),
      usable_sqm: toNum(raw.usable_sqm),
      land_sqm: landSqm,
      floors: toInt(raw.floors),
      bedrooms: toInt(raw.bedrooms),
      bathrooms: toInt(raw.bathrooms),
      source_url: str(raw.source_url, 500),
      note: str(raw.note, 2000),
      roof,
      facing,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
    },
    addressText: str(raw.address_text, 300),
    hasCoords,
  };
}
