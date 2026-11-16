import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { hasPlus } from '../lib/plan.js';

// RevenueCat olayları; app_user_id olarak kullanıcı kimliği kullanılır
const ACTIVE = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'TEMPORARY_ENTITLEMENT_GRANT']);

export const billing = new Hono<Env>()
  .post('/webhooks/revenuecat', async (c) => {
    const secret = process.env.RC_WEBHOOK_SECRET;
    if (!secret || !safeEqual(c.req.header('Authorization') ?? '', `Bearer ${secret}`)) throw new HTTPException(401, { message: 'Yetkisiz' });
    const { event } = await c.req.json<{ event: { type: string; app_user_id: string; expiration_at_ms?: number | null } }>();
    const userId = event?.app_user_id;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return c.json({ ok: true });
    if (ACTIVE.has(event.type)) {
      await db
        .update(t.users)
        .set({ plan: 'plus', planExpiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null })
        .where(eq(t.users.id, userId));
    } else if (event.type === 'EXPIRATION') {
      await db.update(t.users).set({ plan: 'free', planExpiresAt: null }).where(eq(t.users.id, userId));
    }
    return c.json({ ok: true });
  })
  .get('/billing', requireAuth, async (c) => {
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    return c.json({ plus: hasPlus(u), plan: u.plan, expiresAt: u.planExpiresAt, devToggle: devBillingAllowed() });
  })
  // Geliştirme ortamında Kumbara+ özelliklerini denemek için
  .post('/billing/dev-toggle', requireAuth, async (c) => {
    if (!devBillingAllowed()) throw new HTTPException(404, { message: 'Bulunamadı' });
    const [u] = await db.select().from(t.users).where(eq(t.users.id, c.get('actorId')));
    const plan = hasPlus(u) ? 'free' : 'plus';
    await db.update(t.users).set({ plan, planExpiresAt: null }).where(eq(t.users.id, u.id));
    return c.json({ plus: plan === 'plus' });
  });

// Yalnızca açıkça geliştirme/test ortamında ya da ALLOW_DEV_BILLING=1 ile; NODE_ENV unutulursa kapalı kalır
function devBillingAllowed() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || process.env.ALLOW_DEV_BILLING === '1';
}

// Sabit sürede karşılaştırma (gizli anahtar zamanlama ile tahmin edilemesin)
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
