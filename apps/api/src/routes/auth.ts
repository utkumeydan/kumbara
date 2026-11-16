import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { createSession, hashToken, randomToken, requireAuth, type Env } from '../lib/auth.js';
import { validTimezone } from '../lib/context.js';
import { cleanupDemos, seedDemo } from '../lib/demo.js';
import { sendMail } from '../lib/mail.js';
import { providerEnabled, verifyIdToken } from '../lib/oauth.js';
import { hasPlus } from '../lib/plan.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';
import { v } from '../lib/validate.js';

type User = typeof t.users.$inferSelect;

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.isDemo ? '' : u.email,
  name: u.name,
  paydayDay: u.paydayDay,
  currency: u.currency,
  rollover: u.rollover,
  income: u.income,
  avatar: u.avatar,
  timezone: u.timezone,
  plus: hasPlus(u),
  planExpiresAt: u.planExpiresAt,
  hasPassword: !!u.passwordHash,
  isDemo: u.isDemo,
});

const APP_URL = (process.env.APP_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const email = z.email().transform((s) => s.toLowerCase().trim());
const password = z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200);

async function issue(c: Context, user: User) {
  const token = await createSession(user.id, c.req.header('User-Agent') ?? '');
  return c.json({ token, user: publicUser(user) });
}

// Giriş denemeleri: IP başına dakikada 10, e-posta başına 15 dakikada 10
const ipLimit = rateLimit('auth-ip', 10, 60_000, clientIp);
const emailLimit = (name: string) =>
  rateLimit(name, 10, 15 * 60_000, async (c) => {
    const body = await c.req.raw.clone().json().catch(() => ({}));
    return String(body?.email ?? '').toLowerCase();
  });

// Sosyal giriş: bağlı kimlik, yoksa aynı e-postalı hesap, o da yoksa yeni hesap.
// E-posta sahipliği kanıtlanmamış bir hesaba bağlanırken şifre ve oturumlar silinir: başkası kurbanın e-postasıyla
// önceden hesap açıp şifresini bilerek sonradan bağlanan verileri okuyamaz.
export async function oauthUser(provider: 'google' | 'apple', id: { subject: string; email: string | null; name?: string | null }, opts: { name?: string; timezone?: string } = {}) {
  const [link] = await db.select().from(t.identities).where(and(eq(t.identities.provider, provider), eq(t.identities.subject, id.subject)));
  let user: User | undefined;
  if (link) [user] = await db.select().from(t.users).where(eq(t.users.id, link.userId));
  if (!user && id.email) {
    [user] = await db.select().from(t.users).where(and(eq(t.users.email, id.email), eq(t.users.kind, 'person')));
    if (user && !user.emailVerified) {
      await db.delete(t.sessions).where(eq(t.sessions.userId, user.id));
      [user] = await db.update(t.users).set({ passwordHash: null, emailVerified: true }).where(eq(t.users.id, user.id)).returning();
    }
  }
  if (!user) {
    // Apple e-postayı gizleyebilir; o durumda eşsiz bir yer tutucu kullanılır
    [user] = await db
      .insert(t.users)
      .values({
        email: id.email ?? `${provider}-${id.subject}@users.kumbara.local`,
        name: opts.name?.trim() || id.name || 'Kumbaracı',
        timezone: validTimezone(opts.timezone) ?? undefined,
        emailVerified: !!id.email,
      })
      .returning();
  }
  if (!link) await db.insert(t.identities).values({ userId: user.id, provider, subject: id.subject }).onConflictDoNothing();
  return user;
}

// Kullanıcı bulunamadığında karşılaştırılan sahte özet; yanıt süresi her durumda aynı kalır
const DUMMY_HASH = bcrypt.hashSync('kumbara-olmayan-hesap', 10);

export const auth = new Hono<Env>()
  .get('/providers', (c) => c.json({ google: providerEnabled('google'), apple: providerEnabled('apple') }))

  .post(
    '/register',
    ipLimit,
    v('json', z.object({ email, password, name: z.string().trim().min(1).max(60), timezone: z.string().optional() })),
    async (c) => {
      const body = c.req.valid('json');
      const [exists] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, body.email));
      if (exists) throw new HTTPException(409, { message: 'Bu e-posta zaten kayıtlı' });
      const [u] = await db
        .insert(t.users)
        .values({ email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10), timezone: validTimezone(body.timezone) ?? undefined })
        .returning();
      return issue(c, u);
    },
  )

  .post('/login', ipLimit, emailLimit('auth-login'), v('json', z.object({ email, password: z.string() })), async (c) => {
    const { email, password } = c.req.valid('json');
    const [u] = await db.select().from(t.users).where(and(eq(t.users.email, email), eq(t.users.kind, 'person')));
    const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
    if (!u?.passwordHash || !ok) {
      throw new HTTPException(401, { message: 'E-posta veya şifre hatalı' });
    }
    return issue(c, u);
  })

  // Apple / Google: kimlik anahtarı doğrulanır, hesap bulunur ya da oluşturulur
  .post(
    '/oauth',
    ipLimit,
    v('json', z.object({ provider: z.enum(['google', 'apple']), idToken: z.string().min(10), name: z.string().max(60).optional(), timezone: z.string().optional() })),
    async (c) => {
      const body = c.req.valid('json');
      const id = await verifyIdToken(body.provider, body.idToken);
      const user = await oauthUser(body.provider, id, { name: body.name, timezone: body.timezone });
      return issue(c, user);
    },
  )

  // Kayıt olmadan örnek verilerle dene; 24 saat sonra silinir
  .post('/demo', rateLimit('auth-demo', 5, 60 * 60_000, clientIp), v('json', z.object({ timezone: z.string().optional() })), async (c) => {
    await cleanupDemos();
    const [u] = await db
      .insert(t.users)
      .values({ email: `demo-${randomToken(9)}@demo.kumbara.local`, name: 'Misafir', isDemo: true, timezone: validTimezone(c.req.valid('json').timezone) ?? undefined })
      .returning();
    await seedDemo(u.id);
    const [fresh] = await db.select().from(t.users).where(eq(t.users.id, u.id));
    return issue(c, fresh);
  })

  // Şifre sıfırlama: e-postaya tek kullanımlık, 1 saat geçerli bağlantı gider. Hesap var mı yok mu belli edilmez.
  .post('/forgot', ipLimit, emailLimit('auth-forgot'), v('json', z.object({ email })), async (c) => {
    const [u] = await db.select().from(t.users).where(and(eq(t.users.email, c.req.valid('json').email), eq(t.users.kind, 'person'), eq(t.users.isDemo, false)));
    if (u) {
      const token = randomToken();
      await db.insert(t.passwordResets).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) });
      await sendMail(
        u.email,
        'Kumbara şifre sıfırlama',
        `Merhaba ${u.name},\n\nŞifreni sıfırlamak için bu bağlantıyı aç (1 saat geçerli):\n${APP_URL}/reset?token=${token}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
      );
    }
    return c.json({ ok: true });
  })
  .post('/reset', ipLimit, v('json', z.object({ token: z.string().min(10), password })), async (c) => {
    const { token, password: pw } = c.req.valid('json');
    const [r] = await db
      .select()
      .from(t.passwordResets)
      .where(and(eq(t.passwordResets.tokenHash, hashToken(token)), isNull(t.passwordResets.usedAt), gt(t.passwordResets.expiresAt, new Date())));
    if (!r) throw new HTTPException(400, { message: 'Bağlantının süresi dolmuş ya da kullanılmış' });
    await db.transaction(async (tx) => {
      await tx.update(t.users).set({ passwordHash: await bcrypt.hash(pw, 10), emailVerified: true }).where(eq(t.users.id, r.userId));
      await tx.update(t.passwordResets).set({ usedAt: new Date() }).where(eq(t.passwordResets.id, r.id));
      // Tüm açık oturumlar kapanır
      await tx.delete(t.sessions).where(eq(t.sessions.userId, r.userId));
    });
    return c.json({ ok: true });
  })

  .get('/me', requireAuth, async (c) => {
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    if (!u) throw new HTTPException(401, { message: 'Kullanıcı bulunamadı' });
    return c.json(publicUser(u));
  })
  .patch(
    '/me',
    requireAuth,
    v(
      'json',
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        avatar: z.number().int().min(0).max(5).optional(),
        timezone: z.string().optional(),
        // Kişisel bütçe ayarları (geriye dönük uyumluluk için burada da kabul edilir)
        paydayDay: z.number().int().min(1).max(31).optional(),
        currency: z.string().length(3).optional(),
        rollover: z.boolean().optional(),
        income: z.number().int().min(0).max(100_000_000_00).optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const [u] = await db
        .update(t.users)
        .set({ ...body, timezone: body.timezone ? (validTimezone(body.timezone) ?? undefined) : undefined })
        .where(eq(t.users.id, c.get('actorId')))
        .returning();
      return c.json(publicUser(u));
    },
  )
  // Misafir (demo) hesabını verileriyle birlikte gerçek hesaba çevirir
  .post('/me/claim', requireAuth, v('json', z.object({ email, password, name: z.string().trim().min(1).max(60) })), async (c) => {
    const body = c.req.valid('json');
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    if (!u.isDemo) throw new HTTPException(400, { message: 'Bu hesap zaten kayıtlı' });
    const [taken] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, body.email));
    if (taken) throw new HTTPException(409, { message: 'Bu e-posta zaten kayıtlı' });
    const [nu] = await db
      .update(t.users)
      .set({ email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10), isDemo: false })
      .where(eq(t.users.id, u.id))
      .returning();
    return c.json(publicUser(nu));
  })
  .post('/me/password', requireAuth, v('json', z.object({ current: z.string().optional(), next: password })), async (c) => {
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    if (u.passwordHash && !(c.req.valid('json').current && (await bcrypt.compare(c.req.valid('json').current!, u.passwordHash)))) {
      throw new HTTPException(400, { message: 'Mevcut şifre hatalı' });
    }
    await db.update(t.users).set({ passwordHash: await bcrypt.hash(c.req.valid('json').next, 10) }).where(eq(t.users.id, u.id));
    // Bu oturum dışındakiler kapanır
    await db.delete(t.sessions).where(and(eq(t.sessions.userId, u.id), ne(t.sessions.id, c.get('sessionId'))));
    return c.json({ ok: true });
  })
  // Hesap silme: şifresi olan hesapta şifre, olmayanda "SİL" onayı gerekir
  .delete('/me', requireAuth, v('json', z.object({ password: z.string().optional(), confirm: z.string().optional() })), async (c) => {
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    const body = c.req.valid('json');
    if (u.passwordHash) {
      if (!body.password || !(await bcrypt.compare(body.password, u.passwordHash))) throw new HTTPException(400, { message: 'Şifre hatalı' });
    } else if (!u.isDemo && body.confirm?.toLocaleUpperCase('tr-TR') !== 'SİL') {
      throw new HTTPException(400, { message: 'Onaylamak için SİL yaz' });
    }
    // Tek üyesi olduğu ortak alanlar da silinir
    const owned = await db.select().from(t.spaceMembers).where(eq(t.spaceMembers.userId, u.id));
    for (const m of owned) {
      const members = await db.select().from(t.spaceMembers).where(eq(t.spaceMembers.spaceId, m.spaceId));
      if (members.length === 1) await db.delete(t.users).where(eq(t.users.id, m.spaceId));
    }
    await db.delete(t.users).where(eq(t.users.id, u.id));
    return c.json({ ok: true });
  })

  .get('/sessions', requireAuth, async (c) => {
    const rows = await db
      .select({ id: t.sessions.id, userAgent: t.sessions.userAgent, createdAt: t.sessions.createdAt, lastUsedAt: t.sessions.lastUsedAt })
      .from(t.sessions)
      .where(eq(t.sessions.userId, c.get('actorId')))
      .orderBy(desc(t.sessions.lastUsedAt));
    return c.json(rows.map((s) => ({ ...s, current: s.id === c.get('sessionId') })));
  })
  .post('/logout', requireAuth, async (c) => {
    await db.delete(t.sessions).where(eq(t.sessions.id, c.get('sessionId')));
    return c.json({ ok: true });
  })
  // Tüm cihazlardan çıkış (bu cihaz dahil)
  .post('/logout-all', requireAuth, async (c) => {
    await db.delete(t.sessions).where(eq(t.sessions.userId, c.get('actorId')));
    return c.json({ ok: true });
  });
