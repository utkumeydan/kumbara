// Tutarlar API'de kuruş cinsinden tamsayıdır.

export function formatMoney(kurus: number, opts: { cents?: boolean; currency?: string } = {}) {
  const cents = opts.cents ?? (kurus % 100 !== 0 && Math.abs(kurus) < 100_000_00);
  return (kurus / 100).toLocaleString('tr-TR', {
    style: 'currency',
    currency: opts.currency ?? 'TRY',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

// "1.250,50" veya "1250.5" gibi girişleri kuruşa çevirir
export function parseMoney(input: string): number {
  const s = input.trim().replace(/\s/g, '');
  if (!s) return 0;
  let normalized: string;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) normalized = s.replace(/\./g, '');
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export function toInput(kurus: number) {
  if (!kurus) return '';
  return (kurus / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2, useGrouping: false });
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function formatDay(iso: string, withYear = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function relativeDay(iso: string) {
  const today = todayIso();
  const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return 'Bugün';
  if (diff === -1) return 'Dün';
  if (diff === 1) return 'Yarın';
  return formatDay(iso);
}

const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// '2027-07' → 'Tem 2027'
export function formatMonth(ym: string, long = false) {
  const [y, m] = ym.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// Hedef son tarihi için hazır seçenekler
function addMonths(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function deadlineOptions() {
  const year = new Date().getFullYear();
  return [
    { label: 'Yıl sonu', value: `${year}-12-31` },
    { label: '3 ay', value: addMonths(3) },
    { label: '6 ay', value: addMonths(6) },
    { label: '1 yıl', value: addMonths(12) },
    { label: 'Tarih yok', value: null },
  ];
}


// "ayın 17'si", "ayın 3'ü" gibi iyelik eki (sayının okunuşuna göre)
export function dayOfMonth(n: number) {
  const last = n % 10;
  const tens = n % 100;
  const byTens: Record<number, string> = { 10: 'u', 20: 'si', 30: 'u' };
  const byLast: Record<number, string> = { 1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i', 6: 'sı', 7: 'si', 8: 'i', 9: 'u' };
  return `${n}'${last === 0 ? (byTens[tens] ?? 'u') : byLast[last]}`;
}
