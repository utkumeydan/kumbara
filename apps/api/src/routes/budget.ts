import { and, asc, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import {
  billsForCycle,
  currentCycle,
  cycleForDate,
  cycleInfo,
  debtsDue,
  envelopeBalances,
  fixedDue,
  getUser,
  goalFundingFromIncome,
  progress,
  streak,
  unassignedFor,
  weekActivity,
} from '../lib/budget.js';
import { addDays, cycleRange, today } from '../lib/dates.js';
import { expenseAlerts, notifySpace } from '../lib/alerts.js';
import { budgetHasPlus, FREE_ENVELOPES, requirePlus } from '../lib/plan.js';
import { v } from '../lib/validate.js';
import { applyAccountSpend, overdraftShare, planDebts, resetOverdraft, scheduledDue } from '../lib/money.js';

const money = z.number().int().min(0).max(1_000_000_000_00);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const envelopeKind = z.enum(['variable', 'fixed']);
const dueDay = z.number().int().min(1).max(31).nullable();

export async function ownEnvelope(userId: string, id: string) {
  const [e] = await db
    .select()
    .from(t.envelopes)
    .where(and(eq(t.envelopes.id, id), eq(t.envelopes.userId, userId)));
  if (!e) throw new HTTPException(404, { message: 'Zarf bulunamadı' });
  return e;
}

export async function ownAccount(userId: string, id: string) {
  const [a] = await db.select().from(t.accounts).where(and(eq(t.accounts.id, id), eq(t.accounts.userId, userId)));
  if (!a) throw new HTTPException(404, { message: 'Hesap bulunamadı' });
  return a;
}

// Bugünün dönemi; yoksa ya da bittiyse kendiliğinden açılır
export async function requireCycle(userId: string) {
  const c = await currentCycle(userId);
  if (c && c.endDate >= today()) return c;
  return cycleForDate(userId, today());
}

async function ownGoalIds(userId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db.select({ id: t.goals.id }).from(t.goals).where(eq(t.goals.userId, userId));
  const own = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !own.has(id))) throw new HTTPException(404, { message: 'Hedef bulunamadı' });
}

async function activeEnvelopeCount(userId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.envelopes)
    // Otomatik dağıtım zarfları sınıra sayılmaz
    .where(and(eq(t.envelopes.userId, userId), eq(t.envelopes.archived, false), isNull(t.envelopes.system)));
  return Number(n);
}

// Ücretsiz planda en fazla FREE_ENVELOPES aktif zarf olabilir
async function checkEnvelopeLimit(userId: string) {
  if ((await activeEnvelopeCount(userId)) >= FREE_ENVELOPES) {
    requirePlus(await budgetHasPlus(userId), `${FREE_ENVELOPES} zarftan fazlası`);
  }
}

const txSelect = {
  id: t.transactions.id,
  amount: t.transactions.amount,
  note: t.transactions.note,
  spentOn: t.transactions.spentOn,
  envelopeId: t.transactions.envelopeId,
  cycleId: t.transactions.cycleId,
  billId: t.transactions.billId,
  debtId: t.transactions.debtId,
  accountId: t.transactions.accountId,
  envelopeName: t.envelopes.name,
  envelopeColor: t.envelopes.color,
  envelopeIcon: t.envelopes.icon,
  createdBy: t.transactions.createdBy,
  createdByName: t.users.name,
};

const allocationBody = z.object({
  allocations: z.array(z.object({ envelopeId: z.uuid(), amount: money })),
  goals: z.array(z.object({ goalId: z.uuid(), amount: money })).optional(),
});

export const budget = new Hono<Env>()
  .use(requireAuth)

  // Ana ekran: kalan para, zarflar, yaklaşan ödemeler, seri ve seviye
  .get('/summary', async (c) => {
    const userId = c.get('userId');
    const actorId = c.get('actorId');
    const [owner, actor, cycle] = await Promise.all([getUser(userId), getUser(actorId), currentCycle(userId)]);
    const [envelopes, week, streakDays, prog, debts, plus, scheduled] = await Promise.all([
      envelopeBalances(userId, cycle?.id ?? null),
      weekActivity(userId),
      streak(userId),
      progress(userId),
      db.select().from(t.debts).where(eq(t.debts.userId, userId)),
      budgetHasPlus(userId),
      scheduledDue(userId),
    ]);
    const left = envelopes.reduce((s, e) => s + e.remaining, 0);
    const info = cycle ? cycleInfo(cycle) : null;
    const [bills, debtDue, goalFunding] = cycle
      ? await Promise.all([billsForCycle(userId, cycle), debtsDue(userId, cycle), goalFundingFromIncome(cycle.id)])
      : [[], [], 0];
    const assigned = envelopes.reduce((s, e) => s + e.assigned, 0);
    const plans = await planDebts(userId, debts);
    return c.json({
      user: {
        name: actor.name,
        avatar: actor.avatar,
        paydayDay: owner.paydayDay,
        currency: owner.currency,
        rollover: owner.rollover,
        autoAllocate: owner.autoAllocate,
        income: owner.income,
      },
      space: owner.kind === 'space' ? { id: owner.id, name: owner.name } : null,
      plus,
      envelopeLimit: plus ? null : FREE_ENVELOPES,
      cycle: cycle && info ? { ...cycle, ...info } : null,
      left,
      unassigned: cycle ? Math.max(0, cycle.income - assigned - goalFunding) : 0,
      week,
      debt: debts.length
        ? {
            total: debts.reduce((s, d) => s + d.balance, 0),
            payoffDate: plans.some((p) => !p.payoffDate) ? null : plans.map((p) => p.payoffDate!).sort().at(-1)!,
          }
        : null,
      perDay: info && info.daysLeft > 0 ? Math.floor(Math.max(0, left) / info.daysLeft) : 0,
      envelopes,
      billsDue: bills.filter((b) => b.dueDate && !b.paidThisCycle),
      fixedDue: cycle ? fixedDue(envelopes, cycle) : [],
      debtsDue: debtDue,
      scheduledDue: scheduled,
      // Maaşa kadar ödenecek taksit ve krediler düşüldükten sonra gerçekten serbest kalan
      // "Taksit ve krediler" zarfında ayrılmış para ödemeler için zaten bekliyor; ikinci kez düşülmez
      safeToSpend: left - Math.max(0, (scheduled?.total ?? 0) - Math.max(0, envelopes.find((e) => e.system === 'payments')?.remaining ?? 0)),
      streak: streakDays,
      progress: prog,
    });
  })

  // Bütçe ayarları (kişisel ya da ortak alan için)
  .patch(
    '/settings',
    v('json', z.object({ paydayDay: z.number().int().min(1).max(31).optional(), income: money.optional(), rollover: z.boolean().optional(), autoAllocate: z.boolean().optional() })),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const cycle = await currentCycle(userId);
      const u = await db.transaction(async (tx) => {
        const [u] = await tx.update(t.users).set(body).where(eq(t.users.id, userId)).returning();
        // Açık dönemin geliri = aylık gelir + bu dönem eklenen ek gelirler; her kayıtta yeniden hesaplanır
        if (cycle && body.income !== undefined) {
          const [{ extra }] = await tx
            .select({ extra: sql<number>`coalesce(sum(${t.incomes.amount}),0)::int` })
            .from(t.incomes)
            .where(eq(t.incomes.cycleId, cycle.id));
          await tx
            .update(t.cycles)
            .set({ income: body.income + Number(extra) })
            .where(eq(t.cycles.id, cycle.id));
        }
        return u;
      });
      return c.json({ paydayDay: u.paydayDay, income: u.income, rollover: u.rollover, autoAllocate: u.autoAllocate });
    },
  )

  // Maaş günü: mevcut dönemi kapat, artanı devret, yeni dönemi dağıtımlarla aç
  .post('/payday', v('json', allocationBody.extend({ income: money.optional(), rollover: z.boolean().optional() })), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const user = await getUser(userId);
    const prev = await currentCycle(userId);
    for (const a of body.allocations) await ownEnvelope(userId, a.envelopeId);
    await ownGoalIds(userId, (body.goals ?? []).map((g) => g.goalId));

    const now = today();
    if (prev && prev.startDate >= now) throw new HTTPException(409, { message: 'Bu dönem zaten bugün başladı. Dağıtımı düzenlemek için "Yeniden doldur"u kullan.' });
    let range = cycleRange(now, user.paydayDay);
    if (!prev) {
      // İlk dönem: geçmiş günler sayılmasın diye bugünden başlar
      range.start = now;
    } else if (prev.endDate >= now) {
      // Erken maaş: bugünden başlar, bir sonraki dönemin sonuna kadar sürer
      range = { start: now, end: cycleRange(addDays(prev.endDate, 1), user.paydayDay).end };
    } else if (range.start <= prev.endDate) {
      range.start = addDays(prev.endDate, 1);
    }
    const income = body.income ?? user.income;
    const goalTotal = (body.goals ?? []).reduce((s, g) => s + g.amount, 0);
    if (body.allocations.reduce((s, a) => s + a.amount, 0) + goalTotal > income) {
      throw new HTTPException(400, { message: 'Dağıtılan tutar gelirinden fazla olamaz' });
    }
    const rollover = body.rollover ?? user.rollover;
    const leftovers = prev && rollover ? await envelopeBalances(userId, prev.id) : [];

    const next = await db.transaction(async (tx) => {
      if (body.income !== undefined && body.income !== user.income) await tx.update(t.users).set({ income: body.income }).where(eq(t.users.id, userId));
      if (prev) await tx.update(t.cycles).set({ closed: true }).where(eq(t.cycles.id, prev.id));
      const [cy] = await tx.insert(t.cycles).values({ userId, startDate: range.start, endDate: range.end, income }).returning();
      const rows = [
        ...body.allocations.filter((a) => a.amount > 0).map((a) => ({ cycleId: cy.id, envelopeId: a.envelopeId, amount: a.amount, kind: 'payday' as const })),
        ...leftovers.filter((e) => e.remaining !== 0).map((e) => ({ cycleId: cy.id, envelopeId: e.id, amount: e.remaining, kind: 'rollover' as const })),
      ];
      if (rows.length) await tx.insert(t.allocations).values(rows);
      const goalRows = (body.goals ?? []).filter((g) => g.amount > 0).map((g) => ({ goalId: g.goalId, cycleId: cy.id, amount: g.amount, contributedOn: now }));
      if (goalRows.length) await tx.insert(t.goalContributions).values(goalRows);
      return cy;
    });
    return c.json(next);
  })

  // Dönem içinde zarflara ve hedeflere konan tutarları yeniden ayarla (hedef tutarlar verilir, fark kaydedilir)
  .put('/allocations', v('json', allocationBody.extend({ income: money.optional() })), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const cycle = await requireCycle(userId);
    const income = body.income ?? cycle.income;
    const current = await envelopeBalances(userId, cycle.id);
    const byId = new Map(current.map((e) => [e.id, e]));
    for (const a of body.allocations) if (!byId.has(a.envelopeId)) throw new HTTPException(404, { message: 'Zarf bulunamadı' });
    await ownGoalIds(userId, (body.goals ?? []).map((g) => g.goalId));

    // Hedeflerin bu dönem gelirden aldığı mevcut tutarlar
    const funded = await db
      .select({ goalId: t.goalContributions.goalId, total: sql<number>`coalesce(sum(${t.goalContributions.amount}),0)::int` })
      .from(t.goalContributions)
      .where(and(eq(t.goalContributions.cycleId, cycle.id), sql`${t.goalContributions.sourceEnvelopeId} is null`))
      .groupBy(t.goalContributions.goalId);
    const goalNow = new Map(funded.map((f) => [f.goalId, Number(f.total)]));

    // Esnek hesap payı serbest kalan paradır; zarflara konunca otomatik dağıtım onu küçültür, sınıra sayılmaz
    const envTarget = new Map(current.filter((e) => e.system !== 'overdraft').map((e) => [e.id, e.assigned]));
    for (const a of body.allocations) if (byId.get(a.envelopeId)!.system !== 'overdraft') envTarget.set(a.envelopeId, a.amount);
    const goalTarget = new Map(goalNow);
    for (const g of body.goals ?? []) goalTarget.set(g.goalId, g.amount);
    const total = [...envTarget.values(), ...goalTarget.values()].reduce((s, x) => s + x, 0);
    if (total > income) throw new HTTPException(400, { message: 'Dağıtılan tutar gelirinden fazla olamaz' });

    const rows = body.allocations
      .filter((a) => byId.get(a.envelopeId)!.system !== 'overdraft')
      .map((a) => ({ cycleId: cycle.id, envelopeId: a.envelopeId, amount: a.amount - byId.get(a.envelopeId)!.assigned, kind: 'adjust' as const }))
      .filter((r) => r.amount !== 0);
    const goalRows = (body.goals ?? [])
      .map((g) => ({ goalId: g.goalId, cycleId: cycle.id, amount: g.amount - (goalNow.get(g.goalId) ?? 0), contributedOn: today() }))
      .filter((r) => r.amount !== 0);
    await db.transaction(async (tx) => {
      if (rows.length) await tx.insert(t.allocations).values(rows);
      if (goalRows.length) await tx.insert(t.goalContributions).values(goalRows);
      if (income !== cycle.income) {
        await tx.update(t.cycles).set({ income }).where(eq(t.cycles.id, cycle.id));
        await tx.update(t.users).set({ income }).where(eq(t.users.id, userId));
      }
    });
    return c.json({ ok: true });
  })

  .get('/cycles', async (c) => {
    const rows = await db.select().from(t.cycles).where(eq(t.cycles.userId, c.get('userId'))).orderBy(desc(t.cycles.startDate)).limit(24);
    return c.json(rows);
  })

  // Ek gelir: dönemin gelirini artırır, dağıtılmamış paraya eklenir
  .get('/incomes', async (c) => {
    const cycle = await currentCycle(c.get('userId'));
    if (!cycle) return c.json([]);
    return c.json(await db.select().from(t.incomes).where(eq(t.incomes.cycleId, cycle.id)).orderBy(desc(t.incomes.createdAt)));
  })
  .post('/incomes', v('json', z.object({ amount: money.min(1), note: z.string().max(100).optional() })), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const cycle = await requireCycle(userId);
    const row = await db.transaction(async (tx) => {
      const [r] = await tx.insert(t.incomes).values({ userId, cycleId: cycle.id, amount: body.amount, note: body.note ?? '', receivedOn: today() }).returning();
      await tx.update(t.cycles).set({ income: sql`${t.cycles.income} + ${body.amount}` }).where(eq(t.cycles.id, cycle.id));
      return r;
    });
    return c.json(row);
  })
  .delete('/incomes/:id', async (c) => {
    const userId = c.get('userId');
    const [row] = await db.select().from(t.incomes).where(and(eq(t.incomes.id, c.req.param('id')), eq(t.incomes.userId, userId)));
    if (!row) throw new HTTPException(404, { message: 'Gelir bulunamadı' });
    const [cycle] = await db.select().from(t.cycles).where(eq(t.cycles.id, row.cycleId));
    // Esnek hesaba otomatik giden pay her seferinde yeniden hesaplandığı için serbest sayılır
    const odShare = cycle ? await overdraftShare(userId, cycle.id) : 0;
    if (cycle && !cycle.closed && (await unassignedFor(userId, cycle)) + odShare < row.amount) {
      throw new HTTPException(400, { message: 'Bu gelir zaten zarflara dağıtılmış. Önce dağıtımı azalt.' });
    }
    await db.transaction(async (tx) => {
      await tx.delete(t.incomes).where(eq(t.incomes.id, row.id));
      // Silinen gelirin esnek hesaba gitmiş kısmı geri alınır; kalan pay sonraki özetle yeniden hesaplanır
      if (odShare) await resetOverdraft(tx, userId, row.cycleId);
      await tx.update(t.cycles).set({ income: sql`${t.cycles.income} - ${row.amount}` }).where(eq(t.cycles.id, row.cycleId));
    });
    return c.json({ ok: true });
  })

  // Zarflar
  .get('/envelopes/archived', async (c) => {
    const rows = await db
      .select()
      .from(t.envelopes)
      .where(and(eq(t.envelopes.userId, c.get('userId')), eq(t.envelopes.archived, true)))
      .orderBy(asc(t.envelopes.name));
    return c.json(rows);
  })
  .post(
    '/envelopes',
    v(
      'json',
      z.object({
        name: z.string().min(1).max(40),
        color: z.string(),
        icon: z.string().max(8).optional(),
        plannedAmount: money.optional(),
        kind: envelopeKind.optional(),
        dueDay: dueDay.optional(),
        plannedFrom: isoDate.nullable().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      await checkEnvelopeLimit(userId);
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${t.envelopes.sort}),-1)::int` }).from(t.envelopes).where(eq(t.envelopes.userId, userId));
      const body = c.req.valid('json');
      const cycle = await currentCycle(userId);
      // Planlanan tutar, dağıtılmamış gelir yettiği kadar bu döneme hemen konur
      const funded = cycle && body.plannedAmount ? Math.min(body.plannedAmount, Math.max(0, await unassignedFor(userId, cycle))) : 0;
      const e = await db.transaction(async (tx) => {
        const [e] = await tx
          .insert(t.envelopes)
          .values({ ...body, userId, sort: Number(n) + 1 })
          .returning();
        if (cycle && funded > 0) await tx.insert(t.allocations).values({ cycleId: cycle.id, envelopeId: e.id, amount: funded, kind: 'adjust' });
        return e;
      });
      return c.json({ ...e, funded });
    },
  )
  .post('/envelopes/reorder', v('json', z.object({ ids: z.array(z.uuid()).max(200) })), async (c) => {
    const userId = c.get('userId');
    const { ids } = c.req.valid('json');
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(t.envelopes).set({ sort: i }).where(and(eq(t.envelopes.id, id), eq(t.envelopes.userId, userId)));
      }
    });
    return c.json({ ok: true });
  })
  .patch(
    '/envelopes/:id',
    v(
      'json',
      z.object({
        name: z.string().min(1).max(40).optional(),
        color: z.string().optional(),
        icon: z.string().max(8).optional(),
        plannedAmount: money.optional(),
        kind: envelopeKind.optional(),
        dueDay: dueDay.optional(),
        plannedFrom: isoDate.nullable().optional(),
        sort: z.number().int().optional(),
        archived: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      const env = await ownEnvelope(userId, c.req.param('id'));
      const body = c.req.valid('json');
      // Arşivden geri getirmek de zarf sınırına tabidir
      if (env.archived && body.archived === false) await checkEnvelopeLimit(userId);
      const [e] = await db.update(t.envelopes).set(body).where(eq(t.envelopes.id, env.id)).returning();
      return c.json(e);
    },
  )
  .delete('/envelopes/:id', async (c) => {
    const userId = c.get('userId');
    await ownEnvelope(userId, c.req.param('id'));
    // Geçmiş kayıtlar kaybolmasın diye silmek yerine arşivlenir
    await db.update(t.envelopes).set({ archived: true }).where(eq(t.envelopes.id, c.req.param('id')));
    return c.json({ ok: true });
  })
  .post('/envelopes/transfer', v('json', z.object({ fromId: z.uuid(), toId: z.uuid(), amount: money.min(1) })), async (c) => {
    const userId = c.get('userId');
    const { fromId, toId, amount } = c.req.valid('json');
    if (fromId === toId) throw new HTTPException(400, { message: 'Aynı zarfa aktarılamaz' });
    await ownEnvelope(userId, fromId);
    await ownEnvelope(userId, toId);
    const cycle = await requireCycle(userId);
    await db.insert(t.allocations).values([
      { cycleId: cycle.id, envelopeId: fromId, amount: -amount, kind: 'transfer' },
      { cycleId: cycle.id, envelopeId: toId, amount, kind: 'transfer' },
    ]);
    return c.json({ ok: true });
  })

  // Harcamalar
  .get(
    '/transactions',
    v(
      'query',
      z.object({
        q: z.string().max(100).optional(),
        envelopeId: z.uuid().optional(),
        cycleId: z.uuid().optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const like = f.q ? `%${f.q.replace(/[\\%_]/g, (m) => '\\' + m)}%` : null;
      const rows = await db
        .select(txSelect)
        .from(t.transactions)
        .innerJoin(t.envelopes, eq(t.envelopes.id, t.transactions.envelopeId))
        .leftJoin(t.users, eq(t.users.id, t.transactions.createdBy))
        .where(
          and(
            eq(t.transactions.userId, c.get('userId')),
            like ? ilike(t.transactions.note, like) : undefined,
            f.envelopeId ? eq(t.transactions.envelopeId, f.envelopeId) : undefined,
            f.cycleId ? eq(t.transactions.cycleId, f.cycleId) : undefined,
            f.from ? gte(t.transactions.spentOn, f.from) : undefined,
            f.to ? lte(t.transactions.spentOn, f.to) : undefined,
          ),
        )
        .orderBy(desc(t.transactions.spentOn), desc(t.transactions.createdAt))
        .limit(f.limit)
        .offset(f.offset);
      return c.json(rows);
    },
  )
  .get('/transactions/:id', async (c) => {
    const [row] = await db
      .select(txSelect)
      .from(t.transactions)
      .innerJoin(t.envelopes, eq(t.envelopes.id, t.transactions.envelopeId))
      .leftJoin(t.users, eq(t.users.id, t.transactions.createdBy))
      .where(and(eq(t.transactions.id, c.req.param('id')), eq(t.transactions.userId, c.get('userId'))));
    if (!row) throw new HTTPException(404, { message: 'Kayıt bulunamadı' });
    return c.json(row);
  })
  .post(
    '/transactions',
    v(
      'json',
      z.object({
        envelopeId: z.uuid(),
        amount: money.min(1),
        note: z.string().max(200).optional(),
        spentOn: isoDate.optional(),
        clientId: z.string().max(64).optional(),
        accountId: z.uuid().nullable().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      // Çevrimdışı kuyruğundan tekrar gelen kayıt yeniden yazılmaz
      if (body.clientId) {
        const [dup] = await db
          .select()
          .from(t.transactions)
          .where(and(eq(t.transactions.userId, userId), eq(t.transactions.clientId, body.clientId)));
        if (dup) return c.json({ ...dup, alerts: [] as string[] });
      }
      await ownEnvelope(userId, body.envelopeId);
      if (body.accountId) await ownAccount(userId, body.accountId);
      await requireCycle(userId);
      const spentOn = body.spentOn ?? today();
      const cycle = await cycleForDate(userId, spentOn);
      const [tx] = await db
        .insert(t.transactions)
        .values({ ...body, spentOn, userId, cycleId: cycle.id, createdBy: c.get('actorId') })
        .returning();
      await applyAccountSpend(userId, tx.accountId, tx.amount);
      // Uyarılar yalnızca açık dönem için hesaplanır
      const { alerts, envelope } = cycle.closed ? { alerts: [] as string[], envelope: undefined } : await expenseAlerts(userId, cycle, tx.envelopeId, tx.amount);
      if (userId !== c.get('actorId') && envelope) {
        notifySpace(userId, c.get('actorId'), { amount: tx.amount, envelopeName: envelope.name, envelopeIcon: envelope.icon, remaining: envelope.remaining, alerts }).catch((e) =>
          console.error('Ortak alan bildirimi gönderilemedi', e),
        );
      }
      return c.json({ ...tx, alerts });
    },
  )
  .patch(
    '/transactions/:id',
    v(
      'json',
      z.object({
        envelopeId: z.uuid().optional(),
        amount: money.min(1).optional(),
        note: z.string().max(200).optional(),
        spentOn: isoDate.optional(),
        accountId: z.uuid().nullable().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      if (body.envelopeId) await ownEnvelope(userId, body.envelopeId);
      if (body.accountId) await ownAccount(userId, body.accountId);
      const [before] = await db.select().from(t.transactions).where(and(eq(t.transactions.id, c.req.param('id')), eq(t.transactions.userId, userId)));
      const cycleId = body.spentOn ? (await cycleForDate(userId, body.spentOn)).id : undefined;
      const [tx] = await db
        .update(t.transactions)
        .set({ ...body, ...(cycleId ? { cycleId } : {}) })
        .where(and(eq(t.transactions.id, c.req.param('id')), eq(t.transactions.userId, userId)))
        .returning();
      if (!tx) throw new HTTPException(404, { message: 'Kayıt bulunamadı' });
      // Tutar ya da ödeme aracı değiştiyse eski etki geri alınır, yenisi uygulanır
      if (before && (before.accountId !== tx.accountId || before.amount !== tx.amount)) {
        await applyAccountSpend(userId, before.accountId, -before.amount);
        await applyAccountSpend(userId, tx.accountId, tx.amount);
      }
      return c.json(tx);
    },
  )
  .delete('/transactions/:id', async (c) => {
    const userId = c.get('userId');
    const [tx] = await db
      .delete(t.transactions)
      .where(and(eq(t.transactions.id, c.req.param('id')), eq(t.transactions.userId, userId)))
      .returning();
    if (!tx) throw new HTTPException(404, { message: 'Kayıt bulunamadı' });
    // Fatura ödemesi silinirse taksit sayacı, borç ödemesi silinirse bakiye geri alınır
    if (tx.billId) {
      await db
        .update(t.bills)
        .set({ installmentsPaid: sql`greatest(${t.bills.installmentsPaid} - 1, 0)`, active: true })
        .where(eq(t.bills.id, tx.billId));
    }
    if (tx.debtId) {
      await db.update(t.debts).set({ balance: sql`${t.debts.balance} + ${tx.amount}` }).where(eq(t.debts.id, tx.debtId));
    }
    await applyAccountSpend(userId, tx.accountId, -tx.amount);
    return c.json(tx);
  })

  // Tüm harcamalar CSV olarak
  .get('/export.csv', async (c) => {
    const rows = await db
      .select({ spentOn: t.transactions.spentOn, amount: t.transactions.amount, note: t.transactions.note, envelope: t.envelopes.name })
      .from(t.transactions)
      .innerJoin(t.envelopes, eq(t.envelopes.id, t.transactions.envelopeId))
      .where(eq(t.transactions.userId, c.get('userId')))
      .orderBy(desc(t.transactions.spentOn));
    // =, +, -, @ ile başlayan metin Excel'de formül olarak çalışmasın
    const esc = (x: string) => `"${(/^[=+\-@\t\r]/.test(x) ? `'${x}` : x).replace(/"/g, '""')}"`;
    const csv = ['Tarih,Zarf,Tutar,Not', ...rows.map((r) => [r.spentOn, esc(r.envelope), (r.amount / 100).toFixed(2), esc(r.note)].join(','))].join('\n');
    return c.body('﻿' + csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kumbara.csv"' });
  })

  // Faturalar ve taksitler
  .get('/bills', async (c) => {
    const userId = c.get('userId');
    const cycle = await currentCycle(userId);
    if (cycle) return c.json(await billsForCycle(userId, cycle));
    const rows = await db.select().from(t.bills).where(eq(t.bills.userId, userId)).orderBy(asc(t.bills.dueDay));
    return c.json(rows.map((b) => ({ ...b, dueDate: null, paidThisCycle: false })));
  })
  .post(
    '/bills',
    v(
      'json',
      z.object({
        name: z.string().min(1).max(60),
        amount: money.min(1),
        dueDay: z.number().int().min(1).max(31),
        envelopeId: z.uuid().nullable().optional(),
        installmentsTotal: z.number().int().min(1).max(360).nullable().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      if (body.envelopeId) await ownEnvelope(userId, body.envelopeId);
      const [b] = await db.insert(t.bills).values({ ...body, userId }).returning();
      return c.json(b);
    },
  )
  .patch(
    '/bills/:id',
    v(
      'json',
      z.object({
        name: z.string().min(1).max(60).optional(),
        amount: money.min(1).optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
        envelopeId: z.uuid().nullable().optional(),
        active: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      if (body.envelopeId) await ownEnvelope(userId, body.envelopeId);
      const [b] = await db
        .update(t.bills)
        .set(body)
        .where(and(eq(t.bills.id, c.req.param('id')), eq(t.bills.userId, userId)))
        .returning();
      if (!b) throw new HTTPException(404, { message: 'Fatura bulunamadı' });
      return c.json(b);
    },
  )
  .delete('/bills/:id', async (c) => {
    await db.delete(t.bills).where(and(eq(t.bills.id, c.req.param('id')), eq(t.bills.userId, c.get('userId'))));
    return c.json({ ok: true });
  })
  .post('/bills/:id/pay', v('json', z.object({ envelopeId: z.uuid().optional() })), async (c) => {
    const userId = c.get('userId');
    const [bill] = await db
      .select()
      .from(t.bills)
      .where(and(eq(t.bills.id, c.req.param('id')), eq(t.bills.userId, userId)));
    if (!bill) throw new HTTPException(404, { message: 'Fatura bulunamadı' });
    if (!bill.active) throw new HTTPException(409, { message: 'Bu taksit tamamlandı' });
    const envelopeId = c.req.valid('json').envelopeId ?? bill.envelopeId;
    if (!envelopeId) throw new HTTPException(400, { message: 'Ödeme için bir zarf seçin' });
    await ownEnvelope(userId, envelopeId);
    const cycle = await requireCycle(userId);
    const [already] = await db
      .select({ id: t.transactions.id })
      .from(t.transactions)
      .where(and(eq(t.transactions.cycleId, cycle.id), eq(t.transactions.billId, bill.id)));
    if (already) throw new HTTPException(409, { message: 'Bu fatura bu dönem zaten ödendi' });
    const paid = bill.installmentsPaid + 1;
    await db.transaction(async (tx) => {
      await tx.insert(t.transactions).values({
        userId,
        envelopeId,
        cycleId: cycle.id,
        amount: bill.amount,
        note: bill.installmentsTotal ? `${bill.name} (${paid}/${bill.installmentsTotal})` : bill.name,
        spentOn: today(),
        billId: bill.id,
        createdBy: c.get('actorId'),
      });
      await tx
        .update(t.bills)
        .set({ installmentsPaid: paid, active: bill.installmentsTotal ? paid < bill.installmentsTotal : true })
        .where(eq(t.bills.id, bill.id));
    });
    return c.json({ ok: true });
  });
