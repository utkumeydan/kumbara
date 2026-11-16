import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { Button, Card, Empty, ErrorText, Header, ListRow, Loading, ProgressBar, RoundButton, Row, Screen, Segmented, T } from '@/components/ui';
import { api, useApiMutation, useBills, useSummary } from '@/lib/api';
import { formatDay, formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { FONT, useTheme } from '@/lib/theme';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Maaştan önce ödenecekler; ?mode=installments ile taksit görünümü
export default function Bills() {
  const c = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const installments = mode === 'installments';
  const billsQ = useBills();
  const summaryQ = useSummary();
  const bills = billsQ.data;
  const summary = summaryQ.data;
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const pay = useApiMutation((id: string) => api('POST', `/bills/${id}/pay`, {}));

  if (!bills || !summary) return <Loading error={billsQ.error ?? summaryQ.error} onRetry={() => (billsQ.refetch(), summaryQ.refetch())} />;
  const add = <RoundButton icon="add" bg={c.primary} color={c.primaryText} onPress={() => router.push(`/bill/new${installments ? '?installment=1' : ''}`)} />;

  if (installments) {
    const list = bills.filter((b) => b.installmentsTotal);
    // Önümüzdeki 12 ay için taksitlere şimdiden bağlanmış tutar
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const total = list.filter((b) => b.active && b.installmentsTotal! - b.installmentsPaid > i).reduce((s, b) => s + b.amount, 0);
      return { label: MONTHS[(now.getMonth() + i) % 12], total };
    });
    return (
      <Screen header={<Header caption="Aylara göre" title="Taksitler" onClose={goBack} back right={add} />}>
        {list.length === 0 ? (
          <Empty title="Taksit yok" text="Taksitli alışverişlerini ekle; her ay ne kadarının şimdiden bağlı olduğunu görelim." action="Taksit ekle" onAction={() => router.push('/bill/new?installment=1')} />
        ) : (
          <>
            <T v="display">{formatMoney(months[0].total, { cents: false })}</T>
            <T muted style={{ marginTop: -8 }}>bu ay taksitlere gidiyor</T>
            <Card style={{ gap: 10 }}>
              <T v="label">Önümüzdeki 12 ay</T>
              <BarChart data={months.map((m) => m.total)} color={c.primary} height={110} />
              <Row style={{ justifyContent: 'space-between' }}>
                {months.map((m, i) => (
                  <Text key={i} style={{ color: c.muted, fontSize: 9 }}>{m.label}</Text>
                ))}
              </Row>
            </Card>
            {list.map((b) => (
              <Card key={b.id} onPress={() => router.push(`/bill/${b.id}`)} style={{ gap: 10, opacity: b.active ? 1 : 0.5 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="label">{b.name}</T>
                  <T v="label">{formatMoney(b.amount)} / ay</T>
                </Row>
                <ProgressBar value={b.installmentsPaid / b.installmentsTotal!} color={c.primary} />
                <T v="small" muted>
                  {b.installmentsPaid}/{b.installmentsTotal} ödendi · kalan {formatMoney((b.installmentsTotal! - b.installmentsPaid) * b.amount, { cents: false })}
                </T>
              </Card>
            ))}
          </>
        )}
      </Screen>
    );
  }

  const due = bills.filter((b) => b.active && b.dueDate && !b.paidThisCycle).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  // Faturalar, ödeme günü olan sabit zarflar ve borç taksitleri birlikte sayılır
  const dueTotal = due.reduce((s, b) => s + b.amount, 0) + summary.fixedDue.reduce((s, f) => s + f.amount, 0) + summary.debtsDue.reduce((s, d) => s + d.amount, 0);
  const others = [
    ...summary.fixedDue.map((f) => ({ key: `f:${f.envelopeId}`, title: `${f.icon} ${f.name}`, sub: 'Sabit gider', amount: f.amount, dueDate: f.dueDate, onPay: () => router.push(`/add?envelopeId=${f.envelopeId}&amount=${f.amount / 100}&note=${encodeURIComponent(f.name)}`) })),
    ...summary.debtsDue.map((d) => ({ key: `d:${d.debtId}`, title: `💳 ${d.name}`, sub: 'Borç taksidi', amount: d.amount, dueDate: d.dueDate, onPay: () => router.push('/debts') })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const free = summary.left - dueTotal;
  const end = summary.cycle?.nextPayday;

  return (
    <Screen header={<Header caption="Yaklaşanlar" title="Maaştan önce" onClose={goBack} back right={add} />}>
      <T v="display" color={free < 0 ? c.danger : c.text}>{formatMoney(free, { cents: false })}</T>
      <Text style={{ fontSize: 22, fontFamily: FONT.display, color: c.muted, marginTop: -8 }}>harcamaya serbest.</Text>
      <T v="small" muted>
        {end ? `${formatDay(end)} öncesi ` : ''}
        {dueTotal > 0 ? `${formatMoney(dueTotal, { cents: false })} ödenecek` : 'başka ödeme yok'}
      </T>
      <ListRow icon="card-outline" iconBg={c.cardAlt} title="Taksitler" subtitle="Aylara göre şimdiden bağlanmış tutar" onPress={() => router.push('/bills?mode=installments')} />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { key: 'list', label: 'Liste', icon: 'list' },
          { key: 'calendar', label: 'Takvim', icon: 'calendar-outline' },
        ]}
      />
      <ErrorText error={pay.error} />

      {view === 'list' && others.length > 0 && (
        <Card style={{ gap: 14 }}>
          <T v="tiny" muted>Sabit giderler ve borçlar</T>
          {others.map((o) => (
            <Row key={o.key} gap={12}>
              <View style={{ flex: 1 }}>
                <T v="label">{o.title}</T>
                <T v="small" muted>{o.sub} · {relativeDay(o.dueDate)}</T>
              </View>
              <T v="label">{formatMoney(o.amount, { cents: false })}</T>
              <Button title="Öde" kind="secondary" small onPress={o.onPay} />
            </Row>
          ))}
        </Card>
      )}

      {bills.length === 0 && others.length === 0 ? (
        <Empty title="Ufukta bir şey yok" text="Bir fatura ya da sabit ödeme ekle, burada maaşa kadar sayarak görünsün." action="Fatura ekle" onAction={() => router.push('/bill/new')} />
      ) : view === 'calendar' && summary.cycle ? (
        <Calendar
          start={summary.cycle.startDate}
          end={summary.cycle.endDate}
          today={summary.cycle.today}
          items={[
            ...bills.filter((b) => b.dueDate).map((b) => ({ date: b.dueDate!, label: b.name, amount: b.amount })),
            ...others.map((o) => ({ date: o.dueDate, label: o.title, amount: o.amount })),
          ]}
        />
      ) : (
        bills.map((b) => (
          <Card key={b.id} onPress={() => router.push(`/bill/${b.id}`)} style={{ gap: 10, opacity: b.active ? 1 : 0.5 }}>
            <Row gap={12}>
              <View style={{ width: 46, alignItems: 'center' }}>
                <T v="h2">{b.dueDay}</T>
                <T v="tiny" muted>her ay</T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="label">{b.name}</T>
                <T v="small" muted>
                  {!b.active ? 'Tamamlandı' : b.paidThisCycle ? 'Bu dönem ödendi ✓' : b.dueDate ? relativeDay(b.dueDate) : 'Bu dönem yok'}
                  {b.installmentsTotal ? ` · ${b.installmentsPaid}/${b.installmentsTotal} taksit` : ''}
                </T>
              </View>
              <T v="label">{formatMoney(b.amount)}</T>
            </Row>
            {b.active && b.dueDate && !b.paidThisCycle && (
              <Button
                title={b.envelopeId ? 'Ödendi olarak işaretle' : 'Önce kategori seç'}
                kind="secondary"
                small
                loading={pay.isPending && pay.variables === b.id}
                onPress={() => (b.envelopeId ? pay.mutate(b.id) : router.push(`/bill/${b.id}`))}
              />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

// Dönem günlerini 7 sütunlu takvimde gösterir; ödeme günleri işaretli
function Calendar({ start, end, today, items }: { start: string; end: string; today: string; items: { date: string; label: string; amount: number }[] }) {
  const c = useTheme();
  const days: string[] = [];
  for (let d = new Date(start + 'T12:00:00'); d.toISOString().slice(0, 10) <= end; d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const offset = (new Date(start + 'T12:00:00').getDay() + 6) % 7;
  const byDate = new Map<string, typeof items>();
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 11, fontWeight: '700' }}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: offset }, (_, i) => (
          <View key={`e${i}`} style={{ width: '14.28%', height: 46 }} />
        ))}
        {days.map((d) => {
          const has = byDate.get(d);
          return (
            <View key={d} style={{ width: '14.28%', height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: has ? c.primary : d === today ? c.cardAlt : 'transparent' }}>
                <Text style={{ color: has ? c.primaryText : d < today ? c.faint : c.text, fontWeight: '700', fontSize: 13 }}>{Number(d.slice(8))}</Text>
              </View>
            </View>
          );
        })}
      </View>
      {[...byDate.entries()].sort().map(([d, list]) => (
        <Row key={d} style={{ justifyContent: 'space-between' }}>
          <T v="small" muted>{formatDay(d)}</T>
          <T v="small">{list.map((b) => `${b.label} ${formatMoney(b.amount, { cents: false })}`).join(', ')}</T>
        </Row>
      ))}
    </Card>
  );
}
