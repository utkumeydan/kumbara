import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Shape } from '@/components/Shape';
import { Card, Empty, Header, Loading, ProgressBar, RoundButton, Row, Screen, T } from '@/components/ui';
import { useGoals } from '@/lib/api';
import { formatDay, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

export default function Goals() {
  const c = useTheme();
  const { data, error, refetch } = useGoals();
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const year = new Date().getFullYear();
  const hasYearEnd = data.some((g) => g.deadline === `${year}-12-31`);

  return (
    <Screen
      header={
        <Header caption="Uzun vade" title="Hedefler" onClose={goBack} back right={<RoundButton icon="add" bg={c.primary} color={c.primaryText} onPress={() => router.push('/goal/new')} />} />
      }>
      {!hasYearEnd && (
        <Card onPress={() => router.push(`/goal/new?deadline=${year}-12-31`)} style={{ backgroundColor: c.primary }}>
          <Text style={{ color: c.primaryText, fontWeight: '800', fontSize: 18 }}>🏁 Yıl sonuna kadar biriktir</Text>
          <Text style={{ color: c.primaryText, marginTop: 4, fontSize: 13 }}>31 Aralık’a kadar bir hedef koy; her maaştan ne kadar ayırman gerektiğini hesaplayalım.</Text>
        </Card>
      )}
      {data.length === 0 ? (
        <Empty title="Ufukta henüz bir şey yok" text="Hedef, gideceği yer olan bir cep. Adını koy, ne zaman varacağını söyleyelim." action="Yeni hedef" onAction={() => router.push('/goal/new')} />
      ) : (
        data.map((g) => (
          <Card key={g.id} onPress={() => router.push(`/goal/${g.id}`)} style={{ gap: 12 }}>
            <Row gap={12}>
              <Shape shape="circle" color={g.color} size={44} />
              <View style={{ flex: 1 }}>
                <T v="label">{g.icon} {g.name}</T>
                <T v="small" muted>{formatMoney(g.saved, { cents: false })} / {formatMoney(g.target, { cents: false })}</T>
              </View>
              <T v="h2">{g.done ? '🎉' : `%${Math.floor((g.saved / g.target) * 100)}`}</T>
            </Row>
            <ProgressBar value={g.saved / g.target} color={g.color} height={8} />
            {!g.done && (
              <T v="small" muted>
                {g.perPaycheck ? `Her maaştan ${formatMoney(g.perPaycheck, { cents: false })} ayır` : ''}
                {g.deadline ? `${g.perPaycheck ? ' · ' : ''}Hedef ${formatDay(g.deadline, true)}` : ''}
                {g.projectedDate ? ` · Bu hızla ${formatDay(g.projectedDate, true)}` : ''}
                {!g.deadline && !g.projectedDate ? 'İlk katkını yaparak başla' : ''}
              </T>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}
