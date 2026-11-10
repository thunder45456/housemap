export const SQM_PER_WAH = 4;
export const SQM_PER_RAI = 1600;
const SQM_PER_NGAN = 400;

const FACTOR = { sqm: 1, wah: SQM_PER_WAH, rai: SQM_PER_RAI };

export function toSqm(value, unit) {
  return value * FACTOR[unit];
}

export function fromSqm(sqm, unit) {
  return sqm / FACTOR[unit];
}

export function formatPrice(baht) {
  if (baht == null || !Number.isFinite(baht)) return '-';
  return `฿${Math.round(baht).toLocaleString('en-US')}`;
}

/** Short price for list rows: 3500000 -> ฿3.5M, 950000 -> ฿950k, 999 -> ฿999. */
export function formatPriceShort(baht) {
  if (baht == null || !Number.isFinite(baht)) return '-';
  if (baht >= 1_000_000) return `฿${(+(baht / 1_000_000).toFixed(2)).toLocaleString('en-US')}M`;
  if (baht >= 1_000) return `฿${+(baht / 1_000).toFixed(1)}k`;
  return `฿${Math.round(baht)}`;
}

/** Floor area is always shown in square metres (never ตร.วา). */
export function formatSqm(sqm) {
  if (sqm == null || !Number.isFinite(sqm)) return '-';
  return `${+sqm.toFixed(2)} ตร.ม.`;
}

const trim = (n) => String(Math.round(n * 100) / 100);

export function formatArea(sqm) {
  if (sqm == null || !Number.isFinite(sqm)) return '-';
  if (sqm >= SQM_PER_RAI) {
    const rai = Math.floor(sqm / SQM_PER_RAI);
    const ngan = Math.floor((sqm % SQM_PER_RAI) / SQM_PER_NGAN);
    const wah = (sqm % SQM_PER_NGAN) / SQM_PER_WAH;
    const parts = [`${rai} ไร่`];
    if (ngan) parts.push(`${ngan} งาน`);
    if (wah) parts.push(`${trim(wah)} ตร.วา`);
    return parts.join(' ');
  }
  if (sqm >= 200) return `${trim(sqm / SQM_PER_WAH)} ตร.วา`;
  return `${trim(sqm)} ตร.ม.`;
}
