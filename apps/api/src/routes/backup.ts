import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { isMember, requireAuth, type Env } from '../lib/auth.js';
import { syncMoney } from '../lib/money.js';
import { v } from '../lib/validate.js';

const BACKUP_VERSION = 1;

async function ownGoal(userId: string, id: string) {
  const [g] = await db.select({ id: t.goals.id }).from(t.goals).where(and(eq(t.goals.id, id), eq(t.goals.userId, userId)));
  if (!g) throw new HTTPException(404, { message: 'Hedef bulunamadı' });
}

export const backup = new Hono<Env>()
  .use(requireAuth)

  // Hedef fotoğrafı: istemci küçültülmüş JPEG'i base64 olarak gönderir
  .get('/goals/:id/photo', async (c) => {
    await ownGoal(c.get('userId'), c.req.param('id'));
    const [p] = await db.select().from(t.goalPhotos).where(eq(t.goalPhotos.goalId, c.req.param('id')));
    if (!p) throw new HTTPException(404, { message: 'Fotoğraf yok' });
    return c.json({ data: p.data, updatedAt: p.updatedAt });
  })
  .put('/goals/:id/photo', v('json', z.object({ data: z.string().min(100).max(700_000) })), async (c) => {
    await ownGoal(c.get('userId'), c.req.param('id'));
    const data = c.req.valid('json').data.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new HTTPException(400, { message: 'Geçersiz görsel' });
    await db
      .insert(t.goalPhotos)
      .values({ goalId: c.req.param('id'), data })
      .onConflictDoUpdate({ target: t.goalPhotos.goalId, set: { data, updatedAt: new Date() } });
    return c.json({ ok: true });
  })
  .delete('/goals/:id/photo', async (c) => {
    await ownGoal(c.get('userId'), c.req.param('id'));
    await db.delete(t.goalPhotos).where(eq(t.goalPhotos.goalId, c.req.param('id')));
    return c.json({ ok: true });
  })

  // Uygulamadan yedek: seçili bütçenin tüm verileri tek JSON dosyasında
  .get('/backup', async (c) => {
    const userId = c.get('userId');
    const [u] = await db.select().from(t.users).where(eq(t.users.id, userId));
    const [envelopes, cycles, goals, bills, debts, favorites, accounts, scheduledPayments] = await Promise.all([
      db.select().from(t.envelopes).where(eq(t.envelopes.userId, userId)),
      db.select().from(t.cycles).where(eq(t.cycles.userId, userId)),
      db.select().from(t.goals).where(eq(t.goals.userId, userId)),
      db.select().from(t.bills).where(eq(t.bills.userId, userId)),
      db.select().from(t.debts).where(eq(t.debts.userId, userId)),
      db.select().from(t.favorites).where(eq(t.favorites.userId, userId)),
      db.select().from(t.accounts).where(eq(t.accounts.userId, userId)),
      db.select().from(t.scheduledPayments).where(eq(t.scheduledPayments.userId, userId)),
    ]);
    const cycleIds = cycles.map((x) => x.id);
    const goalIds = goals.map((x) => x.id);
    const [allocations, transactions, incomes, contributions] = await Promise.all([
      cycleIds.length ? db.select().from(t.allocations).where(inArray(t.allocations.cycleId, cycleIds)) : [],
      db.select().from(t.transactions).where(eq(t.transactions.userId, userId)),
      db.select().from(t.incomes).where(eq(t.incomes.userId, userId)),
      goalIds.length ? db.select().from(t.goalContributions).where(inArray(t.goalContributions.goalId, goalIds)) : [],
    ]);
    c.header('Content-Disposition', `attachment; filename="kumbara-yedek-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json({
      app: 'kumbara',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: { paydayDay: u.paydayDay, income: u.income, rollover: u.rollover, currency: u.currency },
      envelopes,
      cycles,
      allocations,
      transactions,
      incomes,
      goals,
      goalContributions: contributions,
      bills,
      debts,
      favorites,
      accounts,
      scheduledPayments,
    });
  })

  // Yedekten geri yükleme: seçili bütçenin mevcut verileri silinir, yedekteki veriler yeni kimliklerle yazılır
  .post('/restore', v('json', z.object({ backup: z.record(z.string(), z.unknown()), confirm: z.literal(true) })), async (c) => {
    const userId = c.get('userId');
    // Ortak alanın tüm verisini sildiği için yalnızca alan sahibi geri yükleyebilir
    if (userId !== c.get('actorId') && (await isMember(userId, c.get('actorId')))?.role !== 'owner') throw new HTTPException(403, { message: 'Ortak alanı yalnızca sahibi geri yükleyebilir' });
    const b = c.req.valid('json').backup as Record<string, any>;
    if (b.app !== 'kumbara' || b.version !== BACKUP_VERSION) throw new HTTPException(400, { message: 'Bu dosya bir Kumbara yedeği değil' });
    const arr = (k: string) => (Array.isArray(b[k]) ? (b[k] as Record<string, any>[]) : []);
    const id = new Map<string, string>();
    const map = (old: string | null | undefined) => (old ? (id.get(old) ?? null) : null);
    const fresh = (old: string) => {
      const n = crypto.randomUUID();
      id.set(old, n);
      return n;
    };
    const date = (x: unknown) => (x ? new Date(String(x)) : undefined);

    const counts = await db.transaction(async (tx) => {
      // Silme sırası: önce bağımlılar (cascade ile çoğu kendiliğinden gider)
      await tx.delete(t.favorites).where(eq(t.favorites.userId, userId));
      await tx.delete(t.transactions).where(eq(t.transactions.userId, userId));
      await tx.delete(t.incomes).where(eq(t.incomes.userId, userId));
      await tx.delete(t.bills).where(eq(t.bills.userId, userId));
      await tx.delete(t.debts).where(eq(t.debts.userId, userId));
      await tx.delete(t.goals).where(eq(t.goals.userId, userId));
      await tx.delete(t.cycles).where(eq(t.cycles.userId, userId));
      await tx.delete(t.envelopes).where(eq(t.envelopes.userId, userId));
      await tx.delete(t.accounts).where(eq(t.accounts.userId, userId));
      await tx.delete(t.scheduledPayments).where(eq(t.scheduledPayments.userId, userId));

      const s = b.settings ?? {};
      await tx
        .update(t.users)
        .set({ paydayDay: Number(s.paydayDay) || 1, income: Number(s.income) || 0, rollover: s.rollover !== false })
        .where(eq(t.users.id, userId));

      const envs = arr('envelopes').map((e) => ({ id: fresh(e.id), userId, name: String(e.name), color: String(e.color), icon: String(e.icon ?? '💰'), plannedAmount: Number(e.plannedAmount) || 0, kind: e.kind === 'fixed' ? ('fixed' as const) : ('variable' as const), dueDay: e.dueDay ?? null, plannedFrom: e.plannedFrom ?? null, sort: Number(e.sort) || 0, archived: !!e.archived, createdAt: date(e.createdAt) }));
      if (envs.length) await tx.insert(t.envelopes).values(envs);
      const cycles = arr('cycles').map((x) => ({ id: fresh(x.id), userId, startDate: String(x.startDate), endDate: String(x.endDate), income: Number(x.income) || 0, closed: !!x.closed, createdAt: date(x.createdAt) }));
      if (cycles.length) await tx.insert(t.cycles).values(cycles);
      const allocs = arr('allocations')
        .filter((x) => map(x.cycleId) && map(x.envelopeId))
        .map((x) => ({ cycleId: map(x.cycleId)!, envelopeId: map(x.envelopeId)!, amount: Number(x.amount), kind: x.kind, createdAt: date(x.createdAt) }));
      for (let i = 0; i < allocs.length; i += 500) await tx.insert(t.allocations).values(allocs.slice(i, i + 500));
      const goals = arr('goals').map((g) => ({ id: fresh(g.id), userId, name: String(g.name), icon: String(g.icon ?? '🎯'), color: String(g.color), target: Number(g.target), deadline: g.deadline ?? null, plannedAmount: Number(g.plannedAmount) || 0, createdAt: date(g.createdAt) }));
      if (goals.length) await tx.insert(t.goals).values(goals);
      const contribs = arr('goalContributions')
        .filter((x) => map(x.goalId))
        .map((x) => ({ goalId: map(x.goalId)!, cycleId: map(x.cycleId), sourceEnvelopeId: map(x.sourceEnvelopeId), amount: Number(x.amount), contributedOn: String(x.contributedOn), createdAt: date(x.createdAt) }));
      if (contribs.length) await tx.insert(t.goalContributions).values(contribs);
      const bills = arr('bills').map((x) => ({ id: fresh(x.id), userId, envelopeId: map(x.envelopeId), name: String(x.name), amount: Number(x.amount), dueDay: Number(x.dueDay), installmentsTotal: x.installmentsTotal ?? null, installmentsPaid: Number(x.installmentsPaid) || 0, active: x.active !== false, createdAt: date(x.createdAt) }));
      if (bills.length) await tx.insert(t.bills).values(bills);
      // Banka durumundan türeyen borçlar geri yüklemeden sonra yeniden üretilir
      const debts = arr('debts').filter((x) => !x.accountId && !x.scheduleSource).map((x) => ({ id: fresh(x.id), userId, envelopeId: map(x.envelopeId), name: String(x.name), type: x.type, balance: Number(x.balance), monthlyPayment: Number(x.monthlyPayment) || 0, dueDay: x.dueDay ?? null, interestRate: x.interestRate ?? null, ratePeriod: x.ratePeriod === 'yearly' ? ('yearly' as const) : ('monthly' as const), createdAt: date(x.createdAt) }));
      if (debts.length) await tx.insert(t.debts).values(debts);
      const incomes = arr('incomes')
        .filter((x) => map(x.cycleId))
        .map((x) => ({ userId, cycleId: map(x.cycleId)!, amount: Number(x.amount), note: String(x.note ?? ''), receivedOn: String(x.receivedOn), createdAt: date(x.createdAt) }));
      if (incomes.length) await tx.insert(t.incomes).values(incomes);
      const txs = arr('transactions')
        .filter((x) => map(x.cycleId) && map(x.envelopeId))
        .map((x) => ({ userId, envelopeId: map(x.envelopeId)!, cycleId: map(x.cycleId)!, amount: Number(x.amount), note: String(x.note ?? ''), spentOn: String(x.spentOn), billId: map(x.billId), debtId: map(x.debtId), createdBy: c.get('actorId'), createdAt: date(x.createdAt) }));
      for (let i = 0; i < txs.length; i += 500) await tx.insert(t.transactions).values(txs.slice(i, i + 500));
      const favs = arr('favorites')
        .filter((x) => map(x.envelopeId))
        .map((x) => ({ userId, envelopeId: map(x.envelopeId)!, amount: Number(x.amount), note: String(x.note ?? '') }));
      if (favs.length) await tx.insert(t.favorites).values(favs);
      const kinds = ['bank', 'card', 'cash'] as const;
      const accounts = arr('accounts').map((x) => ({ userId, name: String(x.name), kind: kinds.includes(x.kind) ? (x.kind as (typeof kinds)[number]) : ('bank' as const), balance: Number(x.balance) || 0, creditLimit: x.creditLimit ?? null, pending: Number(x.pending) || 0, dueDate: x.dueDate ?? null, dueAmount: x.dueAmount ?? null, sort: Number(x.sort) || 0, updatedAt: date(x.updatedAt), createdAt: date(x.createdAt) }));
      if (accounts.length) await tx.insert(t.accounts).values(accounts);
      const scheduled = arr('scheduledPayments').map((x) => ({ userId, source: String(x.source), name: String(x.name), amount: Number(x.amount), dueDate: String(x.dueDate), paidAt: date(x.paidAt) ?? null, createdAt: date(x.createdAt) }));
      if (scheduled.length) await tx.insert(t.scheduledPayments).values(scheduled);
      return { envelopes: envs.length, cycles: cycles.length, transactions: txs.length, goals: goals.length, bills: bills.length, debts: debts.length };
    });
    await syncMoney(userId);
    return c.json({ ok: true, restored: counts });
  });
