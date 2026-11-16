import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shape, shapeFor } from '@/components/Shape';
import { Button, Card, Chip, Empty, Field, Glow, Loading, Row, SectionTitle, Segmented, T, type IconName } from '@/components/ui';
import { useCycles, useSpending, useSummary, useTags, useTransactions, type Transaction, type TxFilter } from '@/lib/api';
import { formatDay, formatMoney, formatMonth, relativeDay } from '@/lib/money';
import { usePendingCount } from '@/lib/offline';
import { useTheme } from '@/lib/theme';

export default function SpendingTab() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { tag, view } = useLocalSearchParams<{ tag?: string; view?: string }>();
  const [tab, setTab] = useState<'summary' | 'activity'>(tag || view === 'activity' ? 'activity' : 'summary');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <T v="title">Harcamalar</T>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'summary', label: 'Özet', icon: 'pie-chart-outline' },
            { key: 'activity', label: 'Hareketler', icon: 'list-outline' },
          ]}
        />
        {tab === 'summary' ? <SpendingSummary /> : <Activity key={tag ?? ''} initialTag={tag} />}
      </ScrollView>
    </View>
  );
}

const m0 = (n: number) => formatMoney(n, { cents: false });

// Ay seçerek: toplam, geçen ayla kıyas, kategori dağılımı, en çok harcanan yerler ve öneriler
function SpendingSummary() {
  const c = useTheme();
  const [month, setMonth] = useState<string>();
  const { data, error, refetch } = useSpending(month);
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const diff = data.total - data.prevTotal;
  const maxMonth = Math.max(...data.months.map((x) => x.total), 1);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {[...data.months].reverse().map((x) => (
          <Chip key={x.month} label={formatMonth(x.month, true)} active={x.month === data.month} onPress={() => setMonth(x.month)} />
        ))}
      </ScrollView>

      <Card style={{ gap: 8 }}>
        <T v="small" muted>{formatMonth(data.month, true)} harcaman</T>
        <T v="display">{m0(data.total)}</T>
        {data.prevTotal > 0 && (
          <T v="small" color={diff > 0 ? c.danger : c.success}>
            {diff > 0 ? '▲' : '▼'} geçen aya göre {m0(Math.abs(diff))} {diff > 0 ? 'fazla' : 'az'} (geçen ay {m0(data.prevTotal)})
          </T>
        )}
        <T v="small" muted>
          {data.count} harcama · günde ortalama {m0(data.dailyAvg)}
          {data.isCurrent ? ` · bu hızla ay sonu ~${m0(data.projected)}` : ''}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56, marginTop: 6 }}>
          {data.months.map((x) => (
            <Pressable key={x.month} onPress={() => setMonth(x.month)} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityRole="button" accessibilityLabel={`${formatMonth(x.month, true)}: ${m0(x.total)}`}>
              <View style={{ width: '100%', height: Math.max(3, (x.total / maxMonth) * 40), borderRadius: 4, backgroundColor: x.month === data.month ? c.primary : c.cardAlt }} />
              <Text style={{ fontSize: 9, color: c.muted }}>{formatMonth(x.month).split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <SectionTitle title="Nereye gitti" />
      {data.categories.length === 0 ? (
        <Empty title="Bu ay harcama yok" text="Harcama ekledikçe kategorilere göre dağılımı burada görürsün." action="Harcama ekle" onAction={() => router.push('/add')} />
      ) : (
        <Card style={{ gap: 14 }}>
          {data.categories.map((x) => {
            const change = x.prev ? Math.round(((x.total - x.prev) / x.prev) * 100) : null;
            return (
              <Pressable key={x.id} onPress={() => router.push(`/envelope/${x.id}`)} accessibilityRole="button" accessibilityLabel={`${x.name}: ${m0(x.total)}, yüzde ${Math.round(x.share * 100)}`} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="small" style={{ flex: 1 }} numberOfLines={1}>{x.icon} {x.name}</T>
                  <T v="label">{m0(x.total)}</T>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
                  <View style={{ height: 6, width: `${Math.max(2, x.share * 100)}%`, backgroundColor: x.color }} />
                </View>
                <T v="tiny" muted style={{ fontWeight: '400' }}>
                  %{Math.round(x.share * 100)} · {x.count} harcama
                  {change !== null && change !== 0 ? ` · geçen aya göre ${change > 0 ? '+' : ''}%${change}` : ''}
                  {!x.prev && x.total ? ' · geçen ay yoktu' : ''}
                </T>
              </Pressable>
            );
          })}
        </Card>
      )}

      {data.places.length > 0 && (
        <>
          <SectionTitle title="En çok harcadığın yerler" />
          <Card style={{ gap: 10 }}>
            {data.places.map((p) => (
              <Row key={p.note} style={{ justifyContent: 'space-between' }}>
                <T v="small" style={{ flex: 1 }} numberOfLines={1}>{p.note}</T>
                <T v="small" muted>{p.count}× · </T>
                <T v="small">{m0(p.total)}</T>
              </Row>
            ))}
          </Card>
        </>
      )}

      {data.tips.length > 0 && (
        <>
          <SectionTitle title="Tasarruf önerileri" />
          {data.tips.map((tip) => (
            <Card key={tip.title} style={{ gap: 4 }}>
              <Row gap={8}>
                <Ionicons name={tip.icon as IconName} size={18} color={c.accent} />
                <T v="label" style={{ flex: 1 }}>{tip.title}</T>
              </Row>
              <T v="small" muted>{tip.text}</T>
            </Card>
          ))}
        </>
      )}
      <Button title="Kategorileri düzenle" kind="ghost" small onPress={() => router.push('/categories')} />
    </>
  );
}

type Period = 'current' | 'previous' | 'all';

function Activity({ initialTag }: { initialTag?: string }) {
  const c = useTheme();
  const [q, setQ] = useState(initialTag ? `#${initialTag}` : '');
  const { data: tags } = useTags();
  const [envelopeId, setEnvelopeId] = useState<string>();
  const [period, setPeriod] = useState<Period>(initialTag ? 'all' : 'current');
  const { data: summary } = useSummary();
  const { data: cycles } = useCycles();
  const pending = usePendingCount();

  // Dönem filtresi: bu dönem, geçen dönem ya da hepsi
  const filter: TxFilter = { q: q.trim() || undefined, envelopeId };
  if (period !== 'all' && cycles?.length) {
    const cur = cycles.find((x) => !x.closed) ?? cycles[0];
    const target = period === 'current' ? cur : cycles[cycles.indexOf(cur) + 1];
    if (target) filter.cycleId = target.id;
  }
  const { data, isLoading, error, refetch } = useTransactions(filter);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of data ?? []) m.set(t.spentOn, [...(m.get(t.spentOn) ?? []), t]);
    return [...m.entries()];
  }, [data]);
  const total = (data ?? []).reduce((s, t) => s + t.amount, 0);
  const previous = cycles ? cycles[cycles.findIndex((x) => !x.closed) + 1] : undefined;

  return (
    <>
      <T v="tiny" muted>Tüm harcamalar, en yenisi üstte</T>
      {pending > 0 && (
        <Card style={{ backgroundColor: c.cardAlt }}>
          <Row gap={10}>
            <Ionicons name="cloud-offline-outline" size={18} color={c.text} />
            <T v="small" style={{ flex: 1 }}>{pending} harcama bağlantı bekliyor; internet gelince gönderilecek.</T>
          </Row>
        </Card>
      )}
      <Field value={q} onChangeText={setQ} placeholder="Notlarda ara" autoCapitalize="none" accessibilityLabel="Notlarda ara" />
      {tags && tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {tags.slice(0, 10).map((t) => (
            <Chip key={t.tag} label={`#${t.tag}`} active={q.trim() === `#${t.tag}`} onPress={() => (setQ(q.trim() === `#${t.tag}` ? '' : `#${t.tag}`), setPeriod('all'))} />
          ))}
        </ScrollView>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Bu dönem" active={period === 'current'} onPress={() => setPeriod('current')} />
        {previous && <Chip label={`Geçen dönem (${formatDay(previous.startDate)})`} active={period === 'previous'} onPress={() => setPeriod('previous')} />}
        <Chip label="Tüm zamanlar" active={period === 'all'} onPress={() => setPeriod('all')} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Tüm kategoriler" active={!envelopeId} onPress={() => setEnvelopeId(undefined)} />
        {summary?.envelopes.map((e) => (
          <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(e.id)} />
        ))}
      </ScrollView>

      {error && !data && <Loading error={error} onRetry={refetch} />}
      {data && data.length > 0 && <T v="small" muted>{data.length} harcama · toplam {formatMoney(total)}</T>}
      {!isLoading && data && !groups.length && (
        <Empty title="Henüz bir şey yok" text="Bir harcama ekle, en üstte burada görünsün." action="Harcama ekle" onAction={() => router.push('/add')} />
      )}

      {groups.map(([day, list]) => (
        <View key={day} style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <T v="tiny" muted>{relativeDay(day)}</T>
            <T v="tiny" muted>{formatMoney(list.reduce((s, t) => s + t.amount, 0))}</T>
          </Row>
          <Card style={{ gap: 16, paddingVertical: 14 }}>
            {list.map((t) => (
              <Pressable
                key={t.id}
                disabled={t.pending}
                onPress={() => router.push(`/add?id=${t.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${t.note || t.envelopeName}, ${formatMoney(t.amount)}, ${t.envelopeName}`}>
                <Row gap={12}>
                  <Shape shape={shapeFor(t.envelopeId)} color={t.envelopeColor} size={34} />
                  <View style={{ flex: 1 }}>
                    <T v="label" numberOfLines={1}>{t.note || t.envelopeName}</T>
                    <T v="small" muted>
                      {t.envelopeIcon} {t.envelopeName}
                      {t.billId ? ' · fatura' : ''}
                      {t.debtId ? ' · borç ödemesi' : ''}
                      {summary?.space && t.createdByName ? ` · ${t.createdByName}` : ''}
                      {t.pending ? ' · gönderilmeyi bekliyor' : ''}
                    </T>
                  </View>
                  <T v="label">-{formatMoney(t.amount)}</T>
                </Row>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}
