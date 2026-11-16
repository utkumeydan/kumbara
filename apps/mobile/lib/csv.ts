// Banka ve diğer uygulamaların CSV dışa aktarımlarını okur.
// Ayraç (, ; sekme), tırnaklı alanlar, Türkçe tarih ve tutar biçimleri desteklenir.

export type Field = 'date' | 'amount' | 'note' | 'category';
export type Mapping = Record<Field, number | null>;

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [';', ',', '\t'].map((d) => [d, head.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const HINTS: Record<Field, RegExp> = {
  date: /tarih|date|gün|valör/i,
  amount: /tutar|amount|miktar|meblağ|borç|harcama|price|total/i,
  note: /açıklama|aciklama|not|description|işlem|islem|detay|satıcı|merchant|memo|payee/i,
  category: /zarf|kategori|category|grup/i,
};

// Başlık satırındaki adlara göre sütunları tahmin eder
export function guessMapping(header: string[]): Mapping {
  const m: Mapping = { date: null, amount: null, note: null, category: null };
  (Object.keys(HINTS) as Field[]).forEach((f) => {
    const i = header.findIndex((h, idx) => HINTS[f].test(h) && !Object.values(m).includes(idx));
    m[f] = i >= 0 ? i : null;
  });
  return m;
}

// '31.10.2026', '31/10/2026', '2026-10-31', '31.10.26' → '2026-10-31'
export function parseDate(v: string): string | null {
  const s = v.trim().split(/[ T]/)[0];
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// '1.234,56' '-1234.56' '₺ 250,00' '(45,90)' → kuruş (işaretli)
export function parseAmount(v: string): number | null {
  let s = v.replace(/[₺$€\s]|TL|TRY/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && (s.match(/\./g) ?? []).length === 1 && s.length - lastDot - 1 === 3 && lastComma === -1) s = s.replace('.', '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const k = Math.round(n * 100);
  return neg ? -k : k;
}

export type ParsedRow = { line: number; date: string | null; amount: number | null; note: string; category: string };

export function extractRows(rows: string[][], mapping: Mapping, hasHeader: boolean): ParsedRow[] {
  return rows.slice(hasHeader ? 1 : 0).map((r, i) => ({
    line: i + (hasHeader ? 2 : 1),
    date: mapping.date !== null ? parseDate(r[mapping.date] ?? '') : null,
    amount: mapping.amount !== null ? parseAmount(r[mapping.amount] ?? '') : null,
    note: mapping.note !== null ? (r[mapping.note] ?? '').slice(0, 200) : '',
    category: mapping.category !== null ? (r[mapping.category] ?? '') : '',
  }));
}

// İlk satır başlık mı? (tarih ya da tutar olarak okunamıyorsa öyle sayılır)
export function looksLikeHeader(row: string[]) {
  return !row.some((c) => parseDate(c)) && !row.some((c) => parseAmount(c) !== null && /\d/.test(c));
}
