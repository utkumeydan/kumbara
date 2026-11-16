import { requestContext } from './context.js';

// Tarihler 'YYYY-MM-DD' metni olarak taşınır. "Bugün" isteği yapan cihazın saat dilimine göre
// hesaplanır; bilinmiyorsa APP_TZ kullanılır.
const DEFAULT_TZ = process.env.APP_TZ ?? 'Europe/Istanbul';

export function today(tz?: string): string {
  const zone = tz ?? requestContext.getStore()?.tz ?? DEFAULT_TZ;
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
}

function parts(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day };
}

function fmt(y: number, m: number, day: number): string {
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const { y, m, day } = parts(d);
  return fmt(y, m, day + n);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Ayın kısa olduğu durumlarda gün ayın son gününe sabitlenir (ör. 31 → 28 Şubat)
export function clampedDate(y: number, m: number, day: number): string {
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return fmt(yy, mm, Math.min(day, daysInMonth(yy, mm)));
}

// Verilen günü içeren maaş dönemi [start, end]
export function cycleRange(on: string, paydayDay: number): { start: string; end: string } {
  const { y, m } = parts(on);
  let start = clampedDate(y, m, paydayDay);
  let next = clampedDate(y, m + 1, paydayDay);
  if (start > on) {
    next = start;
    start = clampedDate(y, m - 1, paydayDay);
  }
  return { start, end: addDays(next, -1) };
}

// Belirli bir ayın gününün [start, end] aralığına düşen ilk tarihi
export function dueDateInRange(dueDay: number, start: string, end: string): string | null {
  const { y, m } = parts(start);
  for (let i = 0; i < 3; i++) {
    const d = clampedDate(y, m + i, dueDay);
    if (d >= start && d <= end) return d;
  }
  return null;
}
