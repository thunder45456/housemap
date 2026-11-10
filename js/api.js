import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    /** @type {'bad_code'|'conflict'|'network'|'other'} */
    this.code = code;
  }
}

async function rpc(name, args) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new ApiError('other', 'ยังไม่ได้ตั้งค่า Supabase ใน js/config.js');
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args ?? {}),
    });
  } catch (e) {
    throw new ApiError('network', 'เชื่อมต่อฐานข้อมูลไม่ได้');
  }
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (res.ok) return body;
  const msg = (body && body.message) || '';
  if (msg === 'bad_code') throw new ApiError('bad_code', 'รหัสกลุ่มไม่ถูกต้อง');
  if (msg === 'conflict') throw new ApiError('conflict', 'มีคนอื่นแก้รายการนี้ไปแล้ว');
  throw new ApiError('other', msg || `ผิดพลาด (${res.status})`);
}

export async function listParcels(code) {
  return rpc('list_parcels', { p_code: code });
}

export async function saveParcel(code, parcel, expectedVersion) {
  return rpc('save_parcel', { p_code: code, p_parcel: parcel, p_expected_version: expectedVersion ?? null });
}

export async function setDeleted(code, id, deleted, expectedVersion) {
  return rpc('set_deleted', { p_code: code, p_id: id, p_deleted: deleted, p_expected_version: expectedVersion });
}

export async function ping() {
  await rpc('ping', {});
}
