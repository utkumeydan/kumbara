import { and, asc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { currentCycle } from '../lib/budget.js';
import { addDays, today } from '../lib/dates.js';
import { accountAvailable, cashflow, groupByMonth, monthPlan, netHistory, planDebts, snapshotAccount, statementSource, syncMoney } from '../lib/money.js';
import { v } from '../lib/validate.js';
import { ownEnvelope, requireCycle } from './budget.js';

const amount = z.number().int().min(0).max(1_000_000_000_00);
const signed = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const accountBody = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['bank', 'card', 'cash']),
  balance: signed,
  creditLimit: amount.nullable().optional(),
  pending: amount.optional(),
  dueDate: isoDate.nullable().optional(),
  dueAmount: amount.nullable().optional(),
});

const paymentBody = z.object({
  source: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  amount: amount.min(1),
  dueDate: isoDate,
});

async function ownAccount(userId: string, id: string) {
  const [a] = await db.select().from(t.accounts).where(and(eq(t.accounts.id, id), eq(t.accounts.userId, userId)));
  if (!a) throw new HTTPException(404, { message: 'Hesap bulunamadı' });
  return a;
}

async function ownPayment(userId: string, id: string) {
  const [p] = await db.select().from(t.scheduledPayments).where(and(eq(t.scheduledPayments.id, id), eq(t.scheduledPayments.userId, userId)));
  if (!p) throw new HTTPException(404, { message: 'Ödeme bulunamadı' });
  return p;
}

export const money = new Hono<Env>()
  .use(requireAuth)

  // Banka durumu: hesaplar, toplamlar, ödeme takvimi, maaştan maaşa nakit akışı ve net durum geçmişi
  .get('/money', async (c) => {
    const userId = c.get('userId');
    // Eski kayıtlar ve tarihi geçen ekstreler için her açılışta eşitlenir
    await syncMoney(userId);
    const [accounts, unpaid, recentPaid, cycle, debts, flows, history] = await Promise.all([
      db.select().from(t.accounts).where(eq(t.accounts.userId, userId)).orderBy(asc(t.accounts.sort), asc(t.accounts.createdAt)),
      db
        .select()
        .from(t.scheduledPayments)
        .where(and(eq(t.scheduledPayments.userId, userId), isNull(t.scheduledPayments.paidAt)))
        .orderBy(asc(t.scheduledPayments.dueDate), asc(t.scheduledPayments.createdAt)),
      db
        .select()
        .from(t.scheduledPayments)
        .where(and(eq(t.scheduledPayments.userId, userId), isNotNull(t.scheduledPayments.paidAt), gte(t.scheduledPayments.dueDate, addDays(today(), -60))))
        .orderBy(asc(t.scheduledPayments.dueDate)),
      currentCycle(userId),
      db.select().from(t.debts).where(and(eq(t.debts.userId, userId), isNotNull(t.debts.accountId))),
      cashflow(userId),
      netHistory(userId),
    ]);
    const plans = await planDebts(userId, debts);
    const list = accounts.map((a) => {
      const d = plans.find((p) => p.accountId === a.id);
      // Faiz oranı Borçlarım'dan girilir; burada aylık tahmini maliyet gösterilir
      // Kartın kalan taksitleri de limiti bağlar; ayrı kaynakta tutuldukları için burada düşülür
      const installments = a.kind === 'card' ? unpaid.filter((p) => p.source.startsWith(`${a.name} `) && p.source !== statementSource(a.name)).reduce((s, p) => s + p.amount, 0) : 0;
      return { ...a, available: accountAvailable(a) - installments, debtId: d?.id ?? null, monthlyInterest: d && d.monthlyRate ? Math.round(d.balance * d.monthlyRate) : null, payoffDate: d?.payoffDate ?? null };
    });
    const now = today();
    const cycleEnd = cycle?.endDate ?? addDays(now, 30);
    const due = unpaid.filter((p) => p.dueDate <= cycleEnd);
    return c.json({
      accounts: list,
      totals: {
        // Hemen kullanılabilecek para (banka + esnek hesap + nakit)
        available: list.filter((a) => a.kind !== 'card').reduce((s, a) => s + a.available, 0),
        cardAvailable: list.filter((a) => a.kind === 'card').reduce((s, a) => s + a.available, 0),
        // Eksi bakiyeler ve provizyonlar: şu anki borç
        debt: list.reduce((s, a) => s + Math.max(0, -a.balance) + (a.kind === 'card' ? a.pending : 0), 0),
        net: list.reduce((s, a) => s + a.balance - (a.kind === 'card' ? a.pending : 0), 0),
        scheduled: unpaid.reduce((s, p) => s + p.amount, 0),
        monthlyInterest: list.reduce((s, a) => s + (a.monthlyInterest ?? 0), 0),
      },
      due: { until: cycleEnd, total: due.reduce((s, p) => s + p.amount, 0), overdue: unpaid.filter((p) => p.dueDate < now).length },
      months: groupByMonth(unpaid),
      sources: [...new Set(unpaid.map((p) => p.source))],
      recentPaid,
      cashflow: flows,
      history,
      // Haftada bir hatırlatma için: en eski güncelleme
      staleSince: list.length ? list.map((a) => a.updatedAt.toISOString()).sort()[0] : null,
    });
  })

  // Takvim ayına göre ödeme planı ve cebe kalan
  .get('/plan', v('query', z.object({ months: z.coerce.number().int().min(1).max(24).optional() })), async (c) => {
    const userId = c.get('userId');
    await syncMoney(userId);
    return c.json(await monthPlan(userId, c.req.valid('query').months ?? 12));
  })

  .post('/accounts', v('json', accountBody), async (c) => {
    const userId = c.get('userId');
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${t.accounts.sort}),-1)::int` }).from(t.accounts).where(eq(t.accounts.userId, userId));
    const [a] = await db
      .insert(t.accounts)
      .values({ ...c.req.valid('json'), userId, sort: Number(n) + 1 })
      .returning();
    await snapshotAccount(a);
    await syncMoney(userId);
    return c.json(a);
  })
  .patch('/accounts/:id', v('json', accountBody.partial()), async (c) => {
    const userId = c.get('userId');
    const a = await ownAccount(userId, c.req.param('id'));
    const [u] = await db
      .update(t.accounts)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      .where(eq(t.accounts.id, a.id))
      .returning();
    await snapshotAccount(u);
    await syncMoney(userId);
    return c.json(u);
  })
  .delete('/accounts/:id', async (c) => {
    const userId = c.get('userId');
    const a = await ownAccount(userId, c.req.param('id'));
    await db.delete(t.accounts).where(eq(t.accounts.id, a.id));
    await syncMoney(userId);
    return c.json({ ok: true });
  })

  // Toplu ekleme (yapıştırılan liste); aynı kaynak/ad/tarih/tutarla kayıtlı olanlar atlanır
  .post('/schedule', v('json', z.object({ items: z.array(paymentBody).min(1).max(500) })), async (c) => {
    const userId = c.get('userId');
    const { items } = c.req.valid('json');
    const existing = await db.select().from(t.scheduledPayments).where(eq(t.scheduledPayments.userId, userId));
    const key = (p: z.infer<typeof paymentBody>) => `${p.source.toLowerCase()}|${p.name.toLowerCase()}|${p.dueDate}|${p.amount}`;
    const seen = new Set(existing.map(key));
    const fresh = items.filter((p) => {
      const k = key(p);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length) await db.insert(t.scheduledPayments).values(fresh.map((p) => ({ ...p, userId })));
    await syncMoney(userId);
    return c.json({ added: fresh.length, skipped: items.length - fresh.length });
  })
  // Düzenleme ya da ödendi işareti; envelopeId verilirse ödeme o zarftan harcama olarak da kaydedilir
  .patch('/schedule/:id', v('json', paymentBody.partial().extend({ paid: z.boolean().optional(), envelopeId: z.uuid().optional() })), async (c) => {
    const userId = c.get('userId');
    const p = await ownPayment(userId, c.req.param('id'));
    const { paid, envelopeId, ...rest } = c.req.valid('json');
    const record = paid === true && !p.paidAt && !!envelopeId;
    if (record) await ownEnvelope(userId, envelopeId);
    const cycle = record ? await requireCycle(userId) : null;
    const u = await db.transaction(async (tx) => {
      let transactionId = p.transactionId;
      if (record && cycle) {
        const [txRow] = await tx
          .insert(t.transactions)
          .values({ userId, envelopeId, cycleId: cycle.id, amount: rest.amount ?? p.amount, note: p.name === p.source ? p.name : `${p.name} (${p.source})`, spentOn: today(), createdBy: c.get('actorId') })
          .returning();
        transactionId = txRow.id;
      }
      // Ödendi geri alınırsa kaydedilen harcama da silinir
      if (paid === false && p.transactionId) {
        await tx.delete(t.transactions).where(eq(t.transactions.id, p.transactionId));
        transactionId = null;
      }
      const [row] = await tx
        .update(t.scheduledPayments)
        .set({ ...rest, transactionId, ...(paid === undefined ? {} : { paidAt: paid ? (p.paidAt ?? new Date()) : null }) })
        .where(eq(t.scheduledPayments.id, p.id))
        .returning();
      return row;
    });
    await syncMoney(userId);
    return c.json(u);
  })
  .delete('/schedule/:id', async (c) => {
    const userId = c.get('userId');
    const p = await ownPayment(userId, c.req.param('id'));
    await db.delete(t.scheduledPayments).where(eq(t.scheduledPayments.id, p.id));
    await syncMoney(userId);
    return c.json({ ok: true });
  })
  // Bir kaynağın tüm ödenmemiş kayıtlarını siler (yanlış yapıştırmayı geri almak için)
  .delete('/schedule', v('query', z.object({ source: z.string().min(1) })), async (c) => {
    const userId = c.get('userId');
    const { source } = c.req.valid('query');
    const rows = await db
      .delete(t.scheduledPayments)
      .where(and(eq(t.scheduledPayments.userId, userId), eq(t.scheduledPayments.source, source), isNull(t.scheduledPayments.paidAt)))
      .returning({ id: t.scheduledPayments.id });
    await syncMoney(userId);
    return c.json({ deleted: rows.length });
  })
  // Bir kaynağın adını değiştirir (ör. iki kaynağı birleştirmek için)
  .post('/schedule/rename', v('json', z.object({ from: z.string().min(1), to: z.string().trim().min(1).max(60) })), async (c) => {
    const userId = c.get('userId');
    const { from, to } = c.req.valid('json');
    await db
      .update(t.scheduledPayments)
      .set({ source: to })
      .where(and(eq(t.scheduledPayments.userId, userId), eq(t.scheduledPayments.source, from)));
    // Adı kaynakla aynı olan kalemler de yeni adı alır
    await db
      .update(t.scheduledPayments)
      .set({ name: to })
      .where(and(eq(t.scheduledPayments.userId, userId), eq(t.scheduledPayments.source, to), eq(t.scheduledPayments.name, from)));
    await syncMoney(userId);
    return c.json({ ok: true });
  });
