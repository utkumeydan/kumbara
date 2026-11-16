import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { addDays, today } from './dates.js';

export const CHALLENGE_XP = 50;

export type Challenge = {
  code: string;
  title: string;
  description: string;
  progress: number;
  current: number;
  target: number;
  unit: 'gün' | 'kuruş';
  done: boolean;
  failed: boolean;
};

// Pazartesi başlangıçlı hafta
export function weekStart(day: string) {
  const dow = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

function weekNumber(monday: string) {
  return Math.floor(Date.parse(monday) / (7 * 86_400_000));
}

const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

// Bir haftanın üç meydan okuması ve ilerlemesi. Son haftadaki harcama alışkanlığına göre kişiselleşir.
export async function evaluateWeek(userId: string, monday: string, isCurrent: boolean): Promise<Challenge[]> {
  const sunday = addDays(monday, 6);
  const now = today();
  const lastDay = isCurrent ? now : sunday;
  const txs = await db
    .select({ amount: t.transactions.amount, spentOn: t.transactions.spentOn, envelopeId: t.transactions.envelopeId })
    .from(t.transactions)
    .where(and(eq(t.transactions.userId, userId), gte(t.transactions.spentOn, addDays(monday, -56)), lt(t.transactions.spentOn, addDays(sunday, 1))));
  const week = txs.filter((x) => x.spentOn >= monday);
  const history = txs.filter((x) => x.spentOn < monday);
  const days = new Set(week.map((x) => x.spentOn));
  const elapsed: string[] = [];
  for (let d = monday; d <= lastDay; d = addDays(d, 1)) elapsed.push(d);
  const out: Challenge[] = [];

  out.push({
    code: 'log7',
    title: 'Her gün kayıt',
    description: 'Bu hafta 7 günün hepsinde en az bir harcama kaydet.',
    current: days.size,
    target: 7,
    progress: days.size / 7,
    unit: 'gün',
    done: days.size >= 7,
    failed: elapsed.some((d) => d < now && !days.has(d)),
  });

  if (weekNumber(monday) % 2 === 0) {
    // Bugün henüz bitmediği için harcamasız günlere sayılmaz
    const quiet = elapsed.filter((d) => (d < now || !isCurrent) && !days.has(d)).length;
    out.push({
      code: 'nospend3',
      title: 'Harcamasız 3 gün',
      description: 'Bu hafta en az 3 gün hiç harcama yapma.',
      current: quiet,
      target: 3,
      progress: Math.min(1, quiet / 3),
      unit: 'gün',
      done: quiet >= 3,
      failed: false,
    });
  } else {
    const target = 500_00;
    const [{ saved }] = await db
      .select({ saved: sql<number>`coalesce(sum(${t.goalContributions.amount}) filter (where ${t.goalContributions.amount} > 0),0)::int` })
      .from(t.goalContributions)
      .innerJoin(t.goals, eq(t.goals.id, t.goalContributions.goalId))
      .where(and(eq(t.goals.userId, userId), gte(t.goalContributions.contributedOn, monday), lt(t.goalContributions.contributedOn, addDays(sunday, 1))));
    out.push({
      code: 'save500',
      title: `Hedefine ${tl(target)} koy`,
      description: 'Bu hafta birikim hedeflerine toplam en az ₺500 ayır.',
      current: Number(saved),
      target,
      progress: Math.min(1, Number(saved) / target),
      unit: 'kuruş',
      done: Number(saved) >= target,
      failed: false,
    });
  }

  // En çok harcanan değişken zarf için son 8 haftanın ortalamasının %85'i
  const envs = await db.select().from(t.envelopes).where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.kind, 'variable'), eq(t.envelopes.archived, false)));
  const avg = envs
    .map((e) => ({ e, weekly: history.filter((x) => x.envelopeId === e.id).reduce((s, x) => s + x.amount, 0) / 8 }))
    .filter((x) => x.weekly >= 100_00)
    .sort((a, b) => b.weekly - a.weekly)[0];
  if (avg) {
    const target = Math.max(100_00, Math.round((avg.weekly * 0.85) / 100_00) * 100_00);
    const spent = week.filter((x) => x.envelopeId === avg.e.id).reduce((s, x) => s + x.amount, 0);
    out.push({
      code: `cap:${avg.e.id}`,
      title: `${avg.e.icon} ${avg.e.name} için ${tl(target)} altında kal`,
      description: `Genelde haftada ${tl(avg.weekly)} harcıyorsun. Bu hafta %15 daha az dene.`,
      current: spent,
      target,
      progress: Math.min(1, spent / target),
      unit: 'kuruş',
      done: !isCurrent && spent <= target,
      failed: spent > target,
    });
  }
  return out;
}

// Bu haftanın ve geçen haftanın meydan okumalarını değerlendirir, tamamlananları kaydeder
export async function weeklyChallenges(userId: string) {
  const monday = weekStart(today());
  const prevMonday = addDays(monday, -7);
  const [current, previous] = await Promise.all([evaluateWeek(userId, monday, true), evaluateWeek(userId, prevMonday, false)]);
  const rows = [
    ...current.filter((x) => x.done).map((x) => ({ userId, weekStart: monday, code: x.code })),
    ...previous.filter((x) => x.done).map((x) => ({ userId, weekStart: prevMonday, code: x.code })),
  ];
  if (rows.length) await db.insert(t.challengeCompletions).values(rows).onConflictDoNothing();
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(t.challengeCompletions).where(eq(t.challengeCompletions.userId, userId));
  return { weekStart: monday, weekEnd: addDays(monday, 6), current, previous, completedTotal: Number(total) };
}
