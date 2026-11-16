import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TurtleFace } from '@/components/Turtle';
import { Button, Chip, Empty, Loading, RoundButton } from '@/components/ui';
import { useWrapped, type Wrapped as W } from '@/lib/api';
import { formatDay, formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { FONT, useTheme } from '@/lib/theme';

const COLORS = ['#C7B8F5', '#F8D66D', '#A8E6A1', '#F7B49A', '#A7D3F2', '#F4A7C4', '#8FD9CF', '#FF6B57'];
const INK = '#16161A';

// Wrapped: bir dönemin hikâyesi, kaydırılabilir kartlar halinde
export default function Wrapped() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [cycleId, setCycleId] = useState<string>();
  const [page, setPage] = useState(0);
  const { data, error, refetch } = useWrapped(cycleId);
  const cardW = Math.min(width, 560);
  // Üstteki ilerleme çubukları ve dönem seçicisi dışındaki tüm yükseklik
  const cardH = Math.max(420, height - insets.top - insets.bottom - 90);

  if (!data) return <Loading error={error} onRetry={refetch} />;
  if (!data.cycle || data.count === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
        <RoundButton icon="close" onPress={goBack} />
        <Empty title="Henüz anlatacak bir hikâye yok" text="Birkaç harcama kaydettikten sonra dönemin özetini burada göreceksin." />
      </View>
    );
  }

  const cards = buildCards(data);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {/* Hikâye ilerleme çubukları */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {cards.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= page ? c.text : c.cardAlt }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 1 }}>
            {data.cycles.slice(0, 6).map((x) => (
              <Chip key={x.id} label={`${formatDay(x.startDate)} – ${formatDay(x.endDate)}`} active={x.id === data.cycle!.id} onPress={() => (setCycleId(x.id), setPage(0))} />
            ))}
          </ScrollView>
          <RoundButton icon="close" onPress={goBack} />
        </View>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / cardW))}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / cardW))}
        scrollEventThrottle={64}
        style={{ flexGrow: 1, width: cardW, alignSelf: 'center' }}>
        {cards.map((card, i) => (
          <View key={i} style={{ width: cardW, height: cardH, padding: 16 }}>
            <View style={{ flex: 1, backgroundColor: COLORS[i % COLORS.length], borderRadius: 32, padding: 26, justifyContent: 'space-between' }}>{card}</View>
          </View>
        ))}
      </ScrollView>
      <Pressable accessibilityLabel="Sonraki kart" style={{ position: 'absolute', right: 0, top: 120, bottom: 120, width: 60 }} onPress={() => setPage((p) => Math.min(p + 1, cards.length - 1))} />
    </View>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <Text style={{ color: INK, fontSize: 52, fontFamily: FONT.display, letterSpacing: -2 }}>{children}</Text>;
}
function Line({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <Text style={{ color: INK, opacity: dim ? 0.6 : 1, fontSize: 24, fontFamily: FONT.display, letterSpacing: -0.6, lineHeight: 30 }}>{children}</Text>;
}
function Small({ children }: { children: ReactNode }) {
  return <Text style={{ color: INK, opacity: 0.7, fontSize: 14, fontWeight: '600' }}>{children}</Text>;
}

function buildCards(w: W): ReactNode[] {
  const m = (k: number) => formatMoney(k, { cents: false });
  const range = `${formatDay(w.cycle!.startDate)} – ${formatDay(w.cycle!.endDate)}`;
  const top = w.topEnvelopes[0];
  const share = `Kumbara dönem özetim (${range}): ${m(w.total)} harcadım, ${w.noSpendDays} gün hiç harcama yapmadım, en uzun serim ${w.longestStreak} gün${
    w.saved > 0 ? `, ${m(w.saved)} biriktirdim` : ''
  }. 🐢`;
  const cards: ReactNode[] = [
    <>
      <Small>{range}</Small>
      <View style={{ alignItems: 'center' }}>
        <TurtleFace size={160} stage={2} />
      </View>
      <Line>
        Dönemin hikâyesi hazır.{'\n'}
        <Text style={{ opacity: 0.6 }}>Kaydır ve gör.</Text>
      </Line>
    </>,
    <>
      <Small>Bu dönem</Small>
      <View>
        <Big>{m(w.total)}</Big>
        <Line dim>harcadın, {w.count} kayıtla.</Line>
      </View>
      <Small>Günde ortalama {m(w.avgDaily)}</Small>
    </>,
  ];
  if (w.income > 0) {
    cards.push(
      <>
        <Small>Gelirinin</Small>
        <View>
          <Big>%{Math.max(0, Math.round((w.kept / w.income) * 100))}</Big>
          <Line dim>{w.kept >= 0 ? `cebinde kaldı: ${m(w.kept)}` : `fazlası harcandı: ${m(-w.kept)}`}</Line>
        </View>
        <Small>Gelir {m(w.income)}</Small>
      </>,
    );
  }
  if (top) {
    cards.push(
      <>
        <Small>En çok buraya gitti</Small>
        <View>
          <Text style={{ fontSize: 64 }}>{top.icon}</Text>
          <Big>{top.name}</Big>
          <Line dim>{m(top.spent)} · {top.count} harcama</Line>
        </View>
        <Small>{w.topEnvelopes.slice(1).map((e) => `${e.icon} ${e.name} ${m(e.spent)}`).join('  ·  ')}</Small>
      </>,
    );
  }
  cards.push(
    <>
      <Small>Harcamasız günler</Small>
      <View>
        <Big>{w.noSpendDays} gün</Big>
        <Line dim>cüzdanını hiç açmadın. 👏</Line>
      </View>
      <Small>En uzun kayıt serin: {w.longestStreak} gün 🔥</Small>
    </>,
  );
  if (w.biggestDay) {
    cards.push(
      <>
        <Small>En yoğun gün</Small>
        <View>
          <Big>{relativeDay(w.biggestDay.day)}</Big>
          <Line dim>{m(w.biggestDay.spent)} harcadın.</Line>
        </View>
        {w.biggestExpense && (
          <Small>
            Tek seferde en büyük: {w.biggestExpense.icon} {w.biggestExpense.note || w.biggestExpense.name} · {m(w.biggestExpense.amount)}
          </Small>
        )}
      </>,
    );
  }
  if (w.topNote && w.topNote.count > 1) {
    cards.push(
      <>
        <Small>Favorin</Small>
        <View>
          <Big>{w.topNote.note}</Big>
          <Line dim>{w.topNote.count} kez, toplam {m(w.topNote.spent)}</Line>
        </View>
        <Small>Sık gittiğin yerler bütçenin sessiz kahramanları.</Small>
      </>,
    );
  }
  if (w.saved > 0 || w.previousTotal !== null) {
    const diff = w.previousTotal ? Math.round(((w.total - w.previousTotal) / w.previousTotal) * 100) : null;
    cards.push(
      <>
        <Small>Ve dahası</Small>
        <View style={{ gap: 12 }}>
          {w.saved > 0 && <Line>Hedeflerine {m(w.saved)} koydun. 🎯</Line>}
          {diff !== null && <Line dim>{diff <= 0 ? `Önceki döneme göre %${Math.abs(diff)} daha az harcadın.` : `Önceki döneme göre %${diff} daha fazla harcadın.`}</Line>}
        </View>
        <Small>Bir sonraki dönem için kaplumbağan hazır.</Small>
      </>,
    );
  }
  cards.push(
    <>
      <Small>Paylaş</Small>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <TurtleFace size={140} stage={4} />
        <Line>Harika bir dönemdi.</Line>
      </View>
      <Button title="Özeti paylaş" icon="share-outline" kind="inverse" onPress={() => Share.share({ message: share })} />
    </>,
  );
  return cards;
}
