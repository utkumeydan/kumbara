import { router } from 'expo-router';
import type { MonthPlan, PlanItem } from './api';
import { todayIso } from './money';

export const KIND_META: Record<PlanItem['kind'], { label: string; color: string }> = {
  installment: { label: 'Kart taksiti', color: '#F7B49A' },
  loan: { label: 'Kredi', color: '#C7B8F5' },
  card: { label: 'Kart ekstresi', color: '#FF9C7A' },
  debt: { label: 'Borç', color: '#F8D66D' },
  fixed: { label: 'Sabit gider', color: '#A7D3F2' },
  bill: { label: 'Fatura', color: '#A8E6A1' },
  spending: { label: 'Günlük harcama', color: '#8FD9CF' },
};

export const DEBT_KINDS = new Set<PlanItem['kind']>(['installment', 'loan', 'card', 'debt']);

// Listede bir satır: tek kalem ya da içinde taksitleri olan kart ekstresi
export type PlanRow = { key: string; date: string | null; label: string; kind: PlanItem['kind']; amount: number; paid: boolean; item: PlanItem; children: PlanItem[] };

// Aynı karta ve aynı son ödeme gününe ait ekstre ile taksitler tek ekstre satırında toplanır; krediler ayrı kalır
export function groupPlanItems(items: PlanItem[]): PlanRow[] {
  const rows: PlanRow[] = [];
  const cards = new Map<string, PlanRow>();
  items.forEach((x, i) => {
    if ((x.kind !== 'card' && x.kind !== 'installment') || !x.source) {
      rows.push({ key: `${x.ref.id}-${i}`, date: x.date, label: x.label, kind: x.kind, amount: x.amount, paid: x.paid, item: x, children: [] });
      return;
    }
    const card = x.source.replace(/ (ekstresi|taksitleri)$/, '');
    const key = `${card}|${x.date}`;
    let row = cards.get(key);
    if (!row) {
      row = { key, date: x.date, label: `${card} ekstresi`, kind: 'card', amount: 0, paid: true, item: x, children: [] };
      cards.set(key, row);
      rows.push(row);
    }
    row.amount += x.amount;
    row.paid = row.paid && x.paid;
    // Dokununca ekstrenin kendisi açılır; ekstre yoksa ilk taksit
    if (x.kind === 'card') row.item = x;
    row.children.push(x);
  });
  return rows;
}

// Sıradaki maaş yatınca hesapta ne olacağı ve sonraki maaşa kadarki ödemeler düşünce ne kalacağı.
// Tarihsiz sabit giderler (faturalar) maaşın yattığı ayda sayılır; günlük harcama tahmini dahil değildir.
export function afterPayday(plan: MonthPlan) {
  if (plan.bank === null) return null;
  const today = todayIso();
  const incomes = plan.months.map((m) => m.income).filter((x) => x.amount > 0 && x.date >= today);
  const income = incomes[0];
  if (!income) return null;
  const next = incomes[1]?.date ?? '9999';
  const dated = plan.months.flatMap((m) => m.items).filter((x) => !x.paid && x.date);
  const before = dated.filter((x) => x.date! < income.date && (x.date! >= today || x.ref.type === 'schedule')).reduce((s, x) => s + x.amount, 0);
  const undated = plan.months.find((m) => m.income.date === income.date)?.items.filter((x) => !x.paid && !x.date && x.kind === 'fixed') ?? [];
  const payments = groupPlanItems([...dated.filter((x) => x.date! >= income.date && x.date! < next), ...undated]);
  const paymentsTotal = payments.reduce((s, x) => s + x.amount, 0);
  const balance = plan.bank - before + income.amount;
  return { date: income.date, amount: income.amount, before, balance, payments, paymentsTotal, afterPayments: balance - paymentsTotal, nextDate: incomes[1]?.date ?? null };
}

// Plandaki bir kalemin ayrıntısını açar
export function openPlanItem(x: PlanItem) {
  if (x.ref.type === 'schedule') router.push(`/schedule-item?id=${x.ref.id}`);
  else if (x.ref.type === 'envelope') router.push(`/envelope/${x.ref.id}`);
  else if (x.ref.type === 'envelopes') router.push('/envelopes');
  else if (x.ref.type === 'bill') router.push(`/bill/${x.ref.id}`);
  else router.push(`/debt/${x.ref.id}`);
}
