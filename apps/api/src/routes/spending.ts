import { and, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, t } from '../db/index.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { addDays, clampedDate, today } from '../lib/dates.js';
import { planDebts } from '../lib/money.js';
import { v } from '../lib/validate.js';
import { detectSubscriptions, normalizeNote, recentTransactions } from './habits.js';

const OVERDRAFT_NOTE = 'Esnek hesaba gitti (otomatik)';
const m0 = (k: number) => (k / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: clampedDate(y, m + 1, 0) };
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return clampedDate(y, m + n, 1).slice(0, 7);
}

type Tip = { icon: string; title: string; text: string };

// Harcama analizi: takvim ayına göre kategori dağılımı, geçen ayla kıyas, en çok harcanan yerler ve tasarruf önerileri
export const spending = new Hono<Env>().use(requireAuth).get('/spending', v('query', z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })), async (c) => {
  const userId = c.get('userId');
  const now = today();
  const month = c.req.valid('query').month ?? now.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);
  const cur = monthBounds(month);
  const prev = monthBounds(prevMonth);
  const sixAgo = monthBounds(shiftMonth(month, -5)).from;

  const [rows, envs] = await Promise.all([
    db
      .select({ amount: t.transactions.amount, note: t.transactions.note, spentOn: t.transactions.spentOn, envelopeId: t.transactions.envelopeId })
      .from(t.transactions)
      .where(and(eq(t.transactions.userId, userId), gte(t.transactions.spentOn, sixAgo), lte(t.transactions.spentOn, cur.to), ne(t.transactions.note, OVERDRAFT_NOTE))),
    db.select().from(t.envelopes).where(eq(t.envelopes.userId, userId)),
  ]);
  const inRange = (d: string, b: { from: string; to: string }) => d >= b.from && d <= b.to;
  const now6 = rows.filter((r) => inRange(r.spentOn, cur));
  const before = rows.filter((r) => inRange(r.spentOn, prev));
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const total = sum(now6);
  const prevTotal = sum(before);

  const categories = envs
    .map((e) => {
      const mine = now6.filter((r) => r.envelopeId === e.id);
      return { id: e.id, name: e.name, icon: e.icon, color: e.color, kind: e.kind, total: sum(mine), count: mine.length, prev: sum(before.filter((r) => r.envelopeId === e.id)) };
    })
    .filter((x) => x.total > 0 || x.prev > 0)
    .map((x) => ({ ...x, share: total ? x.total / total : 0 }))
    .sort((a, b) => b.total - a.total);

  // En çok harcanan yerler (notlara göre)
  const byNote = new Map<string, { note: string; total: number; count: number }>();
  for (const r of now6) {
    const key = normalizeNote(r.note);
    if (!key) continue;
    const x = byNote.get(key) ?? { note: r.note.split('#')[0].trim() || r.note, total: 0, count: 0 };
    x.total += r.amount;
    x.count++;
    byNote.set(key, x);
  }
  const places = [...byNote.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((ym) => ({ month: ym, total: sum(rows.filter((r) => r.spentOn.startsWith(ym))) }));

  const isCurrent = month === now.slice(0, 7);
  const days = isCurrent ? Number(now.slice(8)) : Number(cur.to.slice(8));
  const daysInMonth = Number(cur.to.slice(8));
  const dailyAvg = days ? Math.round(total / days) : 0;
  const projected = isCurrent ? dailyAvg * daysInMonth : total;

  // Öneriler
  const tips: Tip[] = [];
  const top = categories[0];
  if (top && total) tips.push({ icon: 'pie-chart-outline', title: `En çok ${top.name}`, text: `Bu ay harcamanın %${Math.round(top.share * 100)}'i (${m0(top.total)}) ${top.name} kategorisine gitti.` });
  for (const x of categories.filter((x) => x.prev > 0 && x.total - x.prev >= 200_00 && x.total > x.prev * 1.2).slice(0, 2)) {
    tips.push({ icon: 'trending-up-outline', title: `${x.name} arttı`, text: `Geçen aya göre ${m0(x.total - x.prev)} (%${Math.round(((x.total - x.prev) / x.prev) * 100)}) daha fazla.` });
  }
  if (isCurrent && prevTotal && projected > prevTotal * 1.1)
    tips.push({ icon: 'speedometer-outline', title: 'Bu hızla geçen ayı aşıyorsun', text: `Günde ortalama ${m0(dailyAvg)} ile ay sonunda ~${m0(projected)} harcamış olacaksın (geçen ay ${m0(prevTotal)}).` });
  const variable = categories.filter((x) => x.kind === 'variable' && x.total >= 500_00);
  if (variable[0]) {
    const save = Math.round((variable[0].total * 0.15) / 100) * 100;
    tips.push({ icon: 'leaf-outline', title: 'Küçük bir kısıntı', text: `${variable[0].name} harcamanı %15 azaltırsan ayda ~${m0(save)}, yılda ~${m0(save * 12)} biriktirirsin.` });
  }
  const subs = detectSubscriptions(await recentTransactions(userId, addDays(now, -400)), now);
  const yearly = subs.reduce((s, x) => s + x.yearly, 0);
  if (yearly > 0) tips.push({ icon: 'repeat', title: 'Tekrarlayan ödemeler', text: `Düzenli tekrar eden ${subs.length} harcaman yılda ~${m0(yearly)} tutuyor. Kullanmadıklarını iptal etmeyi düşün.` });
  // Esnek hesap faizi
  const autoDebts = await db.select().from(t.debts).where(and(eq(t.debts.userId, userId), isNotNull(t.debts.accountId)));
  const plans = await planDebts(userId, autoDebts);
  const interest = plans.reduce((s, d) => s + (d.monthlyRate ? Math.round(d.balance * d.monthlyRate) : 0), 0);
  if (interest > 0) tips.push({ icon: 'alert-circle-outline', title: 'Faiz maliyeti', text: `Eksi bakiye ve kart borcu ayda ~${m0(interest)} faiz yazıyor; önce bunları kapatmak en kârlı tasarruf.` });
  else if (plans.some((d) => d.balance > 0 && !d.interestRate)) tips.push({ icon: 'information-circle-outline', title: 'Faizi gör', text: 'Hesaplar > Borçlar’da esnek hesap ve kart faiz oranını girersen aylık faiz maliyetini gösteririz.' });

  return c.json({ month, prevMonth, total, prevTotal, count: now6.length, dailyAvg, projected, isCurrent, categories, places, months, tips });
});
