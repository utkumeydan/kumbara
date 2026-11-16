import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Tüm para tutarları kuruş cinsinden tamsayı olarak saklanır.

// Hem kişileri hem de ortak bütçe alanlarını tutar. kind = 'space' olan satır bir
// "Birlikte" alanıdır: giriş yapamaz, üyeleri onun adına bütçe tutar.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['person', 'space'] }).notNull().default('person'),
  email: text('email').notNull().unique(),
  // Yalnızca sosyal girişle açılan hesaplarda boştur
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  paydayDay: integer('payday_day').notNull().default(1),
  currency: text('currency').notNull().default('TRY'),
  rollover: boolean('rollover').notNull().default(true),
  // Banka hesabı eksideyken dağıtılmamış gelir önce ödemelere, kalanı eksi bakiyeye otomatik dağıtılır
  autoAllocate: boolean('auto_allocate').notNull().default(true),
  // Her dönem beklenen gelir; yeniden doldurma ekranı buna göre dağıtır
  income: integer('income').notNull().default(0),
  avatar: integer('avatar').notNull().default(0),
  timezone: text('timezone').notNull().default('Europe/Istanbul'),
  plan: text('plan', { enum: ['free', 'plus'] }).notNull().default('free'),
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  isDemo: boolean('is_demo').notNull().default(false),
  // E-postanın sahibi kanıtlandı mı (sosyal giriş ya da sıfırlama bağlantısıyla); kanıtlanmamış hesaba sosyal giriş bağlanırken şifre düşürülür
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Opak oturum anahtarları; yalnızca özetleri saklanır, silinince oturum anında biter
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// Apple / Google hesap bağlantıları
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['google', 'apple'] }).notNull(),
    subject: text('subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('identities_provider_subject_idx').on(t.provider, t.subject), index('identities_user_idx').on(t.userId)],
);

export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: uuid('space_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    // Ortak harcamalardaki payı (yüzde). Boşsa üyeler arasında eşit bölünür.
    share: integer('share'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index('space_members_user_idx').on(t.userId)],
);

export const spaceInvites = pgTable('space_invites', {
  code: text('code').primaryKey(),
  spaceId: uuid('space_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const envelopes = pgTable(
  'envelopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    icon: text('icon').notNull().default('💰'),
    // Maaş gününde bu zarfa varsayılan olarak konacak tutar
    plannedAmount: integer('planned_amount').notNull().default(0),
    // variable: market gibi değişken harcama; fixed: kira gibi sabit ödeme
    kind: text('kind', { enum: ['variable', 'fixed'] }).notNull().default('variable'),
    // Sabit zarfın ayın hangi günü ödendiği (Maaştan önce listesinde görünür)
    dueDay: integer('due_day'),
    // Sabit gider bu tarihten önce plana yazılmaz (ör. kira ilk kez 1 Ocak'ta ödenecek)
    plannedFrom: date('planned_from'),
    sort: integer('sort').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
    // Otomatik dağıtımın kullandığı zarflar: payments (taksit ve krediler), overdraft (esnek hesap ödemesi)
    system: text('system', { enum: ['payments', 'overdraft'] }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('envelopes_user_idx').on(t.userId)],
);

// Bir maaş dönemi: maaş gününden bir sonraki maaş gününe kadar
export const cycles = pgTable(
  'cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    income: integer('income').notNull().default(0),
    closed: boolean('closed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cycles_user_idx').on(t.userId, t.startDate)],
);

// Dönem içinde gelen ek gelirler (prim, iade, yan gelir)
export const incomes = pgTable(
  'incomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    note: text('note').notNull().default(''),
    receivedOn: date('received_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('incomes_cycle_idx').on(t.cycleId)],
);

// Zarfa giren/çıkan para: maaş dağıtımı, devir, zarflar arası transfer
export const allocations = pgTable(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    kind: text('kind', { enum: ['payday', 'rollover', 'transfer', 'adjust'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('allocations_cycle_idx').on(t.cycleId), index('allocations_envelope_idx').on(t.envelopeId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    note: text('note').notNull().default(''),
    spentOn: date('spent_on').notNull(),
    billId: uuid('bill_id'),
    debtId: uuid('debt_id'),
    // Ödeme aracı: kredi kartı ya da banka hesabı; bakiyesine/provizyonuna yansır
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // Çevrimdışı kuyruktan gelen kaydın tekrar yazılmaması için istemci kimliği
    clientId: text('client_id'),
    // Ortak alanda harcamayı kimin girdiği
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transactions_user_spent_idx').on(t.userId, t.spentOn),
    index('transactions_cycle_idx').on(t.cycleId),
    index('transactions_envelope_idx').on(t.envelopeId),
    uniqueIndex('transactions_client_idx').on(t.userId, t.clientId),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('🎯'),
    color: text('color').notNull(),
    target: integer('target').notNull(),
    deadline: date('deadline'),
    // Her maaşta bu hedefe varsayılan olarak ayrılacak tutar
    plannedAmount: integer('planned_amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('goals_user_idx').on(t.userId)],
);

// Hedefe giren/çıkan para. sourceEnvelopeId boşsa para dağıtılmamış gelirden gelir (ya da oraya döner).
export const goalContributions = pgTable(
  'goal_contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
    sourceEnvelopeId: uuid('source_envelope_id').references(() => envelopes.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    contributedOn: date('contributed_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('goal_contributions_goal_idx').on(t.goalId), index('goal_contributions_cycle_idx').on(t.cycleId)],
);

// Düzenli fatura veya taksit (installmentsTotal doluysa taksittir)
export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id').references(() => envelopes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: integer('amount').notNull(),
    dueDay: integer('due_day').notNull(),
    installmentsTotal: integer('installments_total'),
    installmentsPaid: integer('installments_paid').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bills_user_idx').on(t.userId)],
);

// Kredi kartı, kredi veya kişisel borç; ödeme planı tahmini için
export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Ödemelerin varsayılan olarak düşeceği zarf
    envelopeId: uuid('envelope_id').references(() => envelopes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    type: text('type', { enum: ['card', 'loan', 'person', 'other'] }).notNull(),
    balance: integer('balance').notNull(),
    monthlyPayment: integer('monthly_payment').notNull().default(0),
    dueDay: integer('due_day'),
    // Faiz oranı onbinde bir cinsinden (350 = %3,50)
    interestRate: integer('interest_rate'),
    ratePeriod: text('rate_period', { enum: ['monthly', 'yearly'] }).notNull().default('monthly'),
    // Banka durumundan otomatik gelen borçlar: eksi bakiyeli hesap ya da ödeme takvimi kaynağı
    accountId: uuid('account_id'),
    scheduleSource: text('schedule_source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('debts_user_idx').on(t.userId)],
);

// Hesaplaşma: ortak alanda bir üyenin diğerine yaptığı ödeme
export const spaceSettlements = pgTable(
  'space_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('space_settlements_space_idx').on(t.spaceId)],
);

// Elle sabitlenen favori harcamalar (otomatik önerilere ek olarak)
export const favorites = pgTable(
  'favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('favorites_user_idx').on(t.userId)],
);

// Tamamlanan haftalık meydan okumalar (XP için kalıcı kayıt)
export const challengeCompletions = pgTable(
  'challenge_completions',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    code: text('code').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart, t.code] })],
);

// Expo push anahtarları (kişi başına birden çok cihaz)
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    platform: text('platform').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

// Saat eşleştirme: saat bir kod ister, kullanıcı kodu telefondan onaylar, saat oturum anahtarını bir kez alır
export const watchPairings = pgTable('watch_pairings', {
  code: text('code').primaryKey(),
  deviceSecretHash: text('device_secret_hash').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  pendingToken: text('pending_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Hedef fotoğrafı (küçültülmüş JPEG, base64)
export const goalPhotos = pgTable('goal_photos', {
  goalId: uuid('goal_id')
    .primaryKey()
    .references(() => goals.id, { onDelete: 'cascade' }),
  data: text('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Banka hesabı, kredi kartı ya da nakit; bakiyeyi kullanıcı elle günceller.
// balance eksi olabilir (esnek hesap kullanımı, kart borcu); creditLimit esnek hesap ya da kart limitidir.
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['bank', 'card', 'cash'] }).notNull(),
    balance: integer('balance').notNull().default(0),
    creditLimit: integer('credit_limit'),
    // Karttaki bekleyen provizyonlar
    pending: integer('pending').notNull().default(0),
    // Kart ekstresinin son ödeme tarihi ve tutarı; ödeme takvimine yansır
    dueDate: date('due_date'),
    dueAmount: integer('due_amount'),
    sort: integer('sort').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

// Tarihi ve tutarı belli gelecek ödemeler: kart taksitleri, kredi ödemeleri
export const scheduledPayments = pgTable(
  'scheduled_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // Kaynak: "Kredi kartı taksitleri", "İhtiyaç kredisi" gibi
    source: text('source').notNull(),
    name: text('name').notNull(),
    amount: integer('amount').notNull(),
    dueDate: date('due_date').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Ödendi işaretlenirken bir zarftan harcama kaydedildiyse o harcama
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scheduled_payments_user_idx').on(t.userId, t.dueDate)],
);

// Hesap bakiyesinin günlük kaydı; net durum geçmişi için
export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    // Bakiye eksi provizyon
    net: integer('net').notNull(),
  },
  (t) => [uniqueIndex('account_snapshots_day_idx').on(t.accountId, t.day), index('account_snapshots_user_idx').on(t.userId)],
);
