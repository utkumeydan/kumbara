import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Header, ListRow, Loading, Screen, SectionTitle, T } from '@/components/ui';
import { useSpending, useSummary } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

// Kategoriler: harcamaların gruplandığı başlıklar. Sabit giderler (kira, aidat) aylık tutar ve günüyle Ödemeler'e yansır.
export default function Categories() {
  const c = useTheme();
  const { data, error, refetch } = useSummary();
  const { data: spending } = useSpending();
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const monthTotal = (id: string) => spending?.categories.find((x) => x.id === id)?.total ?? 0;
  const fixed = data.envelopes.filter((e) => e.kind === 'fixed');
  const variable = data.envelopes.filter((e) => e.kind !== 'fixed');

  const row = (e: (typeof data.envelopes)[number]) => (
    <ListRow
      key={e.id}
      leading={
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: e.color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>{e.icon}</Text>
        </View>
      }
      title={e.name}
      subtitle={
        e.kind === 'fixed'
          ? `Sabit gider${e.plannedAmount ? ` · ayda ${formatMoney(e.plannedAmount, { cents: false })}` : ''}${e.dueDay ? ` · ayın ${e.dueDay}'i` : ''}`
          : `Bu ay ${formatMoney(monthTotal(e.id), { cents: false })}`
      }
      onPress={() => router.push(`/envelope/${e.id}`)}
    />
  );

  return (
    <Screen header={<Header caption="Harcamalar" title="Kategoriler" onClose={goBack} back />} footer={<Button title="Yeni kategori" icon="add" onPress={() => router.push('/envelope/new')} />}>
      <T muted>Harcamalarını gruplamak için kategoriler. Sabit giderler aylık tutarı ve ödeme günüyle Ödemeler takvimine girer.</T>
      <SectionTitle title="Harcama kategorileri" />
      {variable.map(row)}
      {fixed.length > 0 && (
        <>
          <SectionTitle title="Sabit giderler" />
          {fixed.map(row)}
        </>
      )}
      <Card onPress={() => router.push('/archived')}>
        <T v="small" color={c.muted}>Arşivlenen kategoriler</T>
      </Card>
    </Screen>
  );
}
