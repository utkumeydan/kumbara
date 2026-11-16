import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { today } from '../lib/dates.js';
import { planDebts, syncMoney } from '../lib/money.js';
import { v } from '../lib/validate.js';
import { ownEnvelope, requireCycle } from './budget.js';

const money = z.number().int().min(0).max(1_000_000_000_00);
const body = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['card', 'loan', 'person', 'other']),
  balance: money,
  monthlyPayment: money,
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  interestRate: z.number().int().min(0).max(100_000).nullable().optional(),
  ratePeriod: z.enum(['monthly', 'yearly']).optional(),
  envelopeId: z.uuid().nullable().optional(),
});

async function ownDebt(userId: string, id: string) {
  const [d] = await db.select().from(t.debts).where(and(eq(t.debts.id, id), eq(t.debts.userId, userId)));
  if (!d) throw new HTTPException(404, { message: 'Borç bulunamadı' });
  return d;
}

export const debts = new Hono<Env>()
  .use(requireAuth)
  .get('/debts', async (c) => {
    const userId = c.get('userId');
    await syncMoney(userId);
    const rows = await db.select().from(t.debts).where(eq(t.debts.userId, userId)).orderBy(asc(t.debts.createdAt));
    // Son ödemeler (borç detayında gösterilir)
    const payments = rows.length
      ? await db
          .select({ id: t.transactions.id, debtId: t.transactions.debtId, amount: t.transactions.amount, spentOn: t.transactions.spentOn })
          .from(t.transactions)
          .where(and(eq(t.transactions.userId, userId), sql`${t.transactions.debtId} is not null`))
      : [];
    const plans = await planDebts(userId, rows);
    return c.json(plans.map((d) => ({ ...d, payments: payments.filter((p) => p.debtId === d.id).sort((a, b) => b.spentOn.localeCompare(a.spentOn)).slice(0, 12) })));
  })
  .post('/debts', v('json', body), async (c) => {
    const userId = c.get('userId');
    const data = c.req.valid('json');
    if (data.envelopeId) await ownEnvelope(userId, data.envelopeId);
    const [d] = await db.insert(t.debts).values({ ...data, userId }).returning();
    return c.json(d);
  })
  .patch('/debts/:id', v('json', body.partial()), async (c) => {
    const userId = c.get('userId');
    const data = c.req.valid('json');
    if (data.envelopeId) await ownEnvelope(userId, data.envelopeId);
    const debt = await ownDebt(userId, c.req.param('id'));
    // Banka durumundan gelen borçlarda ad, tür ve bakiye oradan yönetilir
    if (debt.accountId || debt.scheduleSource) {
      delete data.name;
      delete data.type;
      delete data.balance;
      if (debt.scheduleSource) delete data.monthlyPayment;
    }
    const [d] = await db.update(t.debts).set(data).where(eq(t.debts.id, c.req.param('id'))).returning();
    return c.json(d);
  })
  .delete('/debts/:id', async (c) => {
    const debt = await ownDebt(c.get('userId'), c.req.param('id'));
    if (debt.accountId || debt.scheduleSource) throw new HTTPException(400, { message: 'Bu borç Banka durumundan geliyor; oradan güncelle ya da sil' });
    await db.delete(t.debts).where(and(eq(t.debts.id, c.req.param('id')), eq(t.debts.userId, c.get('userId'))));
    return c.json({ ok: true });
  })
  // Ödeme: seçilen zarftan harcama olarak düşer ve borç bakiyesini azaltır
  .post('/debts/:id/pay', v('json', z.object({ amount: money.min(1), envelopeId: z.uuid().optional() })), async (c) => {
    const userId = c.get('userId');
    const debt = await ownDebt(userId, c.req.param('id'));
    if (debt.accountId || debt.scheduleSource) throw new HTTPException(400, { message: 'Bu borcun ödemesini Banka durumundan işaretle' });
    const { amount, envelopeId: chosen } = c.req.valid('json');
    const envelopeId = chosen ?? debt.envelopeId;
    if (!envelopeId) throw new HTTPException(400, { message: 'Ödeme için bir zarf seçin' });
    await ownEnvelope(userId, envelopeId);
    const cycle = await requireCycle(userId);
    const pay = Math.min(amount, debt.balance);
    if (pay <= 0) throw new HTTPException(400, { message: 'Bu borç zaten kapanmış' });
    await db.transaction(async (tx) => {
      await tx.insert(t.transactions).values({
        userId,
        envelopeId,
        cycleId: cycle.id,
        amount: pay,
        note: `Borç ödemesi: ${debt.name}`,
        spentOn: today(),
        debtId: debt.id,
        createdBy: c.get('actorId'),
      });
      await tx.update(t.debts).set({ balance: debt.balance - pay }).where(eq(t.debts.id, debt.id));
    });
    return c.json({ ok: true, paid: pay });
  });
