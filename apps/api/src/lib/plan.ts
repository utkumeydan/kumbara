import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db, t } from '../db/index.js';

export const FREE_ENVELOPES = 4;

type PlanUser = { plan: 'free' | 'plus'; planExpiresAt: Date | null };

export function hasPlus(u: PlanUser) {
  if (process.env.PLUS_FOR_ALL === '1') return true;
  return u.plan === 'plus' && (!u.planExpiresAt || u.planExpiresAt > new Date());
}

// Ortak alanda üyelerden biri Kumbara+ ise alan da Kumbara+ sayılır
export async function budgetHasPlus(userId: string) {
  const [u] = await db.select().from(t.users).where(eq(t.users.id, userId));
  if (!u) return false;
  if (u.kind === 'person') return hasPlus(u);
  const members = await db
    .select({ plan: t.users.plan, planExpiresAt: t.users.planExpiresAt })
    .from(t.spaceMembers)
    .innerJoin(t.users, eq(t.users.id, t.spaceMembers.userId))
    .where(eq(t.spaceMembers.spaceId, userId));
  return members.some(hasPlus);
}

export function requirePlus(ok: boolean, feature: string) {
  if (!ok) throw new HTTPException(402, { message: `${feature} Kumbara+ ile açılır` });
}
