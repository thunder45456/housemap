import { validateParcel } from './model.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function exportJson(parcels) {
  return JSON.stringify({ app: 'housemap', version: 1, exported_at: new Date().toISOString(), parcels }, null, 2);
}

/** Pure: decides what an import would do. Nothing is applied here. */
export function planImport(text, existing) {
  const plan = { toAdd: [], skipped: [], invalid: [] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...plan, error: 'ไฟล์ไม่ใช่ JSON ที่อ่านได้' };
  }
  if (!data || data.app !== 'housemap' || !Array.isArray(data.parcels)) {
    return { ...plan, error: 'ไม่ใช่ไฟล์สำรองของ HouseMap' };
  }
  const seen = new Set(existing.map((p) => p.id));
  data.parcels.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !UUID.test(item.id)) {
      plan.invalid.push({ index, errors: { id: 'รายการไม่มี id ที่ถูกต้อง' } });
      return;
    }
    if (item.deleted_at) {
      plan.skipped.push({ id: item.id, reason: 'อยู่ในถังขยะ' });
      return;
    }
    if (seen.has(item.id)) {
      plan.skipped.push({ id: item.id, reason: 'มีอยู่แล้ว' });
      return;
    }
    const v = validateParcel(item);
    if (!v.ok) {
      plan.invalid.push({ index, errors: v.errors });
      return;
    }
    seen.add(item.id);
    plan.toAdd.push({ ...v.value, id: item.id });
  });
  return plan;
}
