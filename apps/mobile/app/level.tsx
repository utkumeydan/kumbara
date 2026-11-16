import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Turtle, turtleLabel } from '@/components/Turtle';
import { Button, Card, Header, Loading, ProgressBar, Row, Screen, T, type IconName } from '@/components/ui';
import { useSummary } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { FONT, useTheme } from '@/lib/theme';

const SOURCES: { key: 'saving' | 'goalDone' | 'activeDay' | 'expense' | 'challenge'; title: string; per: number; icon: IconName }[] = [
  { key: 'challenge', title: 'Meydan okumalar', per: 50, icon: 'trophy-outline' },
  { key: 'saving', title: 'Biriktirmekten', per: 4, icon: 'wallet-outline' },
  { key: 'goalDone', title: 'Tutan hedefler', per: 120, icon: 'locate-outline' },
  { key: 'activeDay', title: 'Seri günleri', per: 12, icon: 'flame-outline' },
  { key: 'expense', title: 'Kaydedilen harcamalar', per: 6, icon: 'receipt-outline' },
];

// Kaplumbağan: XP, seviye ve kaplumbağanın büyüme evreleri
export default function Level() {
  const c = useTheme();
  const { data, error, refetch } = useSummary();
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const p = data.progress;

  return (
    <Screen header={<Header title="Kaplumbağan" onClose={goBack} back />}>
      <View style={{ backgroundColor: '#C7B8F5', borderRadius: 28, padding: 20, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: c.onPastel, fontWeight: '800', fontSize: 15 }}>Seviye {p.level}</Text>
          <Text style={{ color: c.onPastel, fontWeight: '700', fontSize: 13 }}>🔥 {data.streak} gün</Text>
        </Row>
        <Text style={{ color: c.onPastel, fontSize: 56, fontFamily: FONT.display, letterSpacing: -2 }}>
          {p.xp} <Text style={{ fontSize: 22 }}>XP</Text>
        </Text>
        <ProgressBar value={(p.xp - p.levelStart) / Math.max(1, p.levelEnd - p.levelStart)} color={c.onPastel} track="#00000022" />
        <Text style={{ color: c.onPastel, fontSize: 12 }}>Seviye {p.level + 1} için {p.levelEnd} XP</Text>
      </View>

      <T v="tiny" muted style={{ marginTop: 6 }}>Kaplumbağanın büyümesini izle</T>
      <Row style={{ justifyContent: 'space-between' }}>
        {[0, 1, 2, 3, 4].map((s) => (
          <View key={s} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ borderWidth: 2, borderColor: s === p.mascotStage ? c.primary : 'transparent', borderRadius: 40, padding: 2 }}>
              <Turtle stage={s} size={0.75} locked={s > p.mascotStage} />
            </View>
            <T v="tiny" muted>{s + 1}</T>
          </View>
        ))}
      </Row>
      <T v="small" muted>{turtleLabel(p.mascotStage)}. Her seviyede kaplumbağan biraz daha büyür. Devam et.</T>

      <T v="tiny" muted style={{ marginTop: 6 }}>Kaplumbağanı büyütenler</T>
      <Card style={{ paddingVertical: 4 }}>
        {SOURCES.map((s, i) => (
          <Row key={s.key} gap={12} style={{ paddingVertical: 14, borderBottomWidth: i < SOURCES.length - 1 ? 1 : 0, borderColor: c.border }}>
            <Ionicons name={s.icon} size={20} color={c.muted} />
            <View style={{ flex: 1 }}>
              <T v="label">{s.title}</T>
              <T v="small" muted>{p.sources[s.key].count} × {s.per} XP</T>
            </View>
            <T v="label">+{p.sources[s.key].xp}</T>
          </Row>
        ))}
      </Card>
      <T v="small" muted>Kaplumbağanı daha hızlı büyütmek için her gün harcama kaydet, haftalık meydan okumaları tamamla ve birikim hedeflerini tuttur.</T>
      <Button title="Meydan okumalar ve rozetler" icon="trophy-outline" kind="secondary" onPress={() => router.push('/challenges')} />
    </Screen>
  );
}
