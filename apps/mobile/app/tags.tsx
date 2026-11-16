import { router } from 'expo-router';
import { View } from 'react-native';
import { Shape, shapeFor } from '@/components/Shape';
import { Card, Empty, Header, Loading, ProgressBar, Row, Screen, T } from '@/components/ui';
import { useSummary, useTags } from '@/lib/api';
import { formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

// Etiketler: notlara yazılan #etiketlerin toplamları (ör. #tatil, #doğumgünü)
export default function Tags() {
  const c = useTheme();
  const { data, error, refetch } = useTags();
  const { data: summary } = useSummary();
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const max = Math.max(1, ...data.map((t) => t.total));

  return (
    <Screen header={<Header caption="Nereye gitti" title="Etiketler" onClose={goBack} back />}>
      <T muted>Harcama notuna #tatil gibi etiket yaz; hangi kategoride olduğuna bakmadan toplamı burada görürsün.</T>
      {data.length === 0 && <Empty title="Henüz etiket yok" text="Bir harcamanın notuna #etiket yazarak başla." />}
      {data.map((t) => (
        <Card key={t.tag} onPress={() => router.push(`/envelopes?tag=${encodeURIComponent(t.tag)}`)} style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h2">#{t.tag}</T>
            <T v="h2">{formatMoney(t.total, { cents: false })}</T>
          </Row>
          <ProgressBar value={t.total / max} color={c.primary} />
          <T v="small" muted>{t.count} harcama · son {relativeDay(t.last).toLocaleLowerCase('tr-TR')}</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {t.envelopes.slice(0, 4).map((e) => {
              const env = summary?.envelopes.find((x) => x.id === e.envelopeId);
              return (
                <Row key={e.envelopeId} gap={6}>
                  <Shape shape={shapeFor(e.envelopeId)} color={env?.color ?? c.faint} size={14} />
                  <T v="tiny" muted>{env?.name ?? 'Arşiv'} {formatMoney(e.total, { cents: false })}</T>
                  <View style={{ width: 6 }} />
                </Row>
              );
            })}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
