import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

// Adres verilmezse: derlenmiş web uygulaması kendi adresini kullanır (nginx /api'yi API'ye iletir);
// geliştirmede yerel API, Android emülatöründe bilgisayarın localhost'u olan 10.0.2.2
const fallback = Platform.OS === 'web' && !__DEV__ ? '' : Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fallback).replace(/\/$/, '');

const TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Europe/Istanbul';
  }
})();
export const deviceTimezone = () => TIMEZONE;

let token: string | null = null;
let space: string | null = null;
let onUnauthorized: () => void = () => {};

export function setToken(t: string | null) {
  token = t;
}
export function setSpaceHeader(s: string | null) {
  space = s;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Ağ hatası mı (çevrimdışı ya da sunucu kapalı)?
export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

function headers(opts?: { space?: string | null }) {
  const s = opts && 'space' in opts ? opts.space : space;
  return {
    'Content-Type': 'application/json',
    'X-Timezone': TIMEZONE,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(s ? { 'X-Space': s } : {}),
  };
}

export async function api<T>(method: string, path: string, body?: unknown, opts?: { space?: string | null }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers: headers(opts), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error ?? 'Bir şeyler ters gitti');
  }
  return data as T;
}

// Metin dönen uçlar için (CSV dışa aktarma)
export async function apiText(path: string): Promise<string> {
  const res = await fetch(`${API_URL}/api${path}`, { headers: headers() }).catch(() => null);
  if (!res) throw new ApiError(0, 'Sunucuya ulaşılamadı');
  if (!res.ok) throw new ApiError(res.status, 'Dışa aktarma başarısız');
  return res.text();
}

// --- Tipler ---

export type User = {
  id: string;
  email: string;
  name: string;
  paydayDay: number;
  currency: string;
  rollover: boolean;
  income: number;
  avatar: number;
  timezone: string;
  plus: boolean;
  planExpiresAt: string | null;
  hasPassword: boolean;
  isDemo: boolean;
};

export type Envelope = {
  id: string;
  name: string;
  // Otomatik dağıtım zarfı: payments (taksit ve krediler), overdraft (esnek hesap ödemesi)
  system?: 'payments' | 'overdraft' | null;
  color: string;
  icon: string;
  plannedAmount: number;
  kind: 'variable' | 'fixed';
  dueDay: number | null;
  plannedFrom: string | null;
  sort: number;
  archived: boolean;
  allocated: number;
  assigned: number;
  spent: number;
  remaining: number;
};

export type Cycle = {
  id: string;
  startDate: string;
  endDate: string;
  income: number;
  closed: boolean;
  today: string;
  daysLeft: number;
  paydayDue: boolean;
  nextPayday: string;
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  envelopeId: string | null;
  installmentsTotal: number | null;
  installmentsPaid: number;
  active: boolean;
  dueDate: string | null;
  paidThisCycle: boolean;
};

type XpSource = { count: number; xp: number };
export type Progress = {
  xp: number;
  level: number;
  levelStart: number;
  levelEnd: number;
  savedTotal: number;
  mascotStage: number;
  sources: { expense: XpSource; activeDay: XpSource; saving: XpSource; goalDone: XpSource; challenge: XpSource };
};

export type Account = {
  id: string;
  name: string;
  kind: 'bank' | 'card' | 'cash';
  balance: number;
  creditLimit: number | null;
  pending: number;
  available: number;
  dueDate: string | null;
  dueAmount: number | null;
  debtId: string | null;
  monthlyInterest: number | null;
  payoffDate: string | null;
  updatedAt: string;
};
export type ScheduledPayment = { id: string; source: string; name: string; amount: number; dueDate: string; paidAt: string | null; transactionId: string | null };
export type CashflowCycle = { start: string; end: string; income: number; items: { label: string; amount: number; kind: 'scheduled' | 'bill' | 'debt' }[]; total: number; free: number };
export type PlanItem = {
  date: string | null;
  label: string;
  source: string | null;
  amount: number;
  kind: 'installment' | 'loan' | 'card' | 'debt' | 'fixed' | 'bill' | 'spending';
  paid: boolean;
  ref: { type: 'schedule' | 'envelope' | 'envelopes' | 'bill' | 'debt'; id: string };
};
export type PlanMonth = {
  month: string;
  income: { amount: number; date: string };
  items: PlanItem[];
  total: number;
  debtTotal: number;
  fixedTotal: number;
  spendingTotal: number;
  // Banka + nakit bakiyesine göre ay başı ve ay sonu (hesap yoksa null)
  opening: number | null;
  closing: number | null;
  incomeCounted: number;
  paymentsCounted: number;
  paidTotal: number;
  free: number;
  debtLeft: number;
};
export type MonthPlan = { months: PlanMonth[]; debtFreeMonth: string | null; bank: number | null; positiveMonth: string | null };
export type MoneyOverview = {
  accounts: Account[];
  totals: { available: number; cardAvailable: number; debt: number; net: number; scheduled: number; monthlyInterest: number };
  due: { until: string; total: number; overdue: number };
  months: { month: string; total: number; items: ScheduledPayment[] }[];
  sources: string[];
  recentPaid: ScheduledPayment[];
  cashflow: CashflowCycle[];
  history: { day: string; net: number }[];
  staleSince: string | null;
};

export type Summary = {
  user: { name: string; paydayDay: number; currency: string; rollover: boolean; autoAllocate: boolean; income: number; avatar: number };
  space: { id: string; name: string } | null;
  plus: boolean;
  envelopeLimit: number | null;
  cycle: Cycle | null;
  left: number;
  unassigned: number;
  week: { day: string; active: boolean; today: boolean; future: boolean }[];
  debt: { total: number; payoffDate: string | null } | null;
  perDay: number;
  envelopes: Envelope[];
  billsDue: Bill[];
  fixedDue: { envelopeId: string; name: string; icon: string; color: string; amount: number; dueDate: string }[];
  debtsDue: { debtId: string; name: string; amount: number; dueDate: string }[];
  scheduledDue: { total: number; count: number; overdue: number; next: ScheduledPayment } | null;
  safeToSpend: number;
  // Bu dönem otomatik olarak esnek hesap borcuna giden tutar (istemcide hesaplanır)
  overdraftPaid?: number;
  streak: number;
  progress: Progress;
};

export type Transaction = {
  id: string;
  amount: number;
  note: string;
  spentOn: string;
  envelopeId: string;
  cycleId: string;
  billId: string | null;
  debtId: string | null;
  // Ödeme aracı (kart ya da banka hesabı)
  accountId?: string | null;
  envelopeName: string;
  envelopeColor: string;
  envelopeIcon: string;
  createdBy: string | null;
  createdByName: string | null;
  // Çevrimdışı kuyrukta bekleyen kayıt
  pending?: boolean;
};

export type Goal = {
  id: string;
  name: string;
  icon: string;
  color: string;
  target: number;
  deadline: string | null;
  plannedAmount: number;
  fundedThisCycle: number;
  hasPhoto: boolean;
  saved: number;
  remaining: number;
  projectedDate: string | null;
  perPaycheck: number | null;
  done: boolean;
};

export type Stats = {
  cycle: { id: string; startDate: string; endDate: string; income: number } | null;
  total: number;
  avgDaily: number;
  locked: boolean;
  byEnvelope: { envelopeId: string; name: string; color: string; icon: string; spent: number }[];
  daily: { day: string; spent: number }[];
  history: { id: string; startDate: string; endDate: string; income: number; spent: number }[];
  insights: string[];
};

export type Debt = {
  id: string;
  name: string;
  type: 'card' | 'loan' | 'person' | 'other';
  envelopeId: string | null;
  balance: number;
  monthlyPayment: number;
  dueDay: number | null;
  interestRate: number | null;
  ratePeriod: 'monthly' | 'yearly';
  months: number | null;
  payoffDate: string | null;
  totalInterest: number | null;
  // Banka durumundan otomatik gelen borç (eksi bakiye, kart ya da takvim kaynağı)
  auto: boolean;
  accountId: string | null;
  scheduleSource: string | null;
  payments: { id: string; amount: number; spentOn: string }[];
};

export type Income = { id: string; amount: number; note: string; receivedOn: string };

export type Space = { id: string; name: string; role: 'owner' | 'member'; members: { userId: string; name: string; avatar: number; role: string }[] };

export type Wrapped = {
  cycle: { id: string; startDate: string; endDate: string; income: number; closed: boolean } | null;
  cycles: { id: string; startDate: string; endDate: string; closed: boolean }[];
  total: number;
  income: number;
  kept: number;
  saved: number;
  count: number;
  days: number;
  avgDaily: number;
  noSpendDays: number;
  longestStreak: number;
  topEnvelopes: { name: string; icon: string; color: string; spent: number; count: number }[];
  biggestDay: { day: string; spent: number } | null;
  biggestExpense: { amount: number; note: string; name: string; icon: string; spentOn: string } | null;
  topNote: { note: string; count: number; spent: number } | null;
  previousTotal: number | null;
};

export type Favorite = { id: string | null; envelopeId: string; note: string; amount: number; uses: number; pinned: boolean };

export type Subscriptions = {
  detected: { key: string; name: string; amount: number; yearly: number; months: number; dueDay: number; lastDate: string; envelopeId: string; tracked: boolean }[];
  yearlyDetected: number;
  yearlyBills: number;
};

export type Inflation = {
  items: { name: string; firstAvg: number; lastAvg: number; change: number; count: number; days: number }[];
  personalRate: number | null;
  envelopes: { id: string; name: string; icon: string; color: string; first: number; last: number; change: number | null }[];
  incomeChange: number | null;
  realIncomeChange: number | null;
  period: { from: string; to: string; cycles: number } | null;
};

export type Tag = { tag: string; total: number; count: number; last: string; envelopes: { envelopeId: string; total: number }[] };

export type Challenge = { code: string; title: string; description: string; progress: number; current: number; target: number; unit: 'gün' | 'kuruş'; done: boolean; failed: boolean };
export type Challenges = { weekStart: string; weekEnd: string; current: Challenge[]; previous: Challenge[]; completedTotal: number };
export type Badge = { code: string; title: string; description: string; icon: string; earned: boolean; progress: number };

export type Balances = {
  total: number;
  customShares: boolean;
  members: { userId: string; name: string; avatar: number; share: number; paid: number; fair: number; net: number }[];
  transfers: { fromUserId: string; fromName: string; toUserId: string; toName: string; amount: number }[];
  history: { id: string; amount: number; createdAt: string; from: string; to: string }[];
};

// --- Sorgular ---

// Esnek hesap ödemesi zarfı bütçe değil, borca giden paradır: zarf listelerinden çıkarılıp ayrı alan olarak verilir
function withoutOverdraft(s: Summary): Summary {
  const od = s.envelopes.find((e) => e.system === 'overdraft');
  return od ? { ...s, envelopes: s.envelopes.filter((e) => e !== od), overdraftPaid: od.spent } : { ...s, overdraftPaid: 0 };
}
export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('GET', '/summary'), select: withoutOverdraft });

export type TxFilter = { q?: string; envelopeId?: string; cycleId?: string; from?: string; to?: string };

export const useTransactions = (f: TxFilter, limit = 200) =>
  useQuery({
    queryKey: ['transactions', f, limit],
    queryFn: () => {
      const p = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
      p.set('limit', String(limit));
      return api<Transaction[]>('GET', `/transactions?${p}`);
    },
  });

export const useTransaction = (id?: string) =>
  useQuery({ queryKey: ['transaction', id], queryFn: () => api<Transaction>('GET', `/transactions/${id}`), enabled: !!id });

export const useIncomes = () => useQuery({ queryKey: ['incomes'], queryFn: () => api<Income[]>('GET', '/incomes') });
export const useCycles = () => useQuery({ queryKey: ['cycles'], queryFn: () => api<{ id: string; startDate: string; endDate: string; closed: boolean }[]>('GET', '/cycles') });
export const useSpaces = () => useQuery({ queryKey: ['spaces'], queryFn: () => api<Space[]>('GET', '/spaces') });
export const useArchived = () => useQuery({ queryKey: ['archived'], queryFn: () => api<Envelope[]>('GET', '/envelopes/archived') });
export const useWrapped = (cycleId?: string) =>
  useQuery({ queryKey: ['wrapped', cycleId ?? 'last'], queryFn: () => api<Wrapped>('GET', `/wrapped${cycleId ? `?cycleId=${cycleId}` : ''}`) });
export const useFavorites = () => useQuery({ queryKey: ['favorites'], queryFn: () => api<Favorite[]>('GET', '/favorites') });
export const useSubscriptions = () => useQuery({ queryKey: ['subscriptions'], queryFn: () => api<Subscriptions>('GET', '/subscriptions') });
export const useInflation = () => useQuery({ queryKey: ['inflation'], queryFn: () => api<Inflation>('GET', '/inflation') });
export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: () => api<Tag[]>('GET', '/tags') });
export const useChallenges = () => useQuery({ queryKey: ['challenges'], queryFn: () => api<Challenges>('GET', '/challenges') });
export const useBadges = () => useQuery({ queryKey: ['badges'], queryFn: () => api<Badge[]>('GET', '/badges') });
export const useBalances = (spaceId?: string | null) =>
  useQuery({ queryKey: ['balances', spaceId], queryFn: () => api<Balances>('GET', `/spaces/${spaceId}/balances`), enabled: !!spaceId });
export const usePlan = () => useQuery({ queryKey: ['plan'], queryFn: () => api<MonthPlan>('GET', '/plan?months=12') });
export type SpendingTip = { icon: string; title: string; text: string };
export type Spending = {
  month: string;
  prevMonth: string;
  total: number;
  prevTotal: number;
  count: number;
  dailyAvg: number;
  projected: number;
  isCurrent: boolean;
  categories: { id: string; name: string; icon: string; color: string; kind: 'variable' | 'fixed'; total: number; count: number; prev: number; share: number }[];
  places: { note: string; total: number; count: number }[];
  months: { month: string; total: number }[];
  tips: SpendingTip[];
};
export const useSpending = (month?: string) =>
  useQuery({ queryKey: ['spending', month ?? 'current'], queryFn: () => api<Spending>('GET', `/spending${month ? `?month=${month}` : ''}`) });
export const useMoney = () => useQuery({ queryKey: ['money'], queryFn: () => api<MoneyOverview>('GET', '/money') });
export const useDebts = () => useQuery({ queryKey: ['debts'], queryFn: () => api<Debt[]>('GET', '/debts') });
export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('GET', '/goals') });
export const useBills = () => useQuery({ queryKey: ['bills'], queryFn: () => api<Bill[]>('GET', '/bills') });
export const useStats = (cycleId?: string) =>
  useQuery({
    queryKey: ['stats', cycleId ?? 'current'],
    queryFn: () => api<Stats>('GET', `/stats${cycleId ? `?cycleId=${cycleId}` : ''}`),
  });

// Her değişiklikten sonra tüm bütçe verisi tazelenir
export function useApiMutation<TVars, TData = unknown>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries(),
  });
}
