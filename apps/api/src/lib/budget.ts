import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db, t } from '../db/index.js';
import { addDays, cycleRange, daysBetween, dueDateInRange, today } from './dates.js';

export async function currentCycle(userId: string) {
  const [c] = await db
    .select()
    .from(t.cycles)
    .where(and(eq(t.cycles.userId, userId), eq(t.cycles.closed, false)))
    .orderBy(desc(t.cycles.startDate))
    .limit(1);
  return c ?? null;
}

export async function getUser(userId: string) {
  const [u] = await db.select().from(t.users).where(eq(t.users.id, userId));
  return u;
}

// Her zarf için dönemdeki giren, harcanan ve kalan tutarlar
export async function envelopeBalances(userId: string, cycleId: string | null) {
  const envs = await db
    .select()
    .from(t.envelopes)
    .where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.archived, false)))
    .orderBy(asc(t.envelopes.sort), asc(t.envelopes.createdAt));
  if (!cycleId) return envs.map((e) => ({ ...e, allocated: 0, assigned: 0, spent: 0, remaining: 0 }));

  const alloc = await db
    .select({
      envelopeId: t.allocations.envelopeId,
      total: sql<number>`coalesce(sum(${t.allocations.amount}),0)::int`,
      // Maaştan bilerek konan kısım (devir ve aktarımlar hariç)
      assigned: sql<number>`coalesce(sum(${t.allocations.amount}) filter (where ${t.allocations.kind} in ('payday','adjust')),0)::int`,
    })
    .from(t.allocations)
    .where(eq(t.allocations.cycleId, cycleId))
    .groupBy(t.allocations.envelopeId);
  const spent = await db
    .select({ envelopeId: t.transactions.envelopeId, total: sql<number>`coalesce(sum(${t.transactions.amount}),0)::int` })
    .from(t.transactions)
    .where(eq(t.transactions.cycleId, cycleId))
    .groupBy(t.transactions.envelopeId);

  const a = new Map(alloc.map((r) => [r.envelopeId, Number(r.total)]));
  const as = new Map(alloc.map((r) => [r.envelopeId, Number(r.assigned)]));
  const s = new Map(spent.map((r) => [r.envelopeId, Number(r.total)]));
  return envs.map((e) => {
    const allocated = a.get(e.id) ?? 0;
    const sp = s.get(e.id) ?? 0;
    return { ...e, allocated, assigned: as.get(e.id) ?? 0, spent: sp, remaining: allocated - sp };
  });
}

// Bu dönemde vadesi gelen ve henüz ödenmemiş faturalar
export async function billsForCycle(userId: string, cycle: { id: string; startDate: string; endDate: string }) {
  const rows = await db
    .select()
    .from(t.bills)
    .where(and(eq(t.bills.userId, userId), eq(t.bills.active, true)))
    .orderBy(asc(t.bills.dueDay));
  const paid = rows.length
    ? await db
        .select({ billId: t.transactions.billId })
        .from(t.transactions)
        .where(and(eq(t.transactions.cycleId, cycle.id), inArray(t.transactions.billId, rows.map((b) => b.id))))
    : [];
  const paidIds = new Set(paid.map((p) => p.billId));
  return rows.map((b) => ({
    ...b,
    dueDate: dueDateInRange(b.dueDay, cycle.startDate, cycle.endDate),
    paidThisCycle: paidIds.has(b.id),
  }));
}

// Art arda harcama kaydedilen gün sayısı (bugün ya da dün biten)
export async function streak(userId: string) {
  const rows = await db
    .selectDistinct({ d: t.transactions.spentOn })
    .from(t.transactions)
    .where(eq(t.transactions.userId, userId))
    .orderBy(desc(t.transactions.spentOn))
    .limit(400);
  const days = new Set(rows.map((r) => String(r.d)));
  let cursor = today();
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// XP kaynakları: harcama kaydı 6, kayıtlı gün 12, birikim 4, tamamlanan hedef 120, meydan okuma 50
export const XP = { expense: 6, activeDay: 12, saving: 4, goalDone: 120, challenge: 50 };

export async function progress(userId: string) {
  const [{ txCount, activeDays }] = await db
    .select({
      txCount: sql<number>`count(*)::int`,
      activeDays: sql<number>`count(distinct ${t.transactions.spentOn})::int`,
    })
    .from(t.transactions)
    .where(eq(t.transactions.userId, userId));
  const goalRows = await db
    .select({
      target: t.goals.target,
      saved: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int`,
      deposits: sql<number>`count(${t.goalContributions.id}) filter (where ${t.goalContributions.amount} > 0)::int`,
    })
    .from(t.goals)
    .leftJoin(t.goalContributions, eq(t.goals.id, t.goalContributions.goalId))
    .where(eq(t.goals.userId, userId))
    .groupBy(t.goals.id);

  const savedTotal = goalRows.reduce((s, g) => s + Number(g.saved), 0);
  const deposits = goalRows.reduce((s, g) => s + Number(g.deposits), 0);
  const goalsDone = goalRows.filter((g) => Number(g.saved) >= g.target).length;
  const sources = {
    expense: { count: Number(txCount), xp: Number(txCount) * XP.expense },
    activeDay: { count: Number(activeDays), xp: Number(activeDays) * XP.activeDay },
    saving: { count: deposits, xp: deposits * XP.saving },
    goalDone: { count: goalsDone, xp: goalsDone * XP.goalDone },
  };
  const [{ challenges }] = await db
    .select({ challenges: sql<number>`count(*)::int` })
    .from(t.challengeCompletions)
    .where(eq(t.challengeCompletions.userId, userId));
  const allSources = { ...sources, challenge: { count: Number(challenges), xp: Number(challenges) * XP.challenge } };
  const xp = Object.values(allSources).reduce((s, x) => s + x.xp, 0);
  // Seviye n için gereken toplam XP: 60 · n(n-1)/2 → 2. seviye 60, 3. seviye 180...
  const need = (n: number) => (60 * n * (n - 1)) / 2;
  let level = 1;
  while (xp >= need(level + 1)) level++;
  return { xp, level, levelStart: need(level), levelEnd: need(level + 1), savedTotal, mascotStage: Math.min(4, level - 1), sources: allSources };
}

// Bu haftanın (Pazartesi-Pazar) harcama kaydı olan günleri
export async function weekActivity(userId: string) {
  const now = today();
  const dow = (new Date(now + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const monday = addDays(now, -dow);
  const rows = await db
    .selectDistinct({ d: t.transactions.spentOn })
    .from(t.transactions)
    .where(and(eq(t.transactions.userId, userId), sql`${t.transactions.spentOn} >= ${monday}`));
  const set = new Set(rows.map((r) => String(r.d)));
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { day: d, active: set.has(d), today: d === now, future: d > now };
  });
}

export function cycleInfo(cycle: { startDate: string; endDate: string }) {
  const now = today();
  const daysLeft = Math.max(0, daysBetween(now, cycle.endDate) + 1);
  return { today: now, daysLeft, paydayDue: now > cycle.endDate, nextPayday: addDays(cycle.endDate, 1) };
}

// Dönemde dağıtılmamış gelirden hedeflere giden net tutar
export async function goalFundingFromIncome(cycleId: string) {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
    .from(t.goalContributions)
    .where(and(eq(t.goalContributions.cycleId, cycleId), isNull(t.goalContributions.sourceEnvelopeId)));
  return Number(total);
}

// Gelirin henüz ne zarfa ne hedefe konmamış kısmı
export async function unassignedFor(userId: string, cycle: { id: string; income: number }) {
  const envs = await envelopeBalances(userId, cycle.id);
  const assigned = envs.reduce((s, e) => s + e.assigned, 0);
  return cycle.income - assigned - (await goalFundingFromIncome(cycle.id));
}

// Verilen tarihi içeren dönem. Bütçe dağıtımı olmadığı için dönemler arka planda kendiliğinden açılır:
// tarih hiçbir döneme düşmüyorsa maaş gününe göre o tarihin dönemi oluşturulur.
export async function cycleForDate(userId: string, day: string) {
  if (day > today()) throw new HTTPException(400, { message: 'İleri tarihli harcama girilemez' });
  const [c] = await db
    .select()
    .from(t.cycles)
    .where(and(eq(t.cycles.userId, userId), lte(t.cycles.startDate, day), gte(t.cycles.endDate, day)))
    .orderBy(desc(t.cycles.startDate))
    .limit(1);
  if (c) return c;
  const user = await getUser(userId);
  let { start, end } = cycleRange(day, user.paydayDay);
  const all = await db.select().from(t.cycles).where(eq(t.cycles.userId, userId)).orderBy(asc(t.cycles.startDate));
  // Var olan dönemlerle çakışmasın: önceki dönemin bitişinden sonra başlar, sonrakinin başlangıcından önce biter
  const before = all.filter((x) => x.endDate < day).at(-1);
  const after = all.find((x) => x.startDate > day);
  if (before && before.endDate >= start) start = addDays(before.endDate, 1);
  if (after && after.startDate <= end) end = addDays(after.startDate, -1);
  return db.transaction(async (tx) => {
    // Geçmişte kalmış açık dönemler kapanır; yeni dönem bugünü içeriyorsa açık kalır
    if (end >= today()) await tx.update(t.cycles).set({ closed: true }).where(and(eq(t.cycles.userId, userId), eq(t.cycles.closed, false), lte(t.cycles.endDate, addDays(start, -1))));
    const [created] = await tx
      .insert(t.cycles)
      .values({ userId, startDate: start, endDate: end, income: user.income, closed: end < today() })
      .returning();
    return created;
  });
}

// Bu dönemde ödeme günü gelen sabit zarflar (zarfta para kaldıysa)
export function fixedDue(envs: Awaited<ReturnType<typeof envelopeBalances>>, cycle: { startDate: string; endDate: string }) {
  return envs
    .filter((e) => e.kind === 'fixed' && e.dueDay && e.remaining > 0)
    .map((e) => ({ envelopeId: e.id, name: e.name, icon: e.icon, color: e.color, amount: e.remaining, dueDate: dueDateInRange(e.dueDay!, cycle.startDate, cycle.endDate) }))
    .filter((e) => e.dueDate);
}

// Bu dönemde ödeme günü gelen ve henüz ödenmemiş borçlar
export async function debtsDue(userId: string, cycle: { id: string; startDate: string; endDate: string }) {
  const rows = await db.select().from(t.debts).where(eq(t.debts.userId, userId));
  // Banka durumundan gelen borçlar ödeme takviminde ayrıca gösterilir
  const withDay = rows.filter((d) => !d.accountId && !d.scheduleSource && d.dueDay && d.balance > 0 && d.monthlyPayment > 0);
  if (!withDay.length) return [];
  const paid = await db
    .select({ debtId: t.transactions.debtId })
    .from(t.transactions)
    .where(and(eq(t.transactions.cycleId, cycle.id), inArray(t.transactions.debtId, withDay.map((d) => d.id))));
  const paidIds = new Set(paid.map((p) => p.debtId));
  return withDay
    .filter((d) => !paidIds.has(d.id))
    .map((d) => ({ debtId: d.id, name: d.name, amount: Math.min(d.monthlyPayment, d.balance), dueDate: dueDateInRange(d.dueDay!, cycle.startDate, cycle.endDate) }))
    .filter((d) => d.dueDate);
}
