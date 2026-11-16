import { and, eq, sql } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { addDays } from './dates.js';

export type Badge = { code: string; title: string; description: string; icon: string; earned: boolean; progress: number };

// Rozetler kayıtlı verilerden hesaplanır; ayrı bir tablo tutulmaz
export async function computeBadges(userId: string, actorId: string): Promise<Badge[]> {
  const [days, [{ txCount }], goals, cycles, [{ challenges }], [{ spaces }], debts] = await Promise.all([
    db.selectDistinct({ d: t.transactions.spentOn }).from(t.transactions).where(eq(t.transactions.userId, userId)),
    db.select({ txCount: sql<number>`count(*)::int` }).from(t.transactions).where(eq(t.transactions.userId, userId)),
    db
      .select({ target: t.goals.target, saved: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
      .from(t.goals)
      .leftJoin(t.goalContributions, eq(t.goals.id, t.goalContributions.goalId))
      .where(eq(t.goals.userId, userId))
      .groupBy(t.goals.id),
    db
      .select({ id: t.cycles.id, income: t.cycles.income, closed: t.cycles.closed, startDate: t.cycles.startDate, endDate: t.cycles.endDate, spent: sql<number>`coalesce((select sum(amount) from transactions where cycle_id = ${t.cycles.id}),0)::int` })
      .from(t.cycles)
      .where(eq(t.cycles.userId, userId)),
    db.select({ challenges: sql<number>`count(*)::int` }).from(t.challengeCompletions).where(eq(t.challengeCompletions.userId, userId)),
    db.select({ spaces: sql<number>`count(*)::int` }).from(t.spaceMembers).where(eq(t.spaceMembers.userId, actorId)),
    db.select({ balance: t.debts.balance }).from(t.debts).where(and(eq(t.debts.userId, userId))),
  ]);

  // En uzun kayıt serisi
  const set = new Set(days.map((x) => String(x.d)));
  let longest = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue;
    let n = 0;
    while (set.has(addDays(d, n))) n++;
    longest = Math.max(longest, n);
  }
  // Bir dönemdeki en fazla harcamasız gün
  const cycleDays = new Map<string, Set<string>>();
  const txDays = await db.selectDistinct({ cycleId: t.transactions.cycleId, d: t.transactions.spentOn }).from(t.transactions).where(eq(t.transactions.userId, userId));
  for (const r of txDays) cycleDays.set(r.cycleId, (cycleDays.get(r.cycleId) ?? new Set()).add(String(r.d)));
  let maxQuiet = 0;
  for (const cy of cycles.filter((x) => x.closed)) {
    let quiet = 0;
    for (let d = cy.startDate; d <= cy.endDate; d = addDays(d, 1)) if (!cycleDays.get(cy.id)?.has(d)) quiet++;
    maxQuiet = Math.max(maxQuiet, quiet);
  }
  const goalsDone = goals.filter((g) => Number(g.saved) >= g.target).length;
  const underBudget = cycles.some((x) => x.closed && x.income > 0 && Number(x.spent) <= x.income);
  const n = Number(txCount);
  const b = (code: string, icon: string, title: string, description: string, progress: number): Badge => ({
    code,
    icon,
    title,
    description,
    progress: Math.max(0, Math.min(1, progress)),
    earned: progress >= 1,
  });

  return [
    b('first', '🌱', 'İlk adım', 'İlk harcamanı kaydet.', n),
    b('streak7', '🔥', 'Bir hafta', '7 gün üst üste kayıt tut.', longest / 7),
    b('streak30', '🏅', 'Alışkanlık', '30 gün üst üste kayıt tut.', longest / 30),
    b('tx100', '💯', 'Yüzlük', '100 harcama kaydet.', n / 100),
    b('quiet10', '🧘', 'Sakin dönem', 'Bir dönemde 10 gün hiç harcama yapma.', maxQuiet / 10),
    b('under', '🛡️', 'Bütçe ustası', 'Bir dönemi gelirinin altında kapat.', underBudget ? 1 : 0),
    b('goal', '🎯', 'Hedef avcısı', 'Bir birikim hedefini tamamla.', goalsDone),
    b('challenge5', '🏆', 'Meydan okuyucu', '5 haftalık meydan okuma tamamla.', Number(challenges) / 5),
    b('together', '👥', 'Birlikte', 'Bir ortak bütçe alanına katıl.', Number(spaces)),
    b('debtfree', '🕊️', 'Borçsuz', 'Kaydettiğin tüm borçları kapat.', debts.length > 0 && debts.every((d) => d.balance <= 0) ? 1 : 0),
  ];
}
