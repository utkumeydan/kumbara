import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AmountSheet } from '@/components/AmountSheet';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, Empty, ErrorText, Header, IconTile, Loading, RoundButton, Row, Screen, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useDebts, useSummary, type Debt } from '@/lib/api';
import { DEBT_TYPES } from '@/lib/debt';
import { dayOfMonth, formatMoney, formatMonth, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

// Borçlarım: her borcun asgari ödemeyle ne zaman biteceği; ödemeler zarftan düşer ve bakiyeyi azaltır
export default function Debts() {
  const c = useTheme();
  const toast = useToast();
  const { data, error, refetch } = useDebts();
  const { data: summary } = useSummary();
  const [paying, setPaying] = useState<Debt | null>(null);
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const pay = useApiMutation((v: { id: string; amount: number; envelopeId: string }) => api<{ paid: number }>('POST', `/debts/${v.id}/pay`, { amount: v.amount, envelopeId: v.envelopeId }));

  if (!data) return <Loading error={error} onRetry={refetch} />;
  const total = data.reduce((s, d) => s + d.balance, 0);
  const monthly = data.reduce((s, d) => s + (d.balance > 0 ? d.monthlyPayment : 0), 0);

  function startPay(d: Debt) {
    setPaying(d);
    setEnvelopeId(d.envelopeId ?? summary?.envelopes[0]?.id ?? null);
  }

  return (
    <Screen
      header={
        <Header
          caption="Borç kapatma planı"
          title="Borçlarım"
          onClose={goBack}
          back
          right={<RoundButton icon="add" label="Borç ekle" bg={c.primary} color={c.primaryText} onPress={() => router.push('/debt/new')} />}
        />
      }>
      {data.length === 0 ? (
        <View style={{ gap: 14, marginTop: 20 }}>
          <Empty title="Ne kadar borcun var?" text="Kartlarını, kredilerini ve birine olan borçlarını ekle. Kumbara borcunun ne zaman biteceğini hesaplasın." />
          <Button title="Borç ekle" icon="add" onPress={() => router.push('/debt/new')} />
        </View>
      ) : (
        <>
          <T v="display">{formatMoney(total, { cents: false })}</T>
          <T muted style={{ marginTop: -8 }}>toplam borç · ayda {formatMoney(monthly, { cents: false })} ödüyorsun</T>
          <ErrorText error={pay.error} />
          {data.map((d) => {
            const type = DEBT_TYPES.find((t) => t.key === d.type)!;
            const isPaying = paying?.id === d.id;
            return (
              <Card key={d.id} style={{ gap: 12 }}>
                <Row gap={12}>
                  <IconTile icon={type.icon} bg={d.balance > 0 ? c.primary : c.success} />
                  <View style={{ flex: 1 }}>
                    <T v="label">{d.name}</T>
                    <T v="small" muted>
                      {type.label}
                      {d.dueDay ? ` · her ayın ${dayOfMonth(d.dueDay)}` : ''}
                      {d.auto ? ' · Banka durumundan' : ''}
                    </T>
                  </View>
                  <T v="h2">{formatMoney(d.balance, { cents: false })}</T>
                  <RoundButton icon="pencil" size={36} label={`${d.name} düzenle`} onPress={() => router.push(`/debt/${d.id}`)} />
                </Row>
                <View style={{ backgroundColor: c.cardAlt, borderRadius: 14, padding: 12 }}>
                  {d.balance <= 0 ? (
                    <T v="small" color={c.success}>🎉 Bu borç kapandı</T>
                  ) : d.scheduleSource && d.payoffDate ? (
                    <T v="small">
                      Sıradaki taksit {formatMoney(d.monthlyPayment, { cents: false })} · son taksit <T v="label">{formatMonth(d.payoffDate, true)}</T> · {d.months} ay kaldı
                    </T>
                  ) : d.payoffDate ? (
                    <T v="small">
                      Ayda {formatMoney(d.monthlyPayment, { cents: false })} ödersen bitiş: <T v="label">{formatMonth(d.payoffDate, true)}</T> · {d.months} ay
                      {d.totalInterest ? ` · ${formatMoney(d.totalInterest, { cents: false })} faiz` : ''}
                    </T>
                  ) : (
                    <T v="small" color={c.danger}>
                      {d.monthlyPayment > 0 ? 'Aylık ödemen faizi karşılamıyor; borç büyüyor.' : 'Aylık ödeme girersen bitiş tarihini hesaplayalım.'}
                    </T>
                  )}
                </View>
                {d.payments.length > 0 && (
                  <T v="small" muted>
                    Son ödeme: {formatMoney(d.payments[0].amount, { cents: false })} · {relativeDay(d.payments[0].spentOn)}
                  </T>
                )}
                {d.auto ? (
                  <Button title="Ödemelerde gör" kind="secondary" small onPress={() => router.push(d.scheduleSource ? '/payments' : '/accounts')} />
                ) : (
                  d.balance > 0 && summary?.cycle && !isPaying && <Button title="Ödeme yap" kind="secondary" small onPress={() => startPay(d)} />
                )}
                {isPaying && summary && (
                  <View style={{ gap: 10 }}>
                    <T v="tiny" muted>Hangi kategoriye yazılsın?</T>
                    <Wrap>
                      {summary.envelopes.map((e) => (
                        <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(e.id)} />
                      ))}
                    </Wrap>
                    <Row>
                      <Button title="Tutarı gir" style={{ flex: 1 }} disabled={!envelopeId} loading={pay.isPending} onPress={() => setSheet(true)} />
                      <Button title="Vazgeç" kind="ghost" onPress={() => setPaying(null)} />
                    </Row>
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
      <AmountSheet
        open={sheet && !!paying}
        title={paying ? `${paying.name} ödemesi` : ''}
        initial={paying ? Math.min(paying.monthlyPayment, paying.balance) : 0}
        max={paying?.balance}
        onClose={() => setSheet(false)}
        onDone={(k) => {
          setSheet(false);
          if (paying && envelopeId && k > 0)
            pay.mutate(
              { id: paying.id, amount: k, envelopeId },
              {
                onSuccess: (r) => {
                  setPaying(null);
                  toast({ message: `${formatMoney(r.paid, { cents: false })} ödeme kaydedildi` });
                },
              },
            );
        }}
      />
    </Screen>
  );
}
