import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { db, t } from '../db/index.js';
import { requestContext, validTimezone } from './context.js';

// userId: bütçesi okunan/yazılan hesap (kişi ya da ortak alan)
// actorId: giriş yapmış kişi
export type Env = { Variables: { userId: string; actorId: string; sessionId: string } };

const SESSION_DAYS = 90;
const DAY = 86_400_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export async function createSession(userId: string, userAgent = '') {
  const token = randomToken();
  await db.insert(t.sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: userAgent.slice(0, 200),
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
  });
  return token;
}

export async function isMember(spaceId: string, userId: string) {
  const [m] = await db
    .select()
    .from(t.spaceMembers)
    .where(and(eq(t.spaceMembers.spaceId, spaceId), eq(t.spaceMembers.userId, userId)));
  return m ?? null;
}

// Saat dilimi başlığını istek bağlamına koyar; korumasız uçlarda da kullanılır
export const withTimezone = createMiddleware(async (c, next) => {
  const tz = validTimezone(c.req.header('X-Timezone')) ?? process.env.APP_TZ ?? 'Europe/Istanbul';
  await requestContext.run({ tz }, next);
});

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  // Alt uygulamalar aynı isteğe birden çok kez bağlanabilir; oturum bir kez doğrulanır
  if (c.get('actorId')) return next();
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) throw new HTTPException(401, { message: 'Giriş gerekli' });
  const [s] = await db
    .select()
    .from(t.sessions)
    .where(and(eq(t.sessions.tokenHash, hashToken(header.slice(7))), gt(t.sessions.expiresAt, new Date())));
  if (!s) throw new HTTPException(401, { message: 'Oturum geçersiz' });

  // Kayan süre: günde en fazla bir kez güncellenir
  if (Date.now() - s.lastUsedAt.getTime() > DAY) {
    await db
      .update(t.sessions)
      .set({ lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) })
      .where(eq(t.sessions.id, s.id));
  }

  c.set('actorId', s.userId);
  c.set('sessionId', s.id);
  c.set('userId', s.userId);

  // Ortak bütçe alanı seçiliyse istekler o alanın adına yapılır
  const space = c.req.header('X-Space');
  if (space && space !== s.userId) {
    if (!(await isMember(space, s.userId))) throw new HTTPException(403, { message: 'Bu alana erişimin yok' });
    c.set('userId', space);
  }
  await next();
});
