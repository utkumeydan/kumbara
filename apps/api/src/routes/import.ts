import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { today } from '../lib/dates.js';
import { budgetHasPlus, requirePlus } from '../lib/plan.js';
import { v } from '../lib/validate.js';

const row = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().min(1).max(1_000_000_000_00),
  note: z.string().max(200).default(''),
  envelopeId: z.uuid(),
});

// CSV'den çözümlenmiş satırları toplu harcama olarak ekler. Bütçe dönemine düşmeyen ve
// aynı gün/tutar/notla zaten kayıtlı olan satırlar atlanır.
export const importer = new Hono<Env>().use(requireAuth).post('/import/transactions', v('json', z.object({ rows: z.array(row).min(1).max(2000) })), async (c) => {
  const userId = c.get('userId');
  requirePlus(await budgetHasPlus(userId), 'İçe aktarma');
  const { rows } = c.req.valid('json');

  const envs = await db.select({ id: t.envelopes.id }).from(t.envelopes).where(eq(t.envelopes.userId, userId));
  const own = new Set(envs.map((e) => e.id));
  const cycles = await db.select().from(t.cycles).where(eq(t.cycles.userId, userId));
  const open = cycles.find((x) => !x.closed);
  const existing = await db
    .select({ spentOn: t.transactions.spentOn, amount: t.transactions.amount, note: t.transactions.note })
    .from(t.transactions)
    .where(and(eq(t.transactions.userId, userId)));
  const seen = new Set(existing.map((x) => `${x.spentOn}|${x.amount}|${x.note.trim().toLowerCase()}`));

  const now = today();
  const values: (typeof t.transactions.$inferInsert)[] = [];
  const skipped = { noCycle: 0, duplicate: 0, badEnvelope: 0, future: 0 };
  for (const r of rows) {
    if (!own.has(r.envelopeId)) {
      skipped.badEnvelope++;
      continue;
    }
    if (r.date > now) {
      skipped.future++;
      continue;
    }
    const key = `${r.date}|${r.amount}|${r.note.trim().toLowerCase()}`;
    if (seen.has(key)) {
      skipped.duplicate++;
      continue;
    }
    const cycle = cycles.find((x) => x.startDate <= r.date && r.date <= x.endDate) ?? (open && r.date >= open.startDate ? open : undefined);
    if (!cycle) {
      skipped.noCycle++;
      continue;
    }
    seen.add(key);
    values.push({ userId, envelopeId: r.envelopeId, cycleId: cycle.id, amount: r.amount, note: r.note.trim(), spentOn: r.date, createdBy: c.get('actorId') });
  }
  for (let i = 0; i < values.length; i += 500) await db.insert(t.transactions).values(values.slice(i, i + 500));
  return c.json({ imported: values.length, skipped });
});
