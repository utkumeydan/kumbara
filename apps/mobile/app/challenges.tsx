import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Glass } from '@/components/Glass';
import { Card, Header, Loading, ProgressBar, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useBadges, useChallenges, type Challenge } from '@/lib/api';
import { formatDay, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

function challengeValue(ch: Challenge, v: number) {
  return ch.unit === 'gün' ? `${v} gün` : formatMoney(v, { cents: false });
}

// Haftalık meydan okumalar ve rozetler
export default function Challenges() {
  const c = useTheme();
  const challenges = useChallenges();
  const badges = useBadges();
  if (!challenges.data) return <Loading error={challenges.error} onRetry={challenges.refetch} />;
  const { current, previous, weekStart, weekEnd, completedTotal } = challenges.data;
  const earned = badges.data?.filter((b) => b.earned).length ?? 0;

  return (
    <Screen header={<Header caption={`${formatDay(weekStart)} – ${formatDay(weekEnd)}`} title="Meydan okumalar" onClose={goBack} back />}>
      <T muted>Her hafta üç yeni meydan okuma. Tamamladığın her biri kaplumbağana 50 XP kazandırır.</T>
      {current.map((ch) => (
        <ChallengeCard key={ch.code} ch={ch} />
      ))}

      {previous.length > 0 && (
        <>
          <SectionTitle title="Geçen hafta" />
          <Card style={{ gap: 10 }}>
            {previous.map((ch) => (
              <Row key={ch.code} gap={10}>
                <Ionicons name={ch.done ? 'checkmark-circle' : 'close-circle-outline'} size={20} color={ch.done ? c.success : c.faint} />
                <T v="small" style={{ flex: 1 }}>{ch.title}</T>
                <T v="tiny" muted>{ch.done ? '+50 XP' : 'olmadı'}</T>
              </Row>
            ))}
          </Card>
        </>
      )}
      <T v="small" muted>Şimdiye kadar {completedTotal} meydan okuma tamamladın.</T>

      <SectionTitle title={`Rozetler · ${earned}/${badges.data?.length ?? 0}`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {badges.data?.map((b) => (
          <Glass
            key={b.code}
            radius={22}
            intensity={25}
            style={{ flexBasis: '30%', flexGrow: 1, padding: 12, alignItems: 'center', gap: 6, opacity: b.earned ? 1 : 0.55 }}>
            <View accessibilityLabel={`${b.title}: ${b.earned ? 'kazanıldı' : 'henüz kazanılmadı'}`} style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 34 }}>{b.earned ? b.icon : '🔒'}</Text>
              <T v="tiny" style={{ textAlign: 'center' }}>{b.title}</T>
              <T v="tiny" muted style={{ textAlign: 'center', fontWeight: '400' }} numberOfLines={2}>{b.description}</T>
              {!b.earned && b.progress > 0 && (
                <View style={{ alignSelf: 'stretch' }}>
                  <ProgressBar value={b.progress} color={c.primary} height={4} />
                </View>
              )}
            </View>
          </Glass>
        ))}
      </View>
    </Screen>
  );
}

function ChallengeCard({ ch }: { ch: Challenge }) {
  const c = useTheme();
  const color = ch.done ? c.success : ch.failed ? c.danger : c.primary;
  return (
    <Card style={{ gap: 10 }}>
      <Row gap={10}>
        <Ionicons name={ch.done ? 'trophy' : ch.failed ? 'alert-circle-outline' : 'flag-outline'} size={22} color={color} />
        <T v="label" style={{ flex: 1 }}>{ch.title}</T>
        {ch.done && <T v="tiny" color={c.success}>+50 XP</T>}
      </Row>
      <T v="small" muted>{ch.description}</T>
      <ProgressBar value={ch.progress} color={color} height={8} />
      <T v="tiny" muted>
        {challengeValue(ch, ch.current)} / {challengeValue(ch, ch.target)}
        {ch.failed && !ch.done ? ' · bu hafta olmadı, haftaya yeniden' : ''}
        {ch.code.startsWith('cap:') && !ch.failed ? ' · hafta bitince değerlendirilir' : ''}
      </T>
    </Card>
  );
}
