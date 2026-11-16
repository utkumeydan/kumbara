import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { addDays, today } from '../lib/dates.js';
import { v } from '../lib/validate.js';

// Wrapped: bir dönemin hikâye kartları için özet sayılar
export const wrapped = new Hono<Env>().use(requireAuth).get('/wrapped', v('query', z.object({ cycleId: z.uuid().optional() })), async (c) => {
  const userId = c.get('userId');
  const { cycleId } = c.req.valid('query');
  const cycles = await db.select().from(t.cycles).where(eq(t.cycles.userId, userId)).orderBy(desc(t.cycles.startDate)).limit(24);
  // Varsayılan: içinde harcama olan son kapanan dönem, yoksa açık olan (dönemler arka planda boş da açılabilir)
  const used = new Set(
    (await db.selectDistinct({ cycleId: t.transactions.cycleId }).from(t.transactions).where(eq(t.transactions.userId, userId))).map((x) => x.cycleId),
  );
  const cycle = cycleId ? cycles.find((x) => x.id === cycleId) : (cycles.find((x) => x.closed && used.has(x.id)) ?? cycles[0]);
  if (!cycle) return c.json({ cycle: null, cycles: [] });

  const txs = await db
    .select({ amount: t.transactions.amount, note: t.transactions.note, spentOn: t.transactions.spentOn, envelopeId: t.transactions.envelopeId, name: t.envelopes.name, icon: t.envelopes.icon, color: t.envelopes.color })
    .from(t.transactions)
    .innerJoin(t.envelopes, eq(t.envelopes.id, t.transactions.envelopeId))
    .where(eq(t.transactions.cycleId, cycle.id));

  const total = txs.reduce((s, x) => s + x.amount, 0);
  const lastDay = cycle.endDate < today() ? cycle.endDate : today();
  const days: string[] = [];
  for (let d = cycle.startDate; d <= lastDay; d = addDays(d, 1)) days.push(d);

  const byDay = new Map<string, number>();
  const byEnv = new Map<string, { name: string; icon: string; color: string; spent: number; count: number }>();
  const byNote = new Map<string, { note: string; count: number; spent: number }>();
  for (const x of txs) {
    byDay.set(x.spentOn, (byDay.get(x.spentOn) ?? 0) + x.amount);
    const e = byEnv.get(x.envelopeId) ?? { name: x.name, icon: x.icon, color: x.color, spent: 0, count: 0 };
    e.spent += x.amount;
    e.count++;
    byEnv.set(x.envelopeId, e);
    const key = x.note.trim().toLocaleLowerCase('tr-TR');
    if (key) {
      const n = byNote.get(key) ?? { note: x.note.trim(), count: 0, spent: 0 };
      n.count++;
      n.spent += x.amount;
      byNote.set(key, n);
    }
  }

  // En uzun kayıt serisi ve harcamasız gün sayısı
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = byDay.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const noSpendDays = days.filter((d) => !byDay.has(d)).length;
  const biggestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const biggest = [...txs].sort((a, b) => b.amount - a.amount)[0];
  const [{ saved }] = await db
    .select({ saved: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
    .from(t.goalContributions)
    .where(eq(t.goalContributions.cycleId, cycle.id));

  const idx = cycles.findIndex((x) => x.id === cycle.id);
  const prev = cycles[idx + 1];
  const [{ prevTotal }] = prev
    ? await db.select({ prevTotal: sql<number>`coalesce(sum(${t.transactions.amount}),0)::int` }).from(t.transactions).where(and(eq(t.transactions.cycleId, prev.id)))
    : [{ prevTotal: 0 }];

  return c.json({
    cycle,
    cycles: cycles.map((x) => ({ id: x.id, startDate: x.startDate, endDate: x.endDate, closed: x.closed })),
    total,
    income: cycle.income,
    kept: cycle.income - total,
    saved: Number(saved),
    count: txs.length,
    days: days.length,
    avgDaily: Math.round(total / Math.max(1, days.length)),
    noSpendDays,
    longestStreak: longest,
    topEnvelopes: [...byEnv.values()].sort((a, b) => b.spent - a.spent).slice(0, 3),
    biggestDay: biggestDay ? { day: biggestDay[0], spent: biggestDay[1] } : null,
    biggestExpense: biggest ? { amount: biggest.amount, note: biggest.note, name: biggest.name, icon: biggest.icon, spentOn: biggest.spentOn } : null,
    topNote: [...byNote.values()].sort((a, b) => b.count - a.count || b.spent - a.spent)[0] ?? null,
    previousTotal: prev ? Number(prevTotal) : null,
  });
});
