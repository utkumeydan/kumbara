import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { billsForCycle, currentCycle, debtsDue, envelopeBalances, fixedDue } from './budget.js';
import { addDays, today } from './dates.js';
import { sendPush } from './push.js';

const sent = new Set<string>();
const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

function localHour(tz: string) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()));
}

// Saatte bir çalışır: yerel saati 09 olan ve push anahtarı olan kişilere yarın ödenecekleri hatırlatır.
// Kişinin kendi bütçesi ve üyesi olduğu ortak alanlar birlikte taranır.
export async function sendDueReminders() {
  const people = await db.selectDistinct({ userId: t.pushTokens.userId }).from(t.pushTokens);
  if (!people.length) return;
  const users = await db.select().from(t.users).where(inArray(t.users.id, people.map((p) => p.userId)));
  for (const u of users) {
    if (localHour(u.timezone) !== 9) continue;
    const day = today(u.timezone);
    const key = `${u.id}|${day}`;
    if (sent.has(key)) continue;
    sent.add(key);
    const spaces = await db.select({ spaceId: t.spaceMembers.spaceId }).from(t.spaceMembers).where(eq(t.spaceMembers.userId, u.id));
    const budgets = [u.id, ...spaces.map((s) => s.spaceId)];
    const tomorrow = addDays(day, 1);
    const items: string[] = [];
    for (const b of budgets) {
      const cycle = await currentCycle(b);
      if (!cycle) continue;
      const [bills, envs, debts] = await Promise.all([billsForCycle(b, cycle), envelopeBalances(b, cycle.id), debtsDue(b, cycle)]);
      for (const x of bills) if (x.dueDate === tomorrow && !x.paidThisCycle && x.active) items.push(`${x.name} ${tl(x.amount)}`);
      for (const x of fixedDue(envs, cycle)) if (x.dueDate === tomorrow) items.push(`${x.name} ${tl(x.amount)}`);
      for (const x of debts) if (x.dueDate === tomorrow) items.push(`${x.name} ${tl(x.amount)}`);
    }
    // Banka durumundaki taksit ve kredi ödemeleri
    const scheduled = await db
      .select()
      .from(t.scheduledPayments)
      .where(and(eq(t.scheduledPayments.userId, u.id), eq(t.scheduledPayments.dueDate, tomorrow), isNull(t.scheduledPayments.paidAt)));
    for (const x of scheduled) items.push(`${x.name === x.source ? x.name : `${x.source}: ${x.name}`} ${tl(x.amount)}`);
    if (items.length) await sendPush([u.id], { title: 'Yarın ödeme var', body: items.join(', '), data: { url: scheduled.length ? '/payments' : '/bills' } });

    // Pazartesileri: bakiyeler bir haftadır güncellenmediyse hatırlat
    if (new Intl.DateTimeFormat('en-US', { timeZone: u.timezone, weekday: 'short' }).format(new Date()) === 'Mon') {
      const [{ last }] = await db.select({ last: max(t.accounts.updatedAt) }).from(t.accounts).where(eq(t.accounts.userId, u.id));
      if (last && Date.now() - new Date(last).getTime() > 6 * 86_400_000)
        await sendPush([u.id], { title: 'Bakiyelerini güncelle', body: 'Banka ve kart bakiyelerin bir haftadır güncellenmedi. Bir dakika sürer.', data: { url: '/accounts' } });
    }
  }
  // Eski kayıtlar bellekte birikmesin
  if (sent.size > 50_000) sent.clear();
}
