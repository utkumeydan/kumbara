import { and, eq, sql } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { cycleInfo, envelopeBalances } from './budget.js';
import { today } from './dates.js';
import { sendPush } from './push.js';

const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

// Yeni harcamadan sonra uyarılar: zarfın %80'i aşıldı mı, zarf eksiye düştü mü, günlük pay aşıldı mı?
export async function expenseAlerts(userId: string, cycle: { id: string; startDate: string; endDate: string }, envelopeId: string, amount: number) {
  const envs = await envelopeBalances(userId, cycle.id);
  const env = envs.find((e) => e.id === envelopeId);
  const alerts: string[] = [];
  if (env && env.allocated > 0) {
    const before = (env.spent - amount) / env.allocated;
    const after = env.spent / env.allocated;
    if (env.remaining < 0 && env.remaining + amount >= 0) alerts.push(`${env.icon} ${env.name} zarfı eksiye düştü (${tl(env.remaining)}).`);
    else if (before < 0.8 && after >= 0.8) alerts.push(`${env.icon} ${env.name} zarfının %${Math.round(after * 100)}'i harcandı; ${tl(env.remaining)} kaldı.`);
  }
  // Günün başındaki pay: şu an kalan + bugün harcanan, kalan günlere bölünür
  const now = today();
  if (now <= cycle.endDate) {
    const [{ spentToday }] = await db
      .select({ spentToday: sql<number>`coalesce(sum(${t.transactions.amount}),0)::int` })
      .from(t.transactions)
      .where(and(eq(t.transactions.cycleId, cycle.id), eq(t.transactions.spentOn, now)));
    const left = envs.reduce((s, e) => s + e.remaining, 0);
    const days = cycleInfo(cycle).daysLeft;
    const allowance = days > 0 ? Math.floor(Math.max(0, left + Number(spentToday)) / days) : 0;
    const spent = Number(spentToday);
    if (allowance > 0 && spent > allowance && spent - amount <= allowance) alerts.push(`Bugünkü payını (${tl(allowance)}) aştın.`);
  }
  return { alerts, envelope: env };
}

// Ortak alanda harcama eklenince diğer üyelere haber verilir
export async function notifySpace(spaceId: string, actorId: string, text: { amount: number; envelopeName: string; envelopeIcon: string; remaining?: number; alerts: string[] }) {
  const members = await db.select({ userId: t.spaceMembers.userId }).from(t.spaceMembers).where(eq(t.spaceMembers.spaceId, spaceId));
  const others = members.map((m) => m.userId).filter((id) => id !== actorId);
  if (!others.length) return;
  const [[actor], [space]] = await Promise.all([
    db.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, actorId)),
    db.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, spaceId)),
  ]);
  const rest = text.remaining !== undefined ? ` · ${tl(text.remaining)} kaldı` : '';
  await sendPush(others, {
    title: `${space?.name ?? 'Ortak bütçe'}`,
    body: `${actor?.name ?? 'Biri'} ${text.envelopeIcon} ${text.envelopeName} için ${tl(text.amount)} harcadı${rest}.${text.alerts.length ? ' ' + text.alerts[0] : ''}`,
    data: { url: '/envelopes', spaceId },
  });
}
