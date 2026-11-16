import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { currentCycle, envelopeBalances, getUser, unassignedFor } from './budget.js';
import { addDays, clampedDate, cycleRange, dueDateInRange, today } from './dates.js';
import { debtPlan } from './debt.js';

type Account = typeof t.accounts.$inferSelect;
type Payment = typeof t.scheduledPayments.$inferSelect;
type Debt = typeof t.debts.$inferSelect;

// Kullanılabilir tutar: banka için bakiye + esnek hesap limiti, kart için limit − borç − provizyon
export function accountAvailable(a: Pick<Account, 'kind' | 'balance' | 'creditLimit' | 'pending'>) {
  if (a.kind === 'cash') return a.balance;
  if (a.kind === 'bank') return a.balance + (a.creditLimit ?? 0);
  return Math.max(0, (a.creditLimit ?? 0) + a.balance - a.pending);
}

// Hesabın borç kısmı: eksi bakiye (+ kartta provizyon)
export function accountDebt(a: Pick<Account, 'kind' | 'balance' | 'pending'>) {
  return Math.max(0, -a.balance) + (a.kind === 'card' ? a.pending : 0);
}

export const statementSource = (cardName: string) => `${cardName} ekstresi`;

// Ödenmemiş planlı ödemeleri aylara göre gruplar
export function groupByMonth<P extends Pick<Payment, 'dueDate' | 'amount'>>(rows: P[]) {
  const months = new Map<string, { month: string; total: number; items: P[] }>();
  for (const r of rows) {
    const key = r.dueDate.slice(0, 7);
    const m = months.get(key) ?? { month: key, total: 0, items: [] };
    m.total += r.amount;
    m.items.push(r);
    months.set(key, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// Maaş gününe kadar (tarihi geçmişler dahil) ödenmesi gereken planlı ödemeler
export async function scheduledDue(userId: string) {
  const cycle = await currentCycle(userId);
  const end = cycle?.endDate ?? addDays(today(), 30);
  const rows = await db
    .select()
    .from(t.scheduledPayments)
    .where(and(eq(t.scheduledPayments.userId, userId), isNull(t.scheduledPayments.paidAt), lte(t.scheduledPayments.dueDate, end)))
    .orderBy(asc(t.scheduledPayments.dueDate));
  if (!rows.length) return null;
  return { total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length, overdue: rows.filter((r) => r.dueDate < today()).length, next: rows[0] };
}

// Hesap kaydedildiğinde günün bakiyesi geçmişe yazılır
export async function snapshotAccount(a: Account) {
  const net = a.balance - (a.kind === 'card' ? a.pending : 0);
  await db
    .insert(t.accountSnapshots)
    .values({ userId: a.userId, accountId: a.id, day: today(), net })
    .onConflictDoUpdate({ target: [t.accountSnapshots.accountId, t.accountSnapshots.day], set: { net } });
}

// Banka durumundan türeyen kayıtları günceller:
// kart ekstresi → ödeme takvimi; eksi bakiyeli hesaplar ve takvim kaynakları → Borçlarım
export async function syncMoney(userId: string) {
  const accounts = await db.select().from(t.accounts).where(eq(t.accounts.userId, userId));
  const cards = accounts.filter((a) => a.kind === 'card');
  const statementSources = new Set(cards.map((a) => statementSource(a.name)));

  await db.transaction(async (tx) => {
    // 1) Kart ekstresi: tek bir ödenmemiş kalem olarak takvimde tutulur
    for (const a of cards) {
      const source = statementSource(a.name);
      const open = await tx
        .select()
        .from(t.scheduledPayments)
        .where(and(eq(t.scheduledPayments.userId, userId), eq(t.scheduledPayments.source, source), isNull(t.scheduledPayments.paidAt)));
      const want = a.dueDate && a.dueAmount ? { dueDate: a.dueDate, amount: a.dueAmount } : null;
      const keep = want ? open.find((p) => p.dueDate === want.dueDate) : undefined;
      const drop = open.filter((p) => p !== keep).map((p) => p.id);
      if (drop.length) await tx.delete(t.scheduledPayments).where(inArray(t.scheduledPayments.id, drop));
      if (want && keep && keep.amount !== want.amount) await tx.update(t.scheduledPayments).set({ amount: want.amount }).where(eq(t.scheduledPayments.id, keep.id));
      if (want && !keep) {
        // Aynı ekstre daha önce ödendi olarak işaretlendiyse yeniden açılmaz
        const [paid] = await tx
          .select({ id: t.scheduledPayments.id })
          .from(t.scheduledPayments)
          .where(and(eq(t.scheduledPayments.userId, userId), eq(t.scheduledPayments.source, source), eq(t.scheduledPayments.dueDate, want.dueDate), isNotNull(t.scheduledPayments.paidAt)));
        if (!paid) await tx.insert(t.scheduledPayments).values({ userId, source, name: 'Ekstre ödemesi', ...want });
      }
    }

    const auto = await tx
      .select()
      .from(t.debts)
      .where(and(eq(t.debts.userId, userId), or(isNotNull(t.debts.accountId), isNotNull(t.debts.scheduleSource))));

    // 2) Eksi bakiyeli hesaplar → borç (aylık ödeme ve faiz kullanıcıda kalır)
    for (const a of accounts) {
      const existing = auto.find((d) => d.accountId === a.id);
      const balance = accountDebt(a);
      if (!balance) {
        if (existing) await tx.delete(t.debts).where(eq(t.debts.id, existing.id));
        continue;
      }
      const card = a.kind === 'card';
      const values = {
        name: a.name,
        type: card ? ('card' as const) : ('other' as const),
        balance,
        ...(card && a.dueAmount ? { monthlyPayment: a.dueAmount } : {}),
        ...(card && a.dueDate ? { dueDay: Number(a.dueDate.slice(8)) } : {}),
      };
      if (existing) await tx.update(t.debts).set(values).where(eq(t.debts.id, existing.id));
      else await tx.insert(t.debts).values({ userId, accountId: a.id, monthlyPayment: 0, ...values });
    }
    const accountIds = new Set(accounts.map((a) => a.id));
    const orphan = auto.filter((d) => d.accountId && !accountIds.has(d.accountId)).map((d) => d.id);

    // 3) Takvim kaynakları (ekstre hariç) → borç; bakiye kalan ödemelerin toplamı
    const unpaid = await tx
      .select()
      .from(t.scheduledPayments)
      .where(and(eq(t.scheduledPayments.userId, userId), isNull(t.scheduledPayments.paidAt)))
      .orderBy(asc(t.scheduledPayments.dueDate));
    const bySource = new Map<string, Payment[]>();
    for (const p of unpaid) if (!statementSources.has(p.source)) bySource.set(p.source, [...(bySource.get(p.source) ?? []), p]);
    for (const [source, rows] of bySource) {
      const existing = auto.find((d) => d.scheduleSource === source);
      const next = rows[0];
      const values = {
        name: source,
        type: /kart/i.test(source) ? ('card' as const) : ('loan' as const),
        balance: rows.reduce((s, p) => s + p.amount, 0),
        // Sıradaki ödeme günü aynı tarihteki tüm kalemlerin toplamıdır
        monthlyPayment: rows.filter((p) => p.dueDate === next.dueDate).reduce((s, p) => s + p.amount, 0),
        dueDay: Number(next.dueDate.slice(8)),
      };
      if (existing) await tx.update(t.debts).set(values).where(eq(t.debts.id, existing.id));
      else await tx.insert(t.debts).values({ userId, scheduleSource: source, ...values });
    }
    orphan.push(...auto.filter((d) => d.scheduleSource && !bySource.has(d.scheduleSource)).map((d) => d.id));
    if (orphan.length) await tx.delete(t.debts).where(inArray(t.debts.id, orphan));
  });
}

// Borç planı; takvimden gelen borçlarda bitiş son taksitin ayıdır
export async function planDebts(userId: string, debts: Debt[]) {
  const sources = debts.filter((d) => d.scheduleSource).map((d) => d.scheduleSource!);
  const rows = sources.length
    ? await db
        .select({ source: t.scheduledPayments.source, dueDate: t.scheduledPayments.dueDate })
        .from(t.scheduledPayments)
        .where(and(eq(t.scheduledPayments.userId, userId), isNull(t.scheduledPayments.paidAt), inArray(t.scheduledPayments.source, sources)))
    : [];
  return debts.map((d) => {
    if (!d.scheduleSource) return { ...d, ...debtPlan(d), auto: !!d.accountId };
    const months = new Set(rows.filter((r) => r.source === d.scheduleSource).map((r) => r.dueDate.slice(0, 7)));
    const last = [...months].sort().at(-1) ?? null;
    return { ...d, months: months.size, payoffDate: last, totalInterest: 0, monthlyRate: 0, auto: true };
  });
}

type Flow = { start: string; end: string; income: number; items: { label: string; amount: number; kind: 'scheduled' | 'bill' | 'debt' }[]; total: number; free: number };

// Maaştan maaşa nakit akışı: her dönemin geliri, kesin ödemeleri ve geriye kalan
export async function cashflow(userId: string, count = 12): Promise<Flow[]> {
  const [user, cycle] = await Promise.all([getUser(userId), currentCycle(userId)]);
  const now = today();
  let range = cycle ? { start: cycle.startDate, end: cycle.endDate } : cycleRange(now, user.paydayDay);
  const lastEnd = addDays(range.start, 31 * count + 31);
  const [unpaid, bills, debts, accounts, envelopes] = await Promise.all([
    db
      .select()
      .from(t.scheduledPayments)
      .where(and(eq(t.scheduledPayments.userId, userId), isNull(t.scheduledPayments.paidAt), lte(t.scheduledPayments.dueDate, lastEnd))),
    db.select().from(t.bills).where(and(eq(t.bills.userId, userId), eq(t.bills.active, true))),
    db.select().from(t.debts).where(eq(t.debts.userId, userId)),
    db.select().from(t.accounts).where(eq(t.accounts.userId, userId)),
    db.select().from(t.envelopes).where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.archived, false), eq(t.envelopes.kind, 'fixed'))),
  ]);
  // Sabit zarflar (kira, aidat...) her dönem planlanan tutarıyla; aynı zarfa bağlı fatura varsa o sayılır
  const billEnvelopes = new Set(bills.map((b) => b.envelopeId).filter(Boolean));
  const fixed = envelopes.filter((e) => e.plannedAmount > 0 && !billEnvelopes.has(e.id));
  const bankIds = new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id));
  // Takvimde olmayan aylık borç ödemeleri: elle girilen borçlar ve esnek hesap kapatma tutarı
  const monthly = debts
    .filter((d) => !d.scheduleSource && (!d.accountId || bankIds.has(d.accountId)) && d.monthlyPayment > 0 && d.balance > 0)
    .map((d) => ({ name: d.name, amount: d.monthlyPayment, left: d.balance }));
  const billLeft = new Map(bills.map((b) => [b.id, b.installmentsTotal ? Math.max(0, b.installmentsTotal - b.installmentsPaid) : Infinity]));

  const flows: Flow[] = [];
  for (let i = 0; i < count; i++) {
    const items: Flow['items'] = [];
    const sched = new Map<string, number>();
    for (const p of unpaid) {
      // İlk döneme tarihi geçmiş ödenmemişler de girer
      if ((p.dueDate >= range.start || i === 0) && p.dueDate <= range.end) sched.set(p.source, (sched.get(p.source) ?? 0) + p.amount);
    }
    for (const [label, amount] of sched) items.push({ label, amount, kind: 'scheduled' });
    for (const b of bills) {
      if ((billLeft.get(b.id) ?? 0) <= 0 || !dueDateInRange(b.dueDay, range.start, range.end)) continue;
      items.push({ label: b.name, amount: b.amount, kind: 'bill' });
      billLeft.set(b.id, (billLeft.get(b.id) ?? 0) - 1);
    }
    for (const e of fixed) if (!e.plannedFrom || range.end >= e.plannedFrom) items.push({ label: e.name, amount: e.plannedAmount, kind: 'bill' });
    for (const d of monthly) {
      if (d.left <= 0) continue;
      const pay = Math.min(d.amount, d.left);
      items.push({ label: d.name, amount: pay, kind: 'debt' });
      d.left -= pay;
    }
    const income = i === 0 && cycle ? cycle.income : user.income;
    const total = items.reduce((s, x) => s + x.amount, 0);
    flows.push({ ...range, income, items: items.sort((a, b) => b.amount - a.amount), total, free: income - total });
    range = cycleRange(addDays(range.end, 1), user.paydayDay);
  }
  return flows;
}

// Net durum geçmişi: her kayıt gününde tüm hesapların son bilinen net bakiyelerinin toplamı
export async function netHistory(userId: string, days = 180) {
  const since = addDays(today(), -days);
  const rows = await db
    .select()
    .from(t.accountSnapshots)
    .where(and(eq(t.accountSnapshots.userId, userId), gte(t.accountSnapshots.day, since)))
    .orderBy(asc(t.accountSnapshots.day));
  const last = new Map<string, number>();
  const out: { day: string; net: number }[] = [];
  for (const r of rows) {
    last.set(r.accountId, r.net);
    const sum = [...last.values()].reduce((s, n) => s + n, 0);
    if (out.at(-1)?.day === r.day) out[out.length - 1].net = sum;
    else out.push({ day: r.day, net: sum });
  }
  return out;
}

export type PlanItem = {
  date: string | null;
  label: string;
  source: string | null;
  amount: number;
  // installment: kart taksiti, loan: kredi, card: kart ekstresi, debt: diğer borç ödemesi, fixed: sabit gider, bill: fatura,
  // spending: değişken zarflardan beklenen günlük harcama
  kind: 'installment' | 'loan' | 'card' | 'debt' | 'fixed' | 'bill' | 'spending';
  paid: boolean;
  ref: { type: 'schedule' | 'envelope' | 'envelopes' | 'bill' | 'debt'; id: string };
};
const DEBT_KINDS = new Set<PlanItem['kind']>(['installment', 'loan', 'card', 'debt']);

// Takvim ayına göre ödeme planı: her ayın geliri, tarihli ödemeleri ve cebe kalan
export async function monthPlan(userId: string, count = 12) {
  const [user, accounts] = await Promise.all([getUser(userId), db.select().from(t.accounts).where(eq(t.accounts.userId, userId))]);
  const [y0, m0] = today().split('-').map(Number);
  const first = `${y0}-${String(m0).padStart(2, '0')}-01`;
  const lastDay = clampedDate(y0, m0 + count, 0);
  const statements = new Set(accounts.filter((a) => a.kind === 'card').map((a) => statementSource(a.name)));
  const bankIds = new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id));
  const [scheduled, bills, debts, envelopes] = await Promise.all([
    db
      .select()
      .from(t.scheduledPayments)
      .where(and(eq(t.scheduledPayments.userId, userId), or(isNull(t.scheduledPayments.paidAt), gte(t.scheduledPayments.dueDate, first)), lte(t.scheduledPayments.dueDate, lastDay))),
    db.select().from(t.bills).where(and(eq(t.bills.userId, userId), eq(t.bills.active, true))),
    db.select().from(t.debts).where(eq(t.debts.userId, userId)),
    db.select().from(t.envelopes).where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.archived, false))),
  ]);
  const billEnvelopes = new Set(bills.map((b) => b.envelopeId).filter(Boolean));
  const fixed = envelopes.filter((e) => e.kind === 'fixed' && e.plannedAmount > 0 && !billEnvelopes.has(e.id));
  // Sabit giderin o dönemki ödemesi (önceki vade gününden sonra, bu vadeye kadar) yapıldıysa ödendi sayılır; erken ödenen kira gibi
  const fixedPaid = fixed.length
    ? await db
        .select({ envelopeId: t.transactions.envelopeId, amount: t.transactions.amount, spentOn: t.transactions.spentOn })
        .from(t.transactions)
        .where(and(eq(t.transactions.userId, userId), inArray(t.transactions.envelopeId, fixed.map((e) => e.id)), gte(t.transactions.spentOn, addDays(first, -31))))
    : [];
  const paidInWindow = (envelopeId: string, from: string, to: string) =>
    fixedPaid.filter((x) => x.envelopeId === envelopeId && x.spentOn > from && x.spentOn <= to).reduce((s, x) => s + x.amount, 0);
  // Günlük harcamalar: değişken kategorilerde son 90 günün günlük ortalaması (bütçe yok, geçmiş harcamadan tahmin)
  const variableIds = new Set(envelopes.filter((e) => e.kind === 'variable' && !e.system).map((e) => e.id));
  const since = addDays(today(), -90);
  const recent = (
    await db
      .select({ amount: t.transactions.amount, envelopeId: t.transactions.envelopeId, spentOn: t.transactions.spentOn, note: t.transactions.note })
      .from(t.transactions)
      .where(and(eq(t.transactions.userId, userId), gte(t.transactions.spentOn, since)))
  ).filter((x) => variableIds.has(x.envelopeId));
  const firstDay = recent.reduce((d, x) => (x.spentOn < d ? x.spentOn : d), today());
  const observedDays = Math.max(1, Math.round((Date.parse(today()) - Date.parse(firstDay)) / 86_400_000) + 1);
  const perDay = recent.reduce((s, x) => s + x.amount, 0) / Math.max(observedDays, 14);
  // Gerçek durum: banka ve nakit bakiyesinden başlayan projeksiyon (kartlar hariç)
  const cashAccounts = accounts.filter((a) => a.kind !== 'card');
  let running: number | null = cashAccounts.length ? cashAccounts.reduce((s, a) => s + a.balance, 0) : null;
  const now = today();
  const billLeft = new Map(bills.map((b) => [b.id, b.installmentsTotal ? Math.max(0, b.installmentsTotal - b.installmentsPaid) : Infinity]));
  const monthly = debts
    .filter((d) => !d.scheduleSource && (!d.accountId || bankIds.has(d.accountId)) && d.monthlyPayment > 0 && d.balance > 0)
    .map((d) => ({ id: d.id, name: d.name, amount: d.monthlyPayment, dueDay: d.dueDay, left: d.balance }));
  // Borçlarım'daki sınıflandırmayla aynı: adında "kart" geçen kaynaklar kart taksiti, diğerleri kredi
  const kindOf = (source: string): PlanItem['kind'] => (statements.has(source) ? 'card' : /kart/i.test(source) ? 'installment' : 'loan');

  const months = [];
  for (let i = 0; i < count; i++) {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const items: PlanItem[] = [];
    for (const p of scheduled) {
      // Geçmiş aylardan kalan ödenmemişler bu aya eklenir
      const inMonth = p.dueDate.startsWith(key) || (i === 0 && p.dueDate < first && !p.paidAt);
      if (inMonth) items.push({ date: p.dueDate, label: p.name, source: p.source, amount: p.amount, kind: kindOf(p.source), paid: !!p.paidAt, ref: { type: 'schedule', id: p.id } });
    }
    for (const e of fixed) {
      const date = e.dueDay ? clampedDate(y, m, e.dueDay) : null;
      // Başlangıç tarihinden önceki aylarda bu gider yok
      if (e.plannedFrom && (date ?? clampedDate(y, m + 1, 0)) < e.plannedFrom) continue;
      const from = date ? clampedDate(y, m - 1, e.dueDay!) : clampedDate(y, m, 0);
      const paid = paidInWindow(e.id, from, date ?? clampedDate(y, m + 1, 0)) >= e.plannedAmount;
      items.push({ date, label: e.name, source: null, amount: e.plannedAmount, kind: 'fixed', paid, ref: { type: 'envelope', id: e.id } });
    }
    for (const b of bills) {
      if ((billLeft.get(b.id) ?? 0) <= 0) continue;
      items.push({ date: clampedDate(y, m, b.dueDay), label: b.name, source: b.installmentsTotal ? 'Taksit' : null, amount: b.amount, kind: 'bill', paid: false, ref: { type: 'bill', id: b.id } });
      billLeft.set(b.id, (billLeft.get(b.id) ?? 0) - 1);
    }
    for (const d of monthly) {
      if (d.left <= 0) continue;
      const pay = Math.min(d.amount, d.left);
      items.push({ date: d.dueDay ? clampedDate(y, m, d.dueDay) : null, label: d.name, source: null, amount: pay, kind: 'debt', paid: false, ref: { type: 'debt', id: d.id } });
      d.left -= pay;
    }
    // Bu ay yalnızca kalan günler, sonraki aylar ayın tamamı
    const daysLeftInMonth = i === 0 ? Number(clampedDate(y, m + 1, 0).slice(8)) - Number(today().slice(8)) : Number(clampedDate(y, m + 1, 0).slice(8));
    const spend = Math.round((perDay * daysLeftInMonth) / 100) * 100;
    if (spend > 0)
      items.push({ date: null, label: 'Günlük harcamalar', source: 'son 3 ayın ortalaması', amount: spend, kind: 'spending', paid: false, ref: { type: 'envelopes', id: '' } });
    items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.amount - a.amount);
    const monthEnd = clampedDate(y, m + 1, 0);
    const total = items.reduce((s, x) => s + x.amount, 0);
    const debtTotal = items.filter((x) => DEBT_KINDS.has(x.kind)).reduce((s, x) => s + x.amount, 0);
    const spendingTotal = items.filter((x) => x.kind === 'spending').reduce((s, x) => s + x.amount, 0);
    const incomeDate = clampedDate(y, m, user.paydayDay);
    // Bu ay yalnızca bugünden sonraki gelir ve ödenmemiş ödemeler sayılır (geçmiş günlerdekiler bakiyeye yansımış kabul edilir)
    const pendingItems = items.filter((x) => !x.paid && (i > 0 || x.ref.type === 'schedule' || !x.date || x.date >= now));
    const incomeCounted = i > 0 || incomeDate >= now ? user.income : 0;
    const paymentsCounted = pendingItems.reduce((s, x) => s + x.amount, 0);
    const opening = running;
    const closing = running === null ? null : running + incomeCounted - paymentsCounted;
    running = closing;
    months.push({
      month: key,
      income: { amount: user.income, date: incomeDate },
      items,
      total,
      debtTotal,
      spendingTotal,
      fixedTotal: total - debtTotal - spendingTotal,
      opening,
      closing,
      incomeCounted,
      paymentsCounted,
      paidTotal: items.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0),
      free: user.income - total,
      // Ay sonunda kalan taksit ve kredi borcu (takvimdeki ödenmemişler)
      debtLeft: scheduled.filter((p) => !p.paidAt && p.dueDate > monthEnd).reduce((s, p) => s + p.amount, 0),
    });
  }
  const lastDebt = [...months].reverse().find((x) => x.debtTotal > 0);
  const bank = months[0]?.opening ?? null;
  return {
    months,
    debtFreeMonth: lastDebt && !months.at(-1)!.debtLeft ? lastDebt.month : null,
    // Şu anki banka + nakit bakiyesi ve eksiden çıkılan ilk ay
    bank,
    positiveMonth: bank !== null && bank < 0 ? (months.find((x) => (x.closing ?? -1) >= 0)?.month ?? null) : null,
  };
}

const OVERDRAFT_NOTE = 'Esnek hesaba gitti (otomatik)';

// Harcamanın ödeme aracına etkisi: kartta provizyon artar, banka/nakitte bakiye azalır.
// amount eksi verilirse etki geri alınır (silme, düzenleme).
export async function applyAccountSpend(userId: string, accountId: string | null | undefined, amount: number) {
  if (!accountId || !amount) return;
  const [a] = await db.select().from(t.accounts).where(and(eq(t.accounts.id, accountId), eq(t.accounts.userId, userId)));
  if (!a) return;
  const patch = a.kind === 'card' ? { pending: Math.max(0, a.pending + amount) } : { balance: a.balance - amount };
  const [u] = await db
    .update(t.accounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(t.accounts.id, a.id))
    .returning();
  await snapshotAccount(u);
  await syncMoney(userId);
}


type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Bu dönem otomatik olarak esnek hesaba sayılan tutar
export async function overdraftShare(userId: string, cycleId: string) {
  const [od] = await db.select().from(t.envelopes).where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.system, 'overdraft')));
  if (!od) return 0;
  const rows = await db
    .select({ amount: t.transactions.amount })
    .from(t.transactions)
    .where(and(eq(t.transactions.cycleId, cycleId), eq(t.transactions.envelopeId, od.id), eq(t.transactions.note, OVERDRAFT_NOTE)));
  return rows.reduce((s, r) => s + r.amount, 0);
}

// Dönemin otomatik esnek hesap payını sıfırlar (gelir silinince yeniden hesaplanması için)
export async function resetOverdraft(tx: Tx, userId: string, cycleId: string) {
  const [od] = await tx.select().from(t.envelopes).where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.system, 'overdraft')));
  if (!od) return;
  await tx.delete(t.transactions).where(and(eq(t.transactions.cycleId, cycleId), eq(t.transactions.envelopeId, od.id), eq(t.transactions.note, OVERDRAFT_NOTE)));
  await tx.delete(t.allocations).where(and(eq(t.allocations.cycleId, cycleId), eq(t.allocations.envelopeId, od.id), eq(t.allocations.kind, 'adjust')));
}
