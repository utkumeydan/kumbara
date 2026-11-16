import { randomInt } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { isMember, requireAuth, type Env } from '../lib/auth.js';
import { hasPlus, requirePlus } from '../lib/plan.js';
import { sendPush } from '../lib/push.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';
import { v } from '../lib/validate.js';

// Karıştırılabilecek harfler (0/O, 1/I) çıkarıldı
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

async function members(spaceId: string) {
  return db
    .select({ userId: t.users.id, name: t.users.name, avatar: t.users.avatar, role: t.spaceMembers.role, share: t.spaceMembers.share })
    .from(t.spaceMembers)
    .innerJoin(t.users, eq(t.users.id, t.spaceMembers.userId))
    .where(eq(t.spaceMembers.spaceId, spaceId));
}

async function requireMember(spaceId: string, userId: string) {
  const m = await isMember(spaceId, userId);
  if (!m) throw new HTTPException(404, { message: 'Alan bulunamadı' });
  return m;
}

// Birlikte: iki ya da daha fazla kişinin ortak zarf seti. Her kişinin kendi bütçesi ayrı ve gizli kalır.
export const spaces = new Hono<Env>()
  .use(requireAuth)
  .get('/spaces', async (c) => {
    const actorId = c.get('actorId');
    const rows = await db
      .select({ id: t.users.id, name: t.users.name, role: t.spaceMembers.role })
      .from(t.spaceMembers)
      .innerJoin(t.users, eq(t.users.id, t.spaceMembers.spaceId))
      .where(eq(t.spaceMembers.userId, actorId));
    return c.json(await Promise.all(rows.map(async (r) => ({ ...r, members: await members(r.id) }))));
  })
  .post('/spaces', v('json', z.object({ name: z.string().trim().min(1).max(40) })), async (c) => {
    const actorId = c.get('actorId');
    const [actor] = await db.select().from(t.users).where(eq(t.users.id, actorId));
    requirePlus(hasPlus(actor), 'Ortak alan açmak');
    const space = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(t.users)
        .values({ kind: 'space', email: `space-${crypto.randomUUID()}@spaces.kumbara.local`, name: c.req.valid('json').name, paydayDay: actor.paydayDay, timezone: actor.timezone })
        .returning();
      await tx.insert(t.spaceMembers).values({ spaceId: s.id, userId: actorId, role: 'owner' });
      return s;
    });
    return c.json({ id: space.id, name: space.name, role: 'owner' });
  })
  .patch('/spaces/:id', v('json', z.object({ name: z.string().trim().min(1).max(40) })), async (c) => {
    await requireMember(c.req.param('id'), c.get('actorId'));
    await db.update(t.users).set({ name: c.req.valid('json').name }).where(eq(t.users.id, c.req.param('id')));
    return c.json({ ok: true });
  })
  // 7 gün geçerli davet kodu
  .post('/spaces/:id/invites', async (c) => {
    const spaceId = c.req.param('id');
    await requireMember(spaceId, c.get('actorId'));
    const code = inviteCode();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    await db.insert(t.spaceInvites).values({ code, spaceId, createdBy: c.get('actorId'), expiresAt });
    return c.json({ code, expiresAt });
  })
  .post('/spaces/join', rateLimit('space-join', 10, 15 * 60_000, clientIp), v('json', z.object({ code: z.string().trim().toUpperCase() })), async (c) => {
    const actorId = c.get('actorId');
    const [inv] = await db
      .select()
      .from(t.spaceInvites)
      .where(and(eq(t.spaceInvites.code, c.req.valid('json').code), gt(t.spaceInvites.expiresAt, new Date())));
    if (!inv) throw new HTTPException(404, { message: 'Kod geçersiz ya da süresi dolmuş' });
    if (!(await isMember(inv.spaceId, actorId))) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.spaceMembers).where(eq(t.spaceMembers.spaceId, inv.spaceId));
      if (Number(n) >= 6) throw new HTTPException(409, { message: 'Bu alan dolu (en fazla 6 kişi)' });
      await db.insert(t.spaceMembers).values({ spaceId: inv.spaceId, userId: actorId, role: 'member' });
    }
    const [s] = await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.id, inv.spaceId));
    return c.json(s);
  })
  // Kendin ayrıl ya da (sahipsen) birini çıkar. Son kişi ayrılınca alan silinir.
  .delete('/spaces/:id/members/:userId', async (c) => {
    const spaceId = c.req.param('id');
    const target = c.req.param('userId');
    const me = await requireMember(spaceId, c.get('actorId'));
    if (target !== c.get('actorId') && me.role !== 'owner') throw new HTTPException(403, { message: 'Yalnızca alan sahibi üye çıkarabilir' });
    await db.delete(t.spaceMembers).where(and(eq(t.spaceMembers.spaceId, spaceId), eq(t.spaceMembers.userId, target)));
    // Çıkan kişi eldeki eski davet koduyla geri dönemesin
    await db.delete(t.spaceInvites).where(eq(t.spaceInvites.spaceId, spaceId));
    const rest = await members(spaceId);
    if (!rest.length) await db.delete(t.users).where(eq(t.users.id, spaceId));
    else if (!rest.some((m) => m.role === 'owner')) {
      await db.update(t.spaceMembers).set({ role: 'owner' }).where(and(eq(t.spaceMembers.spaceId, spaceId), eq(t.spaceMembers.userId, rest[0].userId)));
    }
    return c.json({ ok: true });
  })

  // Hesaplaşma: kim ne kadar ödedi, payına göre ne kadar düşüyordu, kim kime ne kadar borçlu
  .get('/spaces/:id/balances', async (c) => {
    const spaceId = c.req.param('id');
    await requireMember(spaceId, c.get('actorId'));
    return c.json(await balances(spaceId));
  })
  .post('/spaces/:id/settlements', v('json', z.object({ toUserId: z.uuid(), amount: z.number().int().min(1).max(1_000_000_000_00) })), async (c) => {
    const spaceId = c.req.param('id');
    const actorId = c.get('actorId');
    await requireMember(spaceId, actorId);
    const { toUserId, amount } = c.req.valid('json');
    if (toUserId === actorId) throw new HTTPException(400, { message: 'Kendine ödeme yapamazsın' });
    if (!(await isMember(spaceId, toUserId))) throw new HTTPException(404, { message: 'Bu kişi alanda değil' });
    await db.insert(t.spaceSettlements).values({ spaceId, fromUserId: actorId, toUserId, amount });
    const [from] = await db.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, actorId));
    await sendPush([toUserId], { title: 'Hesaplaşma', body: `${from?.name ?? 'Biri'} sana ${(amount / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })} ödediğini işaretledi.`, data: { url: '/settle', spaceId } });
    return c.json(await balances(spaceId));
  })
  // Paylar yüzde olarak verilir ve toplamı 100 olmalı; boş bırakılırsa eşit bölünür
  .patch('/spaces/:id/shares', v('json', z.object({ shares: z.array(z.object({ userId: z.uuid(), share: z.number().int().min(0).max(100) })).nullable() })), async (c) => {
    const spaceId = c.req.param('id');
    await requireMember(spaceId, c.get('actorId'));
    const { shares } = c.req.valid('json');
    const list = await members(spaceId);
    if (shares) {
      if (shares.length !== list.length || !list.every((m) => shares.some((s) => s.userId === m.userId))) throw new HTTPException(400, { message: 'Her üye için bir pay girilmeli' });
      if (shares.reduce((s, x) => s + x.share, 0) !== 100) throw new HTTPException(400, { message: 'Payların toplamı %100 olmalı' });
    }
    await db.transaction(async (tx) => {
      for (const m of list) {
        const share = shares ? shares.find((s) => s.userId === m.userId)!.share : null;
        await tx.update(t.spaceMembers).set({ share }).where(and(eq(t.spaceMembers.spaceId, spaceId), eq(t.spaceMembers.userId, m.userId)));
      }
    });
    return c.json(await balances(spaceId));
  });

async function balances(spaceId: string) {
  const list = await members(spaceId);
  const paidRows = await db
    .select({ userId: t.transactions.createdBy, paid: sql<number>`coalesce(sum(${t.transactions.amount}),0)::int` })
    .from(t.transactions)
    .where(and(eq(t.transactions.userId, spaceId), sql`${t.transactions.createdBy} is not null`))
    .groupBy(t.transactions.createdBy);
  const settlements = await db.select().from(t.spaceSettlements).where(eq(t.spaceSettlements.spaceId, spaceId));
  const paid = new Map(paidRows.map((r) => [r.userId!, Number(r.paid)]));
  const total = list.reduce((s, m) => s + (paid.get(m.userId) ?? 0), 0);
  const custom = list.every((m) => m.share !== null);
  const rows = list.map((m) => {
    const share = custom ? m.share! / 100 : 1 / list.length;
    const fair = Math.round(total * share);
    const sent = settlements.filter((x) => x.fromUserId === m.userId).reduce((s, x) => s + x.amount, 0);
    const received = settlements.filter((x) => x.toUserId === m.userId).reduce((s, x) => s + x.amount, 0);
    // Pozitif: diğerleri ona borçlu; negatif: o diğerlerine borçlu
    return { userId: m.userId, name: m.name, avatar: m.avatar, share: Math.round(share * 100), paid: paid.get(m.userId) ?? 0, fair, net: (paid.get(m.userId) ?? 0) - fair + sent - received };
  });
  // Borçluları alacaklılarla eşleştiren en az sayıda ödeme önerisi
  const debtors = rows.filter((r) => r.net < 0).map((r) => ({ ...r, left: -r.net })).sort((a, b) => b.left - a.left);
  const creditors = rows.filter((r) => r.net > 0).map((r) => ({ ...r, left: r.net })).sort((a, b) => b.left - a.left);
  const transfers: { fromUserId: string; fromName: string; toUserId: string; toName: string; amount: number }[] = [];
  for (const d of debtors) {
    for (const cr of creditors) {
      if (d.left <= 0) break;
      const amount = Math.min(d.left, cr.left);
      if (amount <= 0) continue;
      transfers.push({ fromUserId: d.userId, fromName: d.name, toUserId: cr.userId, toName: cr.name, amount });
      d.left -= amount;
      cr.left -= amount;
    }
  }
  return {
    total,
    customShares: custom,
    members: rows,
    transfers: transfers.filter((x) => x.amount >= 100),
    history: settlements
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((x) => ({ id: x.id, amount: x.amount, createdAt: x.createdAt, from: rows.find((r) => r.userId === x.fromUserId)?.name ?? '?', to: rows.find((r) => r.userId === x.toUserId)?.name ?? '?' })),
  };
}
