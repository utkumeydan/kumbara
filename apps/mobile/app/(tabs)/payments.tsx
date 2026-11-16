import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanRowView } from '@/components/PlanRowView';
import { Button, Card, Empty, Glow, Loading, Row, Segmented, T } from '@/components/ui';
import { usePlan, type PlanMonth } from '@/lib/api';
import { formatDay, formatMoney, formatMonth } from '@/lib/money';
import { afterPayday, DEBT_KINDS, groupPlanItems } from '@/lib/plan';
import { useTheme } from '@/lib/theme';

const m0 = (n: number) => formatMoney(n, { cents: false });

type Filter = 'all' | 'debt' | 'fixed';

// Ödemeler: takvim ayına göre her ödeme tarihiyle, gelirden düşünce cebe kalan
export default function Payments() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { data, error, refetch, isRefetching } = usePlan();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const months = data.months;
  const debt12 = months.reduce((s, m) => s + m.debtTotal, 0);
  const hasAny = months.some((m) => m.items.length);
  const isOpen = (m: PlanMonth, i: number) => open[m.month] ?? i < 2;
  const payday = afterPayday(data);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={c.muted} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="title">Ödemeler</T>
            <T v="small" muted>Ay ay ne ödenecek, hesabında ne kalacak</T>
          </View>
          <Button title="Ekle" icon="add" small kind="secondary" onPress={() => router.push('/schedule-import')} />
        </Row>

        {!hasAny ? (
          <Empty
            title="Henüz ödeme planı yok"
            text="Kart taksitlerini ve kredilerini bankadaki listeden yapıştır; kira gibi sabit giderler için sabit gider kategorisi oluştur."
            action="Taksitleri yapıştır"
            onAction={() => router.push('/schedule-import')}
          />
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              {data.bank !== null ? (
                <>
                  <T v="small" muted>Şu an hesabında (banka + nakit)</T>
                  <T v="display" color={data.bank < 0 ? c.danger : c.text}>{m0(data.bank)}</T>
                  <T v="small" muted>
                    {data.bank >= 0
                      ? 'Hesabın artıda; aşağıda her ay sonunda ne kadar kalacağını görürsün.'
                      : data.positiveMonth
                        ? `Bu gidişle eksi bakiyeden ${formatMonth(data.positiveMonth, true)} sonunda çıkıyorsun.`
                        : 'Bu gidişle 12 ay içinde eksi bakiyeden çıkılmıyor; ödemeleri ya da harcamaları gözden geçir.'}
                  </T>
                </>
              ) : (
                <T v="small" muted>Hesaplar sekmesinden banka bakiyeni eklersen her ay sonunda hesabında gerçekte ne kalacağını gösteririz.</T>
              )}
              {payday && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="label" style={{ flexShrink: 1 }} numberOfLines={1}>{formatDay(payday.date)} maaş yatınca</T>
                  <T v="label" color={payday.balance < 0 ? c.danger : c.success}>{m0(payday.balance)}</T>
                </Row>
              )}
              {payday && payday.payments.length > 0 && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="label" style={{ flexShrink: 1 }} numberOfLines={1}>Ödemeler düşünce</T>
                  <T v="label" color={payday.afterPayments < 0 ? c.danger : c.success}>{m0(payday.afterPayments)}</T>
                </Row>
              )}
              <T v="small" muted>
                12 ayda borç ödemelerin {m0(debt12)}
                {data.debtFreeMonth ? ` · taksit ve krediler ${formatMonth(data.debtFreeMonth, true)}’da bitiyor` : ''}
              </T>
              <FreeChart months={months} />
            </Card>

            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { key: 'all', label: 'Tümü' },
                { key: 'debt', label: 'Borçlar' },
                { key: 'fixed', label: 'Sabit giderler' },
              ]}
            />

            {months.map((m, i) => (
              <MonthCard key={m.month} m={m} current={i === 0} filter={filter} open={isOpen(m, i)} onToggle={() => setOpen({ ...open, [m.month]: !isOpen(m, i) })} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Her ay cebe kalan: sıfırın altı kırmızı
function FreeChart({ months }: { months: PlanMonth[] }) {
  const c = useTheme();
  const value = (m: PlanMonth) => m.closing ?? m.free;
  const max = Math.max(...months.map((m) => Math.abs(value(m))), 1);
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <T v="tiny" muted>{months[0]?.closing !== null ? 'Her ay sonunda hesabında' : 'Her ay maaştan artan'}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 70 }}>
        {months.map((m) => (
          <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${formatMonth(m.month, true)}: ${m0(value(m))}`}>
            <View style={{ width: '100%', height: Math.max(4, (Math.abs(value(m)) / max) * 54), borderRadius: 4, backgroundColor: value(m) < 0 ? c.danger : c.success, opacity: 0.85 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {months.map((m) => (
          <T key={m.month} v="tiny" muted style={{ flex: 1, textAlign: 'center', fontWeight: '400', fontSize: 9 }}>
            {formatMonth(m.month).split(' ')[0]}
          </T>
        ))}
      </View>
    </View>
  );
}

function MonthCard({ m, current, filter, open, onToggle }: { m: PlanMonth; current: boolean; filter: Filter; open: boolean; onToggle: () => void }) {
  const c = useTheme();
  const items = m.items.filter((x) => filter === 'all' || (filter === 'debt' ? DEBT_KINDS.has(x.kind) : !DEBT_KINDS.has(x.kind)));
  const spent = m.income.amount ? Math.min(100, (m.total / m.income.amount) * 100) : 100;
  return (
    <Card style={{ gap: 12 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${formatMonth(m.month, true)}, ay sonunda ${m0(m.closing ?? m.free)}`} style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <T v="h2">{formatMonth(m.month, true)}</T>
            {current && <T v="tiny" color={c.accent}>Bu ay</T>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="tiny" muted>{m.closing !== null ? 'Ay sonunda hesabında' : 'Maaştan artan'}</T>
            <T v="h2" color={(m.closing ?? m.free) < 0 ? c.danger : c.success}>{m0(m.closing ?? m.free)}</T>
          </View>
        </Row>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
          <View style={{ height: 8, width: `${spent}%`, backgroundColor: m.free < 0 ? c.danger : c.primary }} />
        </View>
        {m.opening !== null && <Line label={current ? 'Şu an hesabında' : 'Ay başı hesabında'} value={m0(m.opening)} color={m.opening < 0 ? c.danger : undefined} />}
        <Line
          label={`Maaş · ${formatDay(m.income.date)}${current && m.opening !== null && !m.incomeCounted ? ' (yattı)' : ''}`}
          value={current && m.opening !== null && !m.incomeCounted ? '—' : `+${m0(m.income.amount)}`}
          color={c.success}
        />
        <Line label="Borç ödemeleri" value={`−${m0(m.debtTotal)}`} />
        <Line label="Sabit giderler" value={`−${m0(m.fixedTotal)}`} />
        {m.spendingTotal > 0 && <Line label="Günlük harcamalar" value={`−${m0(m.spendingTotal)}`} />}
        {m.opening !== null && (
          <T v="tiny" muted style={{ fontWeight: '400' }}>
            {current ? `Bu ay için bugünden sonraki ${m0(m.paymentsCounted)} ödeme sayıldı. ` : ''}Maaştan artan: {m0(m.free)}
          </T>
        )}
        <Row style={{ justifyContent: 'center' }}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
          <T v="tiny" muted>{open ? 'Gizle' : `${m.items.length} ödeme`}</T>
        </Row>
      </Pressable>

      {open && (
        <View style={{ gap: 10 }}>
          {items.length === 0 && <T v="small" muted>Bu ay bu türde ödeme yok.</T>}
          {groupPlanItems(items).map((row) => (
            <PlanRowView key={row.key} row={row} />
          ))}
          {m.debtLeft > 0 && (
            <T v="tiny" muted style={{ fontWeight: '400' }}>
              Ay sonunda kalan taksit ve kredi borcu: {m0(m.debtLeft)}
            </T>
          )}
        </View>
      )}
    </Card>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T v="small" muted>{label}</T>
      <T v="small" color={color}>{value}</T>
    </Row>
  );
}
