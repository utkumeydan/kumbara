import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, TurtleFace } from '@/components/Turtle';
import { Card, Glow, IconTile, ListRow, ProgressBar, Row, SectionTitle, T, type IconName } from '@/components/ui';
import { useSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayOfMonth, formatMoney } from '@/lib/money';
import { useTheme } from '@/lib/theme';

export default function Menu() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data } = useSummary();
  const p = data?.progress;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <T v="title">Menü</T>

        <ListRow
          leading={<Avatar index={user?.avatar ?? 0} size={52} />}
          title={<T v="h2">{user?.name}</T>}
          subtitle={`🇹🇷 Türkiye · Maaş günü her ayın ${dayOfMonth(data?.user.paydayDay ?? user?.paydayDay ?? 1)}`}
          onPress={() => router.push('/settings')}
        />

        <Row gap={12} style={{ alignItems: 'stretch' }}>
          <Tile onPress={() => router.push('/level')}>
            <IconTile icon="happy-outline" bg="#F8D66D" />
            <T v="h2" style={{ marginTop: 14 }}>Seviye {p?.level ?? 1}</T>
            <T v="small" muted>{p && p.xp > 0 ? `${p.xp} XP` : 'Yeni başladın'}</T>
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={p ? (p.xp - p.levelStart) / Math.max(1, p.levelEnd - p.levelStart) : 0} color={c.text} height={4} />
            </View>
          </Tile>
          <Tile onPress={() => router.push('/level')}>
            <IconTile icon="flame" bg={c.primary} />
            <T v="h2" style={{ marginTop: 14 }}>{data?.streak ?? 0}</T>
            <T v="small" muted>{data?.streak ? 'günlük seri' : 'Serini başlat'}</T>
          </Tile>
        </Row>

        {data?.space && (
          <ListRow icon="people" iconBg="#C7B8F5" title={`${data.space.name} ortak bütçesindesin`} subtitle="Kişisel bütçene dönmek için dokun" onPress={() => router.push('/together')} />
        )}
        {user && !user.plus && (
          <Pressable onPress={() => router.push('/plus')} accessibilityRole="button" style={{ backgroundColor: c.primary, borderRadius: 26, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <T v="h2" color={c.primaryText}>Kumbara+’a geç</T>
              <T v="small" color={c.primaryText}>Sınırsız kategori · Gelişmiş analiz · Birlikte</T>
              <View style={{ alignSelf: 'flex-start', backgroundColor: c.primaryText, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 }}>
                <T v="tiny" color={c.primary}>İncele →</T>
              </View>
            </View>
            <TurtleFace size={92} stage={3} />
          </Pressable>
        )}

        <ListRow icon="trophy-outline" iconBg="#F8D66D" title="Meydan okumalar ve rozetler" subtitle="Bu haftanın hedefleri, kazandığın rozetler" onPress={() => router.push('/challenges')} />

        <SectionTitle title="İleriyi planla" />
        <Grid
          items={[
            { icon: 'calendar-outline', bg: '#FF8A73', title: 'Maaştan önce', text: 'Daha ne ödenecek', href: '/bills' },
            { icon: 'card-outline', bg: '#F8D66D', title: 'Taksitler', text: 'Taksitlerini yıl boyu gör', href: '/bills?mode=installments' },
            { icon: 'locate-outline', bg: '#A8E6A1', title: 'Hedefler', text: 'Biriktirdiğin her şey', href: '/goals' },
            { icon: 'cash-outline', bg: '#A7D3F2', title: 'Borçlarım', text: data?.debt ? `${formatMoney(data.debt.total, { cents: false })} borç` : 'Bitiş tarihini gör', href: '/debts' },
            { icon: 'people-outline', bg: '#C7B8F5', title: 'Birlikte', text: 'Bir kişiyle ortak harcamalar', href: '/together' },
            { icon: 'archive-outline', bg: '#E3C9A8', title: 'Arşiv', text: 'Arşivlenen kategoriler', href: '/archived' },
          ]}
        />

        <SectionTitle title="Harcamanı kaydet" />
        <ListRow icon="add" iconBg="#A8E6A1" title="Harcama ekle" subtitle="Yaz geç, birkaç saniye" onPress={() => router.push('/add')} />
        <ListRow icon="pricetags-outline" iconBg="#C7B8F5" title="Kategoriler" subtitle="Harcama kategorileri ve sabit giderler" onPress={() => router.push('/categories')} />
        <ListRow icon="cloud-upload-outline" iconBg="#A7D3F2" title="CSV'den içe aktar" subtitle="Başka bir uygulamadan ya da bankadan" onPress={() => router.push('/import')} />

        <SectionTitle title="Nereye gitti" />
        <Grid
          items={[
            { icon: 'time-outline', bg: '#FF8A73', title: 'Hareketler', text: 'Tüm harcamalar, aramayla', href: '/envelopes' },
            { icon: 'pie-chart-outline', bg: '#F8D66D', title: 'Analiz', text: 'Maaş dönemleri arası eğilimler', href: '/analysis' },
            { icon: 'sparkles-outline', bg: '#C7B8F5', title: 'Wrapped', text: 'Dönemin bir hikâye olarak', href: '/wrapped' },
            { icon: 'repeat', bg: '#F7B49A', title: 'Abonelikler', text: 'Tekrarlayan harcamalar ve yıllık maliyet', href: '/subscriptions' },
            { icon: 'pricetags-outline', bg: '#8FD9CF', title: 'Etiketler', text: '#tatil gibi etiketlerin toplamı', href: '/tags' },
          ]}
        />

        <SectionTitle title="Ayarlar ve yardım" />
        <Card style={{ paddingVertical: 4 }}>
          <MenuLine icon="settings-outline" title="Ayarlar" onPress={() => router.push('/settings')} />
          <MenuLine icon="download-outline" title="İşlemleri dışa aktar (CSV)" onPress={() => router.push('/settings')} last />
        </Card>
        <T v="tiny" muted style={{ textAlign: 'center', marginTop: 10 }}>Kumbara · v1.2</T>
      </ScrollView>
    </View>
  );
}

function Tile({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, backgroundColor: c.card, borderRadius: 22, padding: 16, opacity: pressed ? 0.85 : 1 })}>
      <Ionicons name="chevron-forward" size={16} color={c.muted} style={{ position: 'absolute', top: 16, right: 14 }} />
      {children}
    </Pressable>
  );
}

function Grid({ items }: { items: { icon: IconName; bg: string; title: string; text: string; href: Href }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((i) => (
        <View key={i.title} style={{ flexBasis: '47%', flexGrow: 1 }}>
          <Card onPress={() => router.push(i.href)} style={{ minHeight: 130, justifyContent: 'space-between' }}>
            <IconTile icon={i.icon} bg={i.bg} />
            <View>
              <T v="label">{i.title}</T>
              <T v="small" muted>{i.text}</T>
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

function MenuLine({ icon, title, onPress, last }: { icon: IconName; title: string; onPress: () => void; last?: boolean }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderColor: c.border }}>
      <Row gap={12}>
        <Ionicons name={icon} size={20} color={c.text} />
        <T v="label" style={{ flex: 1 }}>{title}</T>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </Row>
    </Pressable>
  );
}
