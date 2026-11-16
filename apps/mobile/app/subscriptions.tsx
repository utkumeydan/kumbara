import { router } from 'expo-router';
import { View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ErrorText, Header, IconTile, Loading, Money, Row, Screen, SectionTitle, T } from '@/components/ui';
import { api, useApiMutation, useBills, useSubscriptions, useSummary } from '@/lib/api';
import { dayOfMonth, formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';

// Abonelik dedektörü: her ay benzer tutarla tekrarlanan harcamalar ve yıllık maliyetleri
export default function Subscriptions() {
  const toast = useToast();
  const { data, error, refetch } = useSubscriptions();
  const { data: bills } = useBills();
  const { data: summary } = useSummary();
  const track = useApiMutation((s: { name: string; amount: number; dueDay: number; envelopeId: string }) => api('POST', '/bills', s));

  if (!data) return <Loading error={error} onRetry={refetch} />;
  const untracked = data.detected.filter((d) => !d.tracked);
  const recurring = (bills ?? []).filter((b) => b.active && !b.installmentsTotal);
  const yearly = data.yearlyDetected + data.yearlyBills;

  return (
    <Screen header={<Header caption="Nereye gitti" title="Abonelikler" onClose={goBack} back />}>
      <T muted>Her ay benzer tutarla tekrarlanan harcamalar ve kayıtlı düzenli faturalar.</T>
      <Card style={{ gap: 4 }}>
        <T v="small" muted>Yılda toplam</T>
        <Money value={formatMoney(yearly, { cents: false })} v="display" />
        <T v="small" muted>ayda yaklaşık {formatMoney(Math.round(yearly / 12), { cents: false })}</T>
      </Card>

      {untracked.length > 0 && <SectionTitle title="Bulunan abonelikler" />}
      {untracked.map((d) => {
        const env = summary?.envelopes.find((e) => e.id === d.envelopeId);
        return (
          <Card key={d.key} style={{ gap: 10 }}>
            <Row gap={12}>
              <IconTile icon="repeat" bg={env?.color ?? '#C7B8F5'} />
              <View style={{ flex: 1 }}>
                <T v="label">{d.name}</T>
                <T v="small" muted>
                  {d.months} aydır · her ayın {dayOfMonth(d.dueDay)} civarı · son {relativeDay(d.lastDate)}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T v="label">{formatMoney(d.amount, { cents: false })}/ay</T>
                <T v="small" muted>{formatMoney(d.yearly, { cents: false })}/yıl</T>
              </View>
            </Row>
            <Button
              title="Faturaya çevir"
              small
              kind="secondary"
              loading={track.isPending && track.variables?.name === d.name}
              onPress={() =>
                track.mutate(
                  { name: d.name, amount: d.amount, dueDay: d.dueDay, envelopeId: d.envelopeId },
                  { onSuccess: () => toast({ message: `${d.name} Maaştan önce listesine eklendi` }) },
                )
              }
            />
          </Card>
        );
      })}
      <ErrorText error={track.error} />

      {recurring.length > 0 && <SectionTitle title="Takip edilen faturalar" />}
      {recurring.map((b) => (
        <Card key={b.id} onPress={() => router.push(`/bill/${b.id}`)}>
          <Row gap={12}>
            <IconTile icon="calendar-outline" bg="#A7D3F2" />
            <View style={{ flex: 1 }}>
              <T v="label">{b.name}</T>
              <T v="small" muted>her ayın {dayOfMonth(b.dueDay)}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="label">{formatMoney(b.amount, { cents: false })}/ay</T>
              <T v="small" muted>{formatMoney(b.amount * 12, { cents: false })}/yıl</T>
            </View>
          </Row>
        </Card>
      ))}

      {untracked.length === 0 && recurring.length === 0 && (
        <Empty title="Henüz abonelik bulunmadı" text="Aynı notla (ör. Netflix, Spotify) birkaç ay kayıt tutunca burada otomatik görünür." />
      )}
    </Screen>
  );
}
