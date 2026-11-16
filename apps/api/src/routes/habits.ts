import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { addDays, today } from '../lib/dates.js';
import { computeBadges } from '../lib/badges.js';
import { weeklyChallenges } from '../lib/challenges.js';
import { v } from '../lib/validate.js';
import { ownEnvelope } from './budget.js';

const TAG_RE = /#([\p{L}\p{N}_-]+)/gu;

// Notu karşılaştırma için sadeleştirir: küçük harf, etiket ve rakamlar atılır
export function normalizeNote(note: string) {
  return note
    .toLocaleLowerCase('tr-TR')
    .replace(TAG_RE, '')
    .replace(/[0-9/.,:()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTags(note: string) {
  return [...note.matchAll(TAG_RE)].map((m) => m[1].toLocaleLowerCase('tr-TR'));
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// En sık geçen değer
function mode<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

type TxRow = { id: string; amount: number; note: string; spentOn: string; envelopeId: string; cycleId: string; billId: string | null };

export async function recentTransactions(userId: string, since: string): Promise<TxRow[]> {
  return db
    .select({
      id: t.transactions.id,
      amount: t.transactions.amount,
      note: t.transactions.note,
      spentOn: t.transactions.spentOn,
      envelopeId: t.transactions.envelopeId,
      cycleId: t.transactions.cycleId,
      billId: t.transactions.billId,
    })
    .from(t.transactions)
    .where(and(eq(t.transactions.userId, userId), gte(t.transactions.spentOn, since)))
    .orderBy(desc(t.transactions.spentOn));
}

// Abonelik tespiti: aynı not, en az 3 farklı ayda (ya da son iki ayda üst üste), benzer tutarla tekrar ediyorsa
export function detectSubscriptions(txs: TxRow[], now: string) {
  const groups = new Map<string, TxRow[]>();
  for (const x of txs) {
    if (x.billId) continue;
    const key = normalizeNote(x.note);
    if (key.length < 2) continue;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const out = [];
  for (const [key, list] of groups) {
    const months = [...new Set(list.map((x) => x.spentOn.slice(0, 7)))].sort();
    const last = list.map((x) => x.spentOn).sort().at(-1)!;
    const consecutive = months.length >= 2 && monthsBetween(months.at(-2)!, months.at(-1)!) === 1;
    if (months.length < 3 && !(consecutive && monthsBetween(last.slice(0, 7), now.slice(0, 7)) <= 1)) continue;
    // Ayda birden fazla kez geçen (market gibi) harcamalar abonelik sayılmaz
    if (list.length > months.length * 1.5) continue;
    const amounts = list.map((x) => x.amount);
    const med = median(amounts);
    if (!amounts.every((a) => Math.abs(a - med) <= med * 0.15)) continue;
    if (monthsBetween(last.slice(0, 7), now.slice(0, 7)) > 2) continue;
    const day = Math.round(median(list.map((x) => Number(x.spentOn.slice(8)))));
    out.push({
      key,
      name: list[0].note.replace(TAG_RE, '').trim() || key,
      amount: med,
      yearly: med * 12,
      months: months.length,
      dueDay: Math.min(28, Math.max(1, day)),
      lastDate: last,
      envelopeId: mode(list.map((x) => x.envelopeId)),
    });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export const habits = new Hono<Env>()
  .use(requireAuth)

  // Favoriler: elle sabitlenenler + son 90 günde en az 3 kez girilen not/zarf/tutar üçlüleri
  .get('/favorites', async (c) => {
    const userId = c.get('userId');
    const pinned = await db.select().from(t.favorites).where(eq(t.favorites.userId, userId)).orderBy(t.favorites.createdAt);
    const txs = await recentTransactions(userId, addDays(today(), -90));
    const envs = await db.select({ id: t.envelopes.id, archived: t.envelopes.archived }).from(t.envelopes).where(eq(t.envelopes.userId, userId));
    const active = new Set(envs.filter((e) => !e.archived).map((e) => e.id));
    const groups = new Map<string, TxRow[]>();
    for (const x of txs) {
      if (!x.note.trim() || x.billId || !active.has(x.envelopeId)) continue;
      const key = `${x.envelopeId}|${normalizeNote(x.note)}`;
      groups.set(key, [...(groups.get(key) ?? []), x]);
    }
    const taken = new Set(pinned.map((p) => `${p.envelopeId}|${normalizeNote(p.note)}`));
    const suggested = [...groups.entries()]
      .filter(([k, list]) => list.length >= 3 && !taken.has(k))
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, Math.max(0, 8 - pinned.length))
      .map(([, list]) => ({ id: null, envelopeId: list[0].envelopeId, note: list[0].note, amount: mode(list.map((x) => x.amount)), uses: list.length, pinned: false }));
    return c.json([...pinned.filter((p) => active.has(p.envelopeId)).map((p) => ({ id: p.id, envelopeId: p.envelopeId, note: p.note, amount: p.amount, uses: 0, pinned: true })), ...suggested]);
  })
  .post('/favorites', v('json', z.object({ envelopeId: z.uuid(), amount: z.number().int().min(1).max(1_000_000_00), note: z.string().max(200).default('') })), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    await ownEnvelope(userId, body.envelopeId);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.favorites).where(eq(t.favorites.userId, userId));
    if (Number(n) >= 12) throw new HTTPException(400, { message: 'En fazla 12 favori olabilir' });
    const [f] = await db.insert(t.favorites).values({ ...body, userId }).returning();
    return c.json(f);
  })
  .delete('/favorites/:id', async (c) => {
    await db.delete(t.favorites).where(and(eq(t.favorites.id, c.req.param('id')), eq(t.favorites.userId, c.get('userId'))));
    return c.json({ ok: true });
  })

  // Abonelik dedektörü: tekrar eden harcamalar ve yıllık maliyetleri
  .get('/subscriptions', async (c) => {
    const userId = c.get('userId');
    const now = today();
    const txs = await recentTransactions(userId, addDays(now, -400));
    const bills = await db.select({ name: t.bills.name, amount: t.bills.amount, active: t.bills.active, installmentsTotal: t.bills.installmentsTotal }).from(t.bills).where(eq(t.bills.userId, userId));
    const tracked = new Set(bills.map((b) => normalizeNote(b.name)));
    const detected = detectSubscriptions(txs, now).map((s) => ({ ...s, tracked: tracked.has(s.key) }));
    const recurringBills = bills.filter((b) => b.active && !b.installmentsTotal);
    return c.json({
      detected,
      yearlyDetected: detected.filter((d) => !d.tracked).reduce((s, d) => s + d.yearly, 0),
      yearlyBills: recurringBills.reduce((s, b) => s + b.amount * 12, 0),
    });
  })

  // Kişisel enflasyon: sık alınan kalemlerin fiyat değişimi, zarf harcamalarının ve gelirin dönemler arası değişimi
  .get('/inflation', async (c) => {
    const userId = c.get('userId');
    const now = today();
    const txs = await recentTransactions(userId, addDays(now, -400));
    // Kalem fiyatları: aynı not en az 4 kez, ilk ve son üç kaydın ortalaması karşılaştırılır
    const groups = new Map<string, TxRow[]>();
    for (const x of txs) {
      const key = normalizeNote(x.note);
      if (key.length >= 2) groups.set(key, [...(groups.get(key) ?? []), x]);
    }
    const items = [...groups.values()]
      .filter((list) => list.length >= 4)
      .map((list) => {
        const sorted = [...list].sort((a, b) => a.spentOn.localeCompare(b.spentOn));
        const firstAvg = Math.round(sorted.slice(0, 3).reduce((s, x) => s + x.amount, 0) / 3);
        const lastAvg = Math.round(sorted.slice(-3).reduce((s, x) => s + x.amount, 0) / 3);
        const days = Math.max(1, (Date.parse(sorted.at(-1)!.spentOn) - Date.parse(sorted[0].spentOn)) / 86_400_000);
        return { name: sorted[0].note.replace(TAG_RE, '').trim(), firstAvg, lastAvg, change: (lastAvg - firstAvg) / firstAvg, count: list.length, days: Math.round(days), weight: list.reduce((s, x) => s + x.amount, 0) };
      })
      .filter((i) => i.days >= 30)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12);
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);
    const personalRate = totalWeight ? items.reduce((s, i) => s + i.change * i.weight, 0) / totalWeight : null;

    // Dönemler: zarf bazında harcama ve gelir
    const cycles = (await db.select().from(t.cycles).where(eq(t.cycles.userId, userId)).orderBy(desc(t.cycles.startDate)).limit(12)).reverse();
    const envs = await db.select({ id: t.envelopes.id, name: t.envelopes.name, icon: t.envelopes.icon, color: t.envelopes.color }).from(t.envelopes).where(eq(t.envelopes.userId, userId));
    const byCycleEnv = new Map<string, number>();
    for (const x of txs) byCycleEnv.set(`${x.cycleId}|${x.envelopeId}`, (byCycleEnv.get(`${x.cycleId}|${x.envelopeId}`) ?? 0) + x.amount);
    // Açık dönem eksik olduğu için karşılaştırma kapanmış dönemlerle yapılır
    const closed = cycles.filter((x) => x.closed);
    const first = closed[0];
    const last = closed.at(-1);
    const envelopes =
      first && last && first.id !== last.id
        ? envs
            .map((e) => {
              const a = byCycleEnv.get(`${first.id}|${e.id}`) ?? 0;
              const b = byCycleEnv.get(`${last.id}|${e.id}`) ?? 0;
              return { ...e, first: a, last: b, change: a > 0 ? (b - a) / a : null };
            })
            .filter((e) => e.first > 0 || e.last > 0)
            .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
        : [];
    const incomeChange = first && last && first.id !== last.id && first.income > 0 ? (last.income - first.income) / first.income : null;
    const realIncomeChange = incomeChange !== null && personalRate !== null ? (1 + incomeChange) / (1 + personalRate) - 1 : null;
    return c.json({
      items,
      personalRate,
      envelopes,
      incomeChange,
      realIncomeChange,
      period: first && last ? { from: first.startDate, to: last.endDate, cycles: closed.length } : null,
    });
  })

  // Etiketler: notlardaki #etiketlerin toplamları
  .get('/tags', v('query', z.object({ cycleId: z.uuid().optional() })), async (c) => {
    const userId = c.get('userId');
    const { cycleId } = c.req.valid('query');
    const rows = await db
      .select({ amount: t.transactions.amount, note: t.transactions.note, spentOn: t.transactions.spentOn, envelopeId: t.transactions.envelopeId })
      .from(t.transactions)
      .where(and(eq(t.transactions.userId, userId), sql`${t.transactions.note} like '%#%'`, cycleId ? eq(t.transactions.cycleId, cycleId) : undefined));
    const tags = new Map<string, { tag: string; total: number; count: number; last: string; envelopes: Map<string, number> }>();
    for (const r of rows) {
      for (const tag of new Set(extractTags(r.note))) {
        const x = tags.get(tag) ?? { tag, total: 0, count: 0, last: r.spentOn, envelopes: new Map() };
        x.total += r.amount;
        x.count++;
        if (r.spentOn > x.last) x.last = r.spentOn;
        x.envelopes.set(r.envelopeId, (x.envelopes.get(r.envelopeId) ?? 0) + r.amount);
        tags.set(tag, x);
      }
    }
    return c.json(
      [...tags.values()]
        .sort((a, b) => b.last.localeCompare(a.last) || b.total - a.total)
        .map((x) => ({ tag: x.tag, total: x.total, count: x.count, last: x.last, envelopes: [...x.envelopes.entries()].map(([envelopeId, total]) => ({ envelopeId, total })).sort((a, b) => b.total - a.total) })),
    );
  })

  // Haftalık meydan okumalar ve rozetler
  .get('/challenges', async (c) => c.json(await weeklyChallenges(c.get('userId'))))
  .get('/badges', async (c) => c.json(await computeBadges(c.get('userId'), c.get('actorId'))));
