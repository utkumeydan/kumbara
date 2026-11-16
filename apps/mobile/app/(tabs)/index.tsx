import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanRowView } from '@/components/PlanRowView';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Turtle';
import { Card, DateBadge, Glow, ListRow, Loading, Money, Row, SectionTitle, Stat, T, type IconName } from '@/components/ui';
import { useGoals, useMoney, usePlan, useSpending, useSummary, useTransactions, type Goal, type MonthPlan, type MoneyOverview, type PlanMonth, type Spending, type Summary, type Transaction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatMonth, greeting, relativeDay, todayIso } from '@/lib/money';
import { afterPayday, groupPlanItems, type PlanRow } from '@/lib/plan';
import { usePendingCount } from '@/lib/offline';
import { FONT, useTheme } from '@/lib/theme';

const m0 = (n: number) => formatMoney(n, { cents: false });
const DAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const BANK_HELP = 'Banka ve nakit hesaplarının toplam bakiyesi. Eksi ise esnek hesap (KMH) kullanıyorsun demektir. Bakiyeyi Hesaplar sekmesinden güncel tut.';
const CARD_HELP = 'Kartla yaptığın harcama hesabından hemen düşmez, kart borcuna eklenir. Hesabından ekstreyi ödediğinde düşer. Kart borcu, ekstre, kalan taksitler ve yeni harcamaların toplamıdır. Net durum, hesabın ve kart borcunun toplamıdır.';
const MONTH_END_HELP = 'Şu anki bakiyenden ay sonuna kadar kalan taksit, kredi, sabit gider ve son aylardaki ortalama günlük harcaman düşülür; maaş yatacaksa eklenir.';

export default function Home() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { data, error, refetch, isRefetching } = useSummary();
  const { data: plan, refetch: refetchPlan } = usePlan();
  const { data: money, refetch: refetchMoney } = useMoney();
  const { data: spending, refetch: refetchSpending } = useSpending();
  const { data: goals } = useGoals();
  const { data: recent, refetch: refetchRecent } = useTransactions({}, 6);
  const pending = usePendingCount();
  const { user } = useAuth();
  const toast = useToast();

  if (!data) return <Loading error={error} onRetry={refetch} />;
  if (!data.envelopes.length) return <Redirect href="/setup" />;

  const refresh = () => void Promise.all([refetch(), refetchPlan(), refetchMoney(), refetchSpending(), refetchRecent()]);
  const next = plan ? nextPayment(plan.months) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow height={380} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} tintColor={c.muted} />}>
        <TopBar data={data} />
        {data.space && (
          <Pressable onPress={() => router.push('/together')} accessibilityRole="button" style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Ionicons name="people" size={14} color={c.accent} />
            <T v="tiny" color={c.text}>{data.space.name} · ortak hesap</T>
          </Pressable>
        )}
        {user?.isDemo && (
          <ListRow icon="sparkles" title="Misafir modundasın" subtitle="Bu örnek veriler 24 saat sonra silinir. Kendi hesabın için kayıt ol." onPress={() => router.push('/settings')} />
        )}
        {pending > 0 && <ListRow icon="cloud-offline-outline" iconBg="#A7D3F2" title={`${pending} harcama gönderilmeyi bekliyor`} subtitle="İnternet gelince otomatik gönderilecek" chevron={false} />}

        {plan && plan.bank !== null ? <BankHero plan={plan} data={data} money={money} onHelp={(m) => toast({ message: m })} /> : <SpendHero spending={spending} />}

        <Row gap={10} style={{ alignItems: 'stretch' }}>
          <Card onPress={() => router.push('/envelopes')} style={{ flex: 1, gap: 6, padding: 14 }}>
            <Row gap={6}>
              <Ionicons name="pie-chart" size={14} color={c.muted} />
              <T v="tiny" muted>Bu ay harcanan</T>
            </Row>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.display, fontSize: 22, letterSpacing: -0.6, color: c.text }}>{m0(spending?.total ?? 0)}</Text>
            {spending && spending.prevTotal > 0 ? (
              <T v="tiny" color={spending.total > spending.prevTotal ? c.danger : c.success} numberOfLines={1}>
                {spending.total > spending.prevTotal ? '▲' : '▼'} geçen ay {m0(spending.prevTotal)}
              </T>
            ) : (
              <T v="tiny" muted numberOfLines={1}>{spending ? formatMonth(spending.month, true) : ' '}</T>
            )}
          </Card>
          <Card onPress={() => router.push('/payments')} style={{ flex: 1, gap: 6, padding: 14 }}>
            <Row gap={6}>
              <Ionicons name="calendar" size={14} color={c.muted} />
              <T v="tiny" muted>Sıradaki ödeme</T>
            </Row>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.display, fontSize: 22, letterSpacing: -0.6, color: c.text }}>{next ? m0(next.total) : '—'}</Text>
            <T v="tiny" muted numberOfLines={1}>{next ? `${relativeDay(next.date)} · ${next.count > 1 ? `${next.count} ödeme` : next.label}` : 'Yaklaşan ödeme yok'}</T>
          </Card>
        </Row>

        <Recent items={recent} />
        {spending && <ThisMonth spending={spending} />}
        {plan && <Upcoming months={plan.months} />}
        {spending && spending.tips.length > 0 && <Tips tips={spending.tips.slice(0, 2)} />}
        <Savings goals={goals} />
        <MoneyStatus money={money} debt={data.debt?.total ?? 0} />

        {data.space && <ListRow icon="swap-horizontal" iconBg="#C7B8F5" title="Hesaplaşma" subtitle="Ortak harcamalarda kim kime borçlu" onPress={() => router.push('/settle')} />}
      </ScrollView>
    </View>
  );
}

// İlk ödenmemiş günün ödemeleri toplanır (aynı gün birden çok taksit olabilir)
function nextPayment(months: PlanMonth[]) {
  const today = todayIso();
  const items = months.flatMap((m) => m.items).filter((x) => !x.paid && x.date && x.date >= today);
  const date = items.reduce<string | null>((d, x) => (!d || x.date! < d ? x.date : d), null);
  if (!date) return undefined;
  const rows = groupPlanItems(items.filter((x) => x.date === date));
  return { date, total: rows.reduce((s, x) => s + x.amount, 0), count: rows.length, label: rows[0].label };
}

// Banka hesabı varsa: şu anki bakiye ve önümüzdeki ay sonları
function BankHero({ plan, data, money, onHelp }: { plan: MonthPlan; data: Summary; money?: MoneyOverview; onHelp: (m: string) => void }) {
  const c = useTheme();
  const bank = plan.bank!;
  const cycle = data.cycle;
  const months = plan.months.slice(0, 3);
  const neg = bank < 0;
  const payday = afterPayday(plan);
  // Kart harcaması bakiyeyi hemen düşürmez, ekstre ödenince düşer; bu yüzden kart borcu ayrıca gösterilir
  const cards = money?.accounts.filter((a) => a.kind === 'card') ?? [];
  // Kartın taksitleri ayrı kaynakta tutulur ("<kart adı> taksitleri"); ekstre kalemi bakiyede olduğu için sayılmaz
  const cardInstallments = (money?.months ?? []).flatMap((m) => m.items).filter((x) => !x.paidAt && cards.some((a) => x.source.startsWith(`${a.name} `) && x.source !== `${a.name} ekstresi`));
  const cardDebt = cards.reduce((s, a) => s + Math.max(0, -a.balance) + a.pending, 0) + cardInstallments.reduce((s, x) => s + x.amount, 0);
  return (
    <View style={{ borderRadius: 28, padding: 20, gap: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => onHelp(BANK_HELP)} accessibilityRole="button" accessibilityLabel="Bu rakam ne?" hitSlop={8}>
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: neg ? c.danger : c.success }} />
            <T v="label" muted>{neg ? 'Hesabın eksi' : 'Hesabında'}</T>
            <Ionicons name="information-circle-outline" size={15} color={c.faint} />
          </Row>
        </Pressable>
        {cycle && !cycle.paydayDue && (
          <View style={{ backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: c.primaryText, fontSize: 12, fontWeight: '800' }}>Maaşa {cycle.daysLeft} gün</Text>
          </View>
        )}
      </Row>
      <Money value={m0(bank)} v="display" color={neg ? c.danger : c.text} />
      {cards.length > 0 && (
        <Pressable onPress={() => onHelp(CARD_HELP)} accessibilityRole="button" accessibilityLabel="Kart borcu neden ayrı?">
          <Row gap={8}>
            <Stat label="Kart borcu" value={m0(cardDebt)} color={cardDebt > 0 ? c.danger : c.text} />
            <Stat label="Kart dahil net durum" value={m0(bank - cardDebt)} color={bank - cardDebt < 0 ? c.danger : c.success} align="right" />
          </Row>
        </Pressable>
      )}
      {payday && (
        <View style={{ backgroundColor: c.primary + '1C', borderRadius: 16, padding: 12, gap: 3 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="label" style={{ flexShrink: 1 }} numberOfLines={1}>{relativeDay(payday.date)} maaş yatınca</T>
            <Text numberOfLines={1} style={{ fontFamily: FONT.bold, fontSize: 18, letterSpacing: -0.3, color: payday.balance < 0 ? c.danger : c.success }}>{m0(payday.balance)}</Text>
          </Row>
          <T v="tiny" muted numberOfLines={1}>
            {m0(bank)}{payday.before > 0 ? ` − ${m0(payday.before)} ödeme` : ''} + {m0(payday.amount)} maaş
          </T>
          {payday.payments.length > 0 && (
            <>
              <View style={{ height: 1, backgroundColor: c.border, marginVertical: 7 }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" muted style={{ flexShrink: 1 }} numberOfLines={1}>{payday.payments.length} ödeme{payday.nextDate ? ` · ${relativeDay(payday.nextDate)} öncesi` : ''}</T>
                <T v="small">−{m0(payday.paymentsTotal)}</T>
              </Row>
              <T v="tiny" muted numberOfLines={2}>{payday.payments.map((x) => x.label).join(', ')}</T>
              <Row style={{ justifyContent: 'space-between', marginTop: 5 }}>
                <T v="label" style={{ flexShrink: 1 }} numberOfLines={1}>Ödemeler düşünce</T>
                <Text numberOfLines={1} style={{ fontFamily: FONT.bold, fontSize: 18, letterSpacing: -0.3, color: payday.afterPayments < 0 ? c.danger : c.success }}>{m0(payday.afterPayments)}</Text>
              </Row>
            </>
          )}
        </View>
      )}
      <View style={{ height: 1, backgroundColor: c.border }} />
      <Pressable onPress={() => onHelp(MONTH_END_HELP)} accessibilityRole="button" accessibilityLabel="Ay sonu nasıl hesaplanıyor?">
        <T v="tiny" muted style={{ marginBottom: 8 }}>Ay sonlarında hesabında</T>
        <Row gap={8}>
          {months.map((m, i) => (
            <Stat key={m.month} label={formatMonth(m.month, true)} value={m.closing === null ? '—' : m0(m.closing)} color={(m.closing ?? 0) < 0 ? c.danger : c.success} align={i === months.length - 1 ? 'right' : 'left'} />
          ))}
        </Row>
      </Pressable>
      <T v="small" muted>
        {neg
          ? plan.positiveMonth
            ? <>Bu gidişle <T v="small" color={c.text} style={{ fontWeight: '700' }}>{formatMonth(plan.positiveMonth, true)}</T> sonunda artıya geçiyorsun.</>
            : 'Bu gidişle 12 ayda artıya geçilmiyor. Harcamalar ve ödemeleri gözden geçir.'
          : 'Ödemeler ve tahmini günlük harcamalar düşüldükten sonra kalan.'}
      </T>
    </View>
  );
}

// Banka hesabı yoksa: bu ay harcanan
function SpendHero({ spending }: { spending?: Spending }) {
  const c = useTheme();
  return (
    <View style={{ borderRadius: 28, padding: 20, gap: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
      <T v="label" muted>Bu ay harcadın</T>
      <Money value={m0(spending?.total ?? 0)} v="display" />
      <ListRow icon="wallet-outline" iconBg="#A7D3F2" title="Banka hesabını ekle" subtitle="Bakiyeni ve ay sonunda ne kalacağını gör" onPress={() => router.push('/account?id=new')} />
    </View>
  );
}

// Son eklenen harcamalar: en yeni tarih en üstte; dokununca düzenlenir
function Recent({ items }: { items?: Transaction[] }) {
  const c = useTheme();
  if (!items) return null;
  return (
    <>
      <SectionTitle title="Son harcamalar" action="Tümü" onAction={() => router.push('/envelopes?view=activity')} />
      {items.length === 0 ? (
        <ListRow icon="add-circle-outline" title="Henüz harcama yok" subtitle="İlk harcamanı ekle, burada görünsün" onPress={() => router.push('/add')} />
      ) : (
        <Card style={{ gap: 2, paddingVertical: 8 }}>
          {items.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push(`/add?id=${t.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${t.note || t.envelopeName} ${formatMoney(t.amount)}, ${relativeDay(t.spentOn)}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 7 })}>
              <Row gap={12}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.envelopeColor + (c.scheme === 'dark' ? '26' : '55'), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{t.envelopeIcon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="label" numberOfLines={1}>{t.note || t.envelopeName}</T>
                  <T v="tiny" muted numberOfLines={1}>{t.note ? `${t.envelopeName} · ` : ''}{relativeDay(t.spentOn)}</T>
                </View>
                <T v="label">−{formatMoney(t.amount, { cents: t.amount % 100 !== 0 })}</T>
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}

// Bu ay en çok nereye gitti: tek şerit dağılım + ilk kategoriler
function ThisMonth({ spending }: { spending: Spending }) {
  const spent = spending.categories.filter((x) => x.total > 0);
  const top = spent.slice(0, 5);
  if (!top.length) return null;
  return (
    <>
      <SectionTitle title="Para nereye gitti" action="Tümü" onAction={() => router.push('/envelopes')} />
      <Card style={{ gap: 14 }} onPress={() => router.push('/envelopes')}>
        <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
          {spent.map((x) => (
            <View key={x.id} style={{ flex: Math.max(x.share, 0.01), backgroundColor: x.color }} />
          ))}
        </View>
        {top.map((x) => (
          <Row key={x.id} gap={10}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: x.color }} />
            <T v="small" style={{ flex: 1 }} numberOfLines={1}>{x.icon} {x.name}</T>
            <T v="tiny" muted>%{Math.round(x.share * 100)}</T>
            <T v="label" style={{ minWidth: 84, textAlign: 'right' }}>{m0(x.total)}</T>
          </Row>
        ))}
      </Card>
    </>
  );
}

function Tips({ tips }: { tips: Spending['tips'] }) {
  const c = useTheme();
  return (
    <>
      <SectionTitle title="Tasarruf önerileri" action="Tümü" onAction={() => router.push('/envelopes')} />
      {tips.map((tip) => (
        <Card key={tip.title} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={tip.icon as IconName} size={18} color={c.accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="label">{tip.title}</T>
            <T v="small" muted>{tip.text}</T>
          </View>
        </Card>
      ))}
    </>
  );
}

// Birikim hedefleri
function Savings({ goals }: { goals?: Goal[] }) {
  const c = useTheme();
  if (!goals) return null;
  const active = goals.filter((g) => !g.done).slice(0, 3);
  if (!active.length)
    return <ListRow icon="locate-outline" iconBg="#A8E6A1" title="Birikim hedefi oluştur" subtitle="Tatil, acil durum fonu ya da büyük bir alışveriş için biriktir" onPress={() => router.push('/goal/new')} />;
  return (
    <>
      <SectionTitle title="Birikim" action="Tümü" onAction={() => router.push('/goals')} />
      <Card style={{ gap: 14 }}>
        {active.map((g) => {
          const pct = g.target ? Math.min(1, g.saved / g.target) : 0;
          return (
            <Pressable key={g.id} onPress={() => router.push(`/goal/${g.id}`)} accessibilityRole="button" accessibilityLabel={`${g.name}: ${m0(g.saved)} / ${m0(g.target)}`} style={{ gap: 7 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="label" style={{ flex: 1 }} numberOfLines={1}>{g.icon} {g.name}</T>
                <T v="small" muted>%{Math.round(pct * 100)}</T>
              </Row>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
                <View style={{ height: 8, width: `${Math.max(pct * 100, 1)}%`, backgroundColor: g.color, borderRadius: 4 }} />
              </View>
              <T v="tiny" muted>{m0(g.saved)} / {m0(g.target)}</T>
            </Pressable>
          );
        })}
      </Card>
    </>
  );
}

// Bu ay ve gelecek ay ayrı kartlarda: tarih sırasıyla ödemeler ve maaş
function Upcoming({ months }: { months: PlanMonth[] }) {
  const today = todayIso();
  const shown = months.slice(0, 2).map((m, i) => {
    const payments = m.items.filter((x) => !x.paid && x.date && (x.date >= today || x.ref.type === 'schedule'));
    return { m, current: i === 0, rows: groupPlanItems(payments), total: payments.reduce((s, x) => s + x.amount, 0), income: m.income.amount > 0 && m.income.date >= today ? m.income : null };
  });
  if (!shown.some((x) => x.rows.length || x.income)) return null;
  return (
    <>
      <SectionTitle title="Yaklaşan ödemeler" action="Takvim" onAction={() => router.push('/payments')} />
      {shown.map((x) => (
        <UpcomingMonth key={x.m.month} {...x} />
      ))}
    </>
  );
}

function UpcomingMonth({ m, current, rows, total, income }: { m: PlanMonth; current: boolean; rows: PlanRow[]; total: number; income: PlanMonth['income'] | null }) {
  const c = useTheme();
  // Maaş, aynı günün ödemelerinden önce gelir
  const at = income ? rows.findIndex((r) => (r.date ?? '') >= income.date) : -1;
  const split = at < 0 ? rows.length : at;
  return (
    <Card style={{ gap: 14, borderColor: current ? c.accent : c.border, borderWidth: current ? 1.5 : 1 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8} style={{ flexShrink: 1 }}>
          <View style={{ backgroundColor: current ? c.primary : c.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: current ? c.primaryText : c.muted, fontSize: 11.5, fontWeight: '800' }}>{current ? 'Bu ay' : 'Gelecek ay'}</Text>
          </View>
          <T v="label" muted={!current} numberOfLines={1} style={{ flexShrink: 1 }}>{formatMonth(m.month, true)}</T>
        </Row>
        <T v="small" muted>{total > 0 ? `−${m0(total)}` : 'Ödeme yok'}</T>
      </Row>
      {rows.slice(0, split).map((row) => (
        <PlanRowView key={row.key} row={row} />
      ))}
      {income && (
        <Row gap={12}>
          <DateBadge iso={income.date} tone="accent" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="label" numberOfLines={1}>Maaş</T>
            <T v="tiny" muted numberOfLines={1}>Gelir · {relativeDay(income.date)}</T>
          </View>
          <T v="label" color={c.success}>+{m0(income.amount)}</T>
        </Row>
      )}
      {rows.slice(split).map((row) => (
        <PlanRowView key={row.key} row={row} />
      ))}
    </Card>
  );
}

// Hesaplar özeti: bankada kullanılabilir, kart limiti ve toplam borç
function MoneyStatus({ money, debt }: { money?: MoneyOverview; debt: number }) {
  const c = useTheme();
  if (!money) return null;
  if (!money.accounts.length)
    return <ListRow icon="wallet-outline" iconBg="#A7D3F2" title="Banka hesaplarını ekle" subtitle="Bakiyeni, kart limitini ve borçlarını tek yerde gör" onPress={() => router.push('/accounts')} />;
  return (
    <>
      <SectionTitle title="Hesaplar" action="Aç" onAction={() => router.push('/accounts')} />
      <Card onPress={() => router.push('/accounts')}>
        <Row gap={8}>
          <Stat label="Kullanılabilir" value={m0(money.totals.available)} />
          <Stat label="Kart limiti" value={m0(money.totals.cardAvailable)} />
          <Stat label="Toplam borç" value={m0(debt)} color={c.danger} align="right" />
        </Row>
      </Card>
    </>
  );
}

function TopBar({ data }: { data: Summary }) {
  const c = useTheme();
  const now = new Date();
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="small" muted>{DAYS_LONG[now.getDay()]}, {now.getDate()} {MONTHS_LONG[now.getMonth()]}</T>
        <T v="h2" numberOfLines={1}>{greeting()}, {data.user.name}</T>
      </View>
      <Row gap={8}>
        <Pressable onPress={() => router.push('/level')} accessibilityRole="button" accessibilityLabel={`Seri: ${data.streak} gün`}>
          <Row gap={4} style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 10, height: 36 }}>
            <Ionicons name="flame" size={16} color={data.streak > 0 ? '#FF9F43' : c.faint} />
            <T v="label">{data.streak}</T>
          </Row>
        </Pressable>
        <Pressable onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Menü">
          <Avatar index={data.user.avatar} size={40} />
        </Pressable>
      </Row>
    </Row>
  );
}
