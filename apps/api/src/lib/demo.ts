import { and, eq, lt } from 'drizzle-orm';
import { db, t } from '../db/index.js';
import { addDays, cycleRange, today } from './dates.js';

const ENVELOPES = [
  { name: 'Kira', icon: '🏠', color: '#C7B8F5', kind: 'fixed' as const, amount: 17_500_00, dueDay: 5 },
  { name: 'Market', icon: '🛒', color: '#A8E6A1', kind: 'variable' as const, amount: 8_000_00 },
  { name: 'Yeme içme', icon: '🍔', color: '#F8D66D', kind: 'variable' as const, amount: 4_500_00 },
  { name: 'Ulaşım', icon: '🚗', color: '#A7D3F2', kind: 'variable' as const, amount: 3_000_00 },
];

const EXPENSES: [number, number, string, number][] = [
  // [kaç gün önce, zarf sırası, not, tutar ₺]
  [11, 1, 'Migros', 742],
  [11, 3, 'Benzin', 1250],
  [10, 2, 'Kahve', 95],
  [9, 1, 'Pazar', 380],
  [8, 2, 'Öğle yemeği', 260],
  [7, 0, 'Kira', 17500],
  [7, 2, 'Kahve', 95],
  [6, 1, 'A101', 214],
  [5, 2, 'Pizza', 420],
  [4, 3, 'İstanbulkart', 400],
  [3, 1, 'Migros', 615],
  [2, 2, 'Kahve', 110],
  [1, 2, 'Akşam yemeği', 680],
  [0, 1, 'Fırın', 85],
];

// Örnek verilerle dolu bir deneme hesabı kurar: 12 gün önce başlamış bir dönem, harcamalar,
// bir hedef, bir taksit ve bir kredi kartı borcu.
export async function seedDemo(userId: string) {
  const now = today();
  const start = addDays(now, -12);
  const paydayDay = Number(start.slice(8));
  await db.update(t.users).set({ paydayDay, income: 45_000_00 }).where(eq(t.users.id, userId));
  const envs = await db
    .insert(t.envelopes)
    .values(ENVELOPES.map((e, i) => ({ userId, name: e.name, icon: e.icon, color: e.color, kind: e.kind, plannedAmount: e.amount, dueDay: e.dueDay ?? null, sort: i })))
    .returning();
  const end = cycleRange(start, paydayDay).end;
  const [cycle] = await db.insert(t.cycles).values({ userId, startDate: start, endDate: end, income: 45_000_00 }).returning();
  await db.insert(t.allocations).values(envs.map((e, i) => ({ cycleId: cycle.id, envelopeId: e.id, amount: ENVELOPES[i].amount, kind: 'payday' as const })));
  await db.insert(t.transactions).values(
    EXPENSES.map(([ago, env, note, tl]) => ({ userId, envelopeId: envs[env].id, cycleId: cycle.id, amount: tl * 100, note, spentOn: addDays(now, -ago), createdBy: userId })),
  );
  const [goal] = await db.insert(t.goals).values({ userId, name: 'Yaz tatili', icon: '🏖️', color: '#8FD9CF', target: 30_000_00, deadline: `${now.slice(0, 4)}-12-31`, plannedAmount: 3_000_00 }).returning();
  await db.insert(t.goalContributions).values([
    { goalId: goal.id, amount: 5_000_00, contributedOn: addDays(now, -40) },
    { goalId: goal.id, cycleId: cycle.id, amount: 3_000_00, contributedOn: start },
  ]);
  await db.insert(t.bills).values([
    { userId, envelopeId: envs[1].id, name: 'Telefon taksidi', amount: 1_250_00, dueDay: Number(addDays(now, 3).slice(8)), installmentsTotal: 12, installmentsPaid: 4 },
    { userId, envelopeId: envs[2].id, name: 'Netflix', amount: 230_00, dueDay: Number(addDays(now, 6).slice(8)) },
  ]);
  await db.insert(t.debts).values({ userId, name: 'Kredi kartı', type: 'card', balance: 24_000_00, monthlyPayment: 2_500_00, interestRate: 425, ratePeriod: 'monthly', dueDay: Number(addDays(now, 8).slice(8)) });
}

// 24 saatten eski demo hesaplarını siler
export async function cleanupDemos() {
  await db.delete(t.users).where(and(eq(t.users.isDemo, true), lt(t.users.createdAt, new Date(Date.now() - 86_400_000))));
}
