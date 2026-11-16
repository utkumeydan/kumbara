import { parseMoney } from './money';

export type ParsedPayment = { source: string; name: string; amount: number; dueDate: string };

const DATE = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/;
const AMOUNT = /(\d[\d.,]*)\s*(?:tl|₺|try)?\s*$/i;

function cap(s: string) {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t[0].toLocaleUpperCase('tr-TR') + t.slice(1) : t;
}

// Bankadan kopyalanan ödeme listesini çözümler:
//   "ihtiyaç kredisi :"        → kaynak başlığı (':' ile biten ya da tutarsız satır)
//   "11/11/2026"               → sonraki satırların tarihi
//   "zara 1495 tl"             → ad + tutar (son tarihe yazılır)
//   "30/10/2026 8711 tl"       → tarih + tutar (adı kaynaktır)
export function parseSchedule(text: string, fallbackSource = 'Ödemeler') {
  const items: ParsedPayment[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let source = fallbackSource;
  let date: string | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const d = line.match(DATE);
    const iso = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : null;
    const rest = (d ? line.replace(d[0], ' ') : line).trim();
    const a = rest.match(AMOUNT);
    const amount = a ? parseMoney(a[1]) : 0;

    if (line.endsWith(':') || (!iso && !amount)) {
      source = cap(line.replace(/:\s*$/, '')) || fallbackSource;
      date = null;
      continue;
    }
    if (iso && !amount) {
      date = iso;
      continue;
    }
    const when = iso ?? date;
    if (!when) {
      warnings.push(`“${line}” için tarih bulunamadı, atlandı.`);
      continue;
    }
    if (iso) date = iso;
    const name = cap(a ? rest.slice(0, a.index).replace(/[:\-–]\s*$/, '') : rest) || source;
    const item = { source, name, amount, dueDate: when };
    const key = `${source}|${name}|${when}|${amount}`;
    if (seen.has(key)) {
      warnings.push(`${source}: ${when.split('-').reverse().join('/')} tarihli ${name} iki kez yazılmış, bir kez eklenecek.`);
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  return { items, warnings };
}
