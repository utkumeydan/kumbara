import { v } from '../lib/validate.js';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { currentCycle, envelopeBalances, getUser } from '../lib/budget.js';
import { budgetHasPlus } from '../lib/plan.js';
import { addDays, cycleRange, daysBetween, today } from '../lib/dates.js';

const money = z.number().int().min(1).max(1_000_000_000_00);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Hedefin tahmini bitiş tarihi ve hedef tarihe yetişmek için maaş başına gereken tutar
function projectGoal(
  goal: typeof t.goals.$inferSelect,
  saved: number,
  firstOn: string | null,
  paydayDay: number,
) {
  const remaining = Math.max(0, goal.target - saved);
  const now = today();
  let projectedDate: string | null = null;
  if (remaining === 0) projectedDate = now;
  else if (saved > 0 && firstOn) {
    const days = Math.max(1, daysBetween(firstOn, now) + 1);
    const perDay = saved / Math.max(days, 30);
    projectedDate = addDays(now, Math.ceil(remaining / perDay));
  }
  let perPaycheck: number | null = null;
  if (goal.deadline && remaining > 0) {
    let paychecks = 0;
    let cursor = cycleRange(now, paydayDay).end;
    while (cursor < goal.deadline && paychecks < 600) {
      paychecks++;
      cursor = cycleRange(addDays(cursor, 1), paydayDay).end;
    }
    perPaycheck = Math.ceil(remaining / Math.max(1, paychecks));
  }
  return { saved, remaining, projectedDate, perPaycheck, done: remaining === 0 };
}

async function ownGoal(userId: string, id: string) {
  const [g] = await db
    .select()
    .from(t.goals)
    .where(and(eq(t.goals.id, id), eq(t.goals.userId, userId)));
  if (!g) throw new HTTPException(404, { message: 'Hedef bulunamadı' });
  return g;
}

export const insights = new Hono<Env>()
  .use(requireAuth)

  .get('/goals', async (c) => {
    const userId = c.get('userId');
    const user = await getUser(userId);
    const goals = await db.select().from(t.goals).where(eq(t.goals.userId, userId)).orderBy(asc(t.goals.createdAt));
    const sums = await db
      .select({
        goalId: t.goalContributions.goalId,
        saved: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int`,
        firstOn: sql<string>`min(${t.goalContributions.contributedOn})::text`,
      })
      .from(t.goalContributions)
      .innerJoin(t.goals, eq(t.goals.id, t.goalContributions.goalId))
      .where(eq(t.goals.userId, userId))
      .groupBy(t.goalContributions.goalId);
    const m = new Map(sums.map((s) => [s.goalId, s]));
    // Bu dönem gelirden hedefe ayrılan tutar (yeniden doldurma ekranı için)
    const cycle = await currentCycle(userId);
    const funded = cycle
      ? await db
          .select({ goalId: t.goalContributions.goalId, total: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
          .from(t.goalContributions)
          .where(and(eq(t.goalContributions.cycleId, cycle.id), isNull(t.goalContributions.sourceEnvelopeId)))
          .groupBy(t.goalContributions.goalId)
      : [];
    const f = new Map(funded.map((r) => [r.goalId, Number(r.total)]));
    const photos = goals.length ? await db.select({ goalId: t.goalPhotos.goalId }).from(t.goalPhotos).where(inArray(t.goalPhotos.goalId, goals.map((g) => g.id))) : [];
    const withPhoto = new Set(photos.map((p) => p.goalId));
    return c.json(
      goals.map((g) => ({
        ...g,
        hasPhoto: withPhoto.has(g.id),
        fundedThisCycle: f.get(g.id) ?? 0,
        ...projectGoal(g, Number(m.get(g.id)?.saved ?? 0), m.get(g.id)?.firstOn ?? null, user.paydayDay),
      })),
    );
  })
  .post(
    '/goals',
    v(
      'json',
      z.object({ name: z.string().min(1).max(60), target: money, color: z.string(), icon: z.string().max(8).optional(), deadline: isoDate.nullable().optional(), plannedAmount: z.number().int().min(0).optional() }),
    ),
    async (c) => {
      const [g] = await db
        .insert(t.goals)
        .values({ ...c.req.valid('json'), userId: c.get('userId') })
        .returning();
      return c.json(g);
    },
  )
  .patch(
    '/goals/:id',
    v(
      'json',
      z.object({ name: z.string().min(1).max(60).optional(), target: money.optional(), color: z.string().optional(), icon: z.string().max(8).optional(), deadline: isoDate.nullable().optional(), plannedAmount: z.number().int().min(0).optional() }),
    ),
    async (c) => {
      await ownGoal(c.get('userId'), c.req.param('id'));
      const [g] = await db.update(t.goals).set(c.req.valid('json')).where(eq(t.goals.id, c.req.param('id'))).returning();
      return c.json(g);
    },
  )
  .delete('/goals/:id', async (c) => {
    await ownGoal(c.get('userId'), c.req.param('id'));
    await db.delete(t.goals).where(eq(t.goals.id, c.req.param('id')));
    return c.json({ ok: true });
  })
  // Hedefe para koy (pozitif) ya da çek (negatif). envelopeId verilirse para o zarftan gelir/oraya döner,
  // verilmezse dağıtılmamış gelirden gelir/oraya döner. Böylece hedefe konan para bütçeden düşer.
  .post(
    '/goals/:id/contribute',
    v('json', z.object({ amount: z.number().int().refine((n) => n !== 0), envelopeId: z.uuid().nullable().optional() })),
    async (c) => {
      const userId = c.get('userId');
      const goal = await ownGoal(userId, c.req.param('id'));
      const { amount, envelopeId } = c.req.valid('json');
      const cycle = await currentCycle(userId);
      const [{ saved }] = await db
        .select({ saved: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
        .from(t.goalContributions)
        .where(eq(t.goalContributions.goalId, goal.id));
      if (amount < 0 && -amount > Number(saved)) throw new HTTPException(400, { message: 'Hedefte bu kadar para yok' });

      if (cycle && envelopeId) {
        const env = (await envelopeBalances(userId, cycle.id)).find((e) => e.id === envelopeId);
        if (!env) throw new HTTPException(404, { message: 'Zarf bulunamadı' });
        if (amount > 0 && amount > env.remaining) throw new HTTPException(400, { message: `${env.name} zarfında bu kadar para yok` });
      }
      // Kaynak seçilmezse para doğrudan birikime eklenir (bütçe dağıtımı yok)

      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(t.goalContributions)
          .values({ goalId: goal.id, cycleId: cycle?.id ?? null, sourceEnvelopeId: cycle ? (envelopeId ?? null) : null, amount, contributedOn: today() })
          .returning();
        if (cycle && envelopeId) {
          await tx.insert(t.allocations).values({ cycleId: cycle.id, envelopeId, amount: -amount, kind: 'transfer' });
        }
        return r;
      });
      return c.json(row);
    },
  )

  // Dönem özeti: zarf bazında harcama, günlük seri, önceki dönemlerle karşılaştırma
  .get('/stats', v('query', z.object({ cycleId: z.uuid().optional() })), async (c) => {
    const userId = c.get('userId');
    const { cycleId } = c.req.valid('query');
    const cycles = await db
      .select()
      .from(t.cycles)
      .where(eq(t.cycles.userId, userId))
      .orderBy(desc(t.cycles.startDate))
      .limit(12);
    const cycle = cycleId ? cycles.find((x) => x.id === cycleId) : (await currentCycle(userId)) ?? cycles[0];
    if (!cycle) return c.json({ cycle: null, total: 0, avgDaily: 0, byEnvelope: [], daily: [], history: [], insights: [], locked: false });

    const byEnvelope = (
      await db
        .select({
          envelopeId: t.envelopes.id,
          name: t.envelopes.name,
          color: t.envelopes.color,
          icon: t.envelopes.icon,
          spent: sql<number>`coalesce(sum(${t.transactions.amount}),0)::int`,
        })
        .from(t.transactions)
        .innerJoin(t.envelopes, eq(t.envelopes.id, t.transactions.envelopeId))
        .where(eq(t.transactions.cycleId, cycle.id))
        .groupBy(t.envelopes.id)
    )
      .map((r) => ({ ...r, spent: Number(r.spent) }))
      .sort((a, b) => b.spent - a.spent);

    const dailyRows = await db
      .select({ day: sql<string>`${t.transactions.spentOn}::text`, spent: sql<number>`sum(${t.transactions.amount})::int` })
      .from(t.transactions)
      .where(eq(t.transactions.cycleId, cycle.id))
      .groupBy(t.transactions.spentOn);
    const dm = new Map(dailyRows.map((r) => [r.day, Number(r.spent)]));
    // Grafik tüm dönemi gösterir; ortalama yalnızca bugüne kadarki günlerden hesaplanır
    const daily: { day: string; spent: number }[] = [];
    for (let d = cycle.startDate; d <= cycle.endDate; d = addDays(d, 1)) daily.push({ day: d, spent: dm.get(d) ?? 0 });
    const elapsed = daily.filter((d) => d.day <= today());

    const totals = await db
      .select({ cycleId: t.transactions.cycleId, spent: sql<number>`sum(${t.transactions.amount})::int` })
      .from(t.transactions)
      .where(eq(t.transactions.userId, userId))
      .groupBy(t.transactions.cycleId);
    const tm = new Map(totals.map((r) => [r.cycleId, Number(r.spent)]));
    const history = cycles
      .map((x) => ({ id: x.id, startDate: x.startDate, endDate: x.endDate, income: x.income, spent: tm.get(x.id) ?? 0 }))
      .reverse();

    // Sade dille özet cümleleri
    const total = byEnvelope.reduce((s, r) => s + r.spent, 0);
    const insightsList: string[] = [];
    const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
    if (total > 0) {
      const top = byEnvelope[0];
      insightsList.push(`En çok ${top.icon} ${top.name} zarfına harcadın: ${tl(top.spent)} (%${Math.round((top.spent / total) * 100)}).`);
      const avg = Math.round(total / Math.max(1, elapsed.length));
      insightsList.push(`Bu dönemde günde ortalama ${tl(avg)} harcıyorsun.`);
      const noSpend = elapsed.filter((d) => d.spent === 0).length;
      if (noSpend > 0) insightsList.push(`${noSpend} gün hiç harcama yapmadın. 👏`);
      const idx = cycles.findIndex((x) => x.id === cycle.id);
      const prev = cycles[idx + 1];
      if (prev && tm.get(prev.id)) {
        const p = tm.get(prev.id)!;
        const diff = Math.round(((total - p) / p) * 100);
        insightsList.push(
          diff <= 0 ? `Önceki döneme göre %${Math.abs(diff)} daha az harcadın.` : `Önceki döneme göre %${diff} daha fazla harcadın.`,
        );
      }
      if (cycle.income > 0) {
        const rate = Math.round(((cycle.income - total) / cycle.income) * 100);
        insightsList.push(`Gelirinin %${Math.max(0, rate)}'i şu an harcanmamış durumda.`);
      }
    } else {
      insightsList.push('Bu dönemde henüz harcama yok.');
    }

    const avgDaily = Math.round(total / Math.max(1, elapsed.length));
    // Kategori dağılımı ve dönem karşılaştırması Kumbara+ ile açılır
    const plus = await budgetHasPlus(userId);
    return c.json({
      cycle,
      total,
      avgDaily,
      daily,
      insights: insightsList,
      locked: !plus,
      byEnvelope: plus ? byEnvelope : [],
      history: plus ? history : history.map((h) => ({ ...h, spent: 0, income: 0 })),
    });
  });
