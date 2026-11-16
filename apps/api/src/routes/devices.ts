import { randomInt } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { createSession, hashToken, randomToken, requireAuth, type Env } from '../lib/auth.js';
import { currentCycle, cycleInfo, envelopeBalances, getUser, streak } from '../lib/budget.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';
import { v } from '../lib/validate.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const devices = new Hono<Env>()
  // Push anahtarı kaydı (giriş yapan kişiye bağlanır, ortak alandan bağımsız)
  .post('/push-tokens', requireAuth, v('json', z.object({ token: z.string().min(10).max(200), platform: z.string().max(20).default('') })), async (c) => {
    const { token, platform } = c.req.valid('json');
    await db
      .insert(t.pushTokens)
      .values({ token, platform, userId: c.get('actorId') })
      .onConflictDoUpdate({ target: t.pushTokens.token, set: { platform }, setWhere: eq(t.pushTokens.userId, c.get('actorId')) });
    return c.json({ ok: true });
  })
  .delete('/push-tokens', requireAuth, v('json', z.object({ token: z.string() })), async (c) => {
    await db.delete(t.pushTokens).where(and(eq(t.pushTokens.token, c.req.valid('json').token), eq(t.pushTokens.userId, c.get('actorId'))));
    return c.json({ ok: true });
  })

  // Saat eşleştirme 1: saat bir kod ve gizli anahtar alır, kodu ekranda gösterir (10 dk geçerli)
  .post('/watch/pair', rateLimit('watch-pair', 10, 15 * 60_000, clientIp), async (c) => {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const deviceSecret = randomToken(24);
    await db.insert(t.watchPairings).values({ code, deviceSecretHash: hashToken(deviceSecret), expiresAt: new Date(Date.now() + 10 * 60_000) });
    return c.json({ code, deviceSecret, expiresIn: 600 });
  })
  // Eşleştirme 2: kullanıcı kodu telefondan onaylar; saat için ayrı bir oturum açılır
  .post('/watch/confirm', requireAuth, rateLimit('watch-confirm', 20, 15 * 60_000, (c) => c.get('actorId')), v('json', z.object({ code: z.string().trim().toUpperCase() })), async (c) => {
    const [p] = await db
      .select()
      .from(t.watchPairings)
      .where(and(eq(t.watchPairings.code, c.req.valid('json').code), gt(t.watchPairings.expiresAt, new Date())));
    if (!p || p.userId) throw new HTTPException(404, { message: 'Kod geçersiz ya da süresi dolmuş' });
    const token = await createSession(c.get('actorId'), 'Saat');
    await db.update(t.watchPairings).set({ userId: c.get('actorId'), pendingToken: token }).where(eq(t.watchPairings.code, p.code));
    return c.json({ ok: true });
  })
  // Eşleştirme 3: saat onayı bekler; onaylanınca oturum anahtarını bir kez alır
  .post('/watch/claim', rateLimit('watch-claim', 120, 15 * 60_000, clientIp), v('json', z.object({ code: z.string(), deviceSecret: z.string() })), async (c) => {
    const { code, deviceSecret } = c.req.valid('json');
    const [p] = await db.select().from(t.watchPairings).where(eq(t.watchPairings.code, code.toUpperCase()));
    if (!p || p.deviceSecretHash !== hashToken(deviceSecret) || p.expiresAt < new Date()) throw new HTTPException(404, { message: 'Eşleştirme bulunamadı' });
    if (!p.pendingToken) return c.json({ pending: true });
    await db.delete(t.watchPairings).where(eq(t.watchPairings.code, p.code));
    return c.json({ token: p.pendingToken });
  })
  // Saat ve kilit ekranı gibi küçük yüzeyler için hafif özet
  .get('/watch/summary', requireAuth, async (c) => {
    const userId = c.get('userId');
    const [user, cycle] = await Promise.all([getUser(c.get('actorId')), currentCycle(userId)]);
    const envs = await envelopeBalances(userId, cycle?.id ?? null);
    const left = envs.reduce((s, e) => s + e.remaining, 0);
    const info = cycle ? cycleInfo(cycle) : null;
    return c.json({
      name: user.name,
      left,
      daysLeft: info?.daysLeft ?? 0,
      perDay: info && info.daysLeft > 0 ? Math.floor(Math.max(0, left) / info.daysLeft) : 0,
      streak: await streak(userId),
      envelopes: envs.slice(0, 6).map((e) => ({ id: e.id, name: e.name, icon: e.icon, remaining: e.remaining })),
    });
  });
