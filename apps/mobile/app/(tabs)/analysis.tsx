import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from '@/components/BarChart';
import { TurtleFace } from '@/components/Turtle';
import { Shape, shapeFor } from '@/components/Shape';
import { Button, Card, Chip, Glow, ProgressBar, Row, T } from '@/components/ui';
import { useInflation, useStats } from '@/lib/api';
import { formatDay, formatMoney } from '@/lib/money';
import { FONT, useTheme } from '@/lib/theme';

export default function Analysis() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [cycleId, setCycleId] = useState<string>();
  const { data } = useStats(cycleId);

  const max = data?.byEnvelope[0]?.spent ?? 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <T v="title">Analiz</T>
        <T v="small" muted style={{ marginTop: -8 }}>Bu dönem harcamalarında öne çıkanlar.</T>

        {data && data.history.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[...data.history].reverse().map((h) => (
              <Chip key={h.id} label={`${formatDay(h.startDate)} – ${formatDay(h.endDate)}`} active={h.id === data.cycle?.id} onPress={() => setCycleId(h.id)} />
            ))}
          </ScrollView>
        )}

        <Card style={{ gap: 12 }}>
          <Row gap={8}>
            <Ionicons name="trending-up" size={18} color={c.text} />
            <T v="label">Bu dönem</T>
          </Row>
          {!data?.total ? (
            <Row gap={14}>
              <TurtleFace size={64} mood="calm" />
              <View style={{ flex: 1, gap: 6 }}>
                <T v="label">Bu dönem henüz harcama kaydedilmemiş.</T>
                <T v="small" muted>Harcama ekledikçe burada öne çıkanları göreceksin.</T>
                <Button title="Harcama ekle" small onPress={() => router.push('/add')} style={{ alignSelf: 'flex-start' }} />
              </View>
            </Row>
          ) : (
            <>
              <T v="display">{formatMoney(data.total, { cents: false })}</T>
              <T v="small" muted style={{ marginTop: -8 }}>
                harcandı{data.cycle?.income ? ` · gelir ${formatMoney(data.cycle.income, { cents: false })}` : ''}
              </T>
              {data.insights.map((s, i) => (
                <T key={i} v="small">• {s}</T>
              ))}
            </>
          )}
        </Card>

        <InflationCard />

        {data && data.total > 0 && (
          <Card style={{ gap: 10 }}>
            <T v="label">Harcama trendi</T>
            <BarChart data={data.daily.map((d) => d.spent)} color={c.primary} height={120} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="tiny" muted>{data.daily[0] ? formatDay(data.daily[0].day) : ''}</T>
              <T v="tiny" muted>{data.daily.at(-1) ? formatDay(data.daily.at(-1)!.day) : ''}</T>
            </Row>
          </Card>
        )}

        {data && data.byEnvelope.length > 0 && (
          <Card style={{ gap: 14 }}>
            <T v="label">Kategoriye göre</T>
            {data.byEnvelope.map((e) => (
              <View key={e.envelopeId} style={{ gap: 6 }}>
                <Row gap={10}>
                  <Shape shape={shapeFor(e.envelopeId)} color={e.color} size={26} />
                  <T v="small" style={{ flex: 1 }}>{e.icon} {e.name}</T>
                  <T v="label">{formatMoney(e.spent, { cents: false })}</T>
                </Row>
                <ProgressBar value={e.spent / max} color={e.color} />
              </View>
            ))}
          </Card>
        )}

        {data && data.history.length > 1 && (
          <Card style={{ gap: 10 }}>
            <T v="label">Dönemler yan yana</T>
            <BarChart data={data.history.map((h) => h.spent)} color={c.primary} height={100} />
            {[...data.history].reverse().map((h) => (
              <Row key={h.id} style={{ justifyContent: 'space-between' }}>
                <T v="small" muted>{formatDay(h.startDate)} – {formatDay(h.endDate)}</T>
                <T v="small">{formatMoney(h.spent, { cents: false })} / {formatMoney(h.income, { cents: false })}</T>
              </Row>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const pct = (x: number) => `${x >= 0 ? '+' : '−'}%${Math.abs(Math.round(x * 100))}`;

// Kişisel enflasyon: sık aldığın kalemlerin fiyatı, zarf harcamaları ve gelirin gerçek değeri
function InflationCard() {
  const c = useTheme();
  const { data } = useInflation();
  if (!data) return null;
  const hasItems = data.items.length > 0;
  const up = (x: number) => (x > 0.02 ? c.danger : x < -0.02 ? c.success : c.muted);
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={8}>
        <Ionicons name="flame-outline" size={18} color={c.text} />
        <T v="label">Kişisel enflasyon</T>
      </Row>
      {!hasItems && !data.envelopes.length ? (
        <T v="small" muted>Aynı kalemi (ör. “Kahve”, “Migros”) birkaç ay boyunca kaydettikçe fiyat değişimini burada göreceksin.</T>
      ) : (
        <>
          {data.personalRate !== null && (
            <Text style={{ fontSize: 22, fontFamily: FONT.display, color: c.muted, letterSpacing: -0.5, lineHeight: 28 }}>
              Sık aldıklarında fiyatlar <Text style={{ color: up(data.personalRate) }}>{pct(data.personalRate)}</Text> değişti.
            </Text>
          )}
          {data.realIncomeChange !== null && (
            <T v="small" muted>
              Gelirin {pct(data.incomeChange!)} değişti; fiyatlara göre gerçek alım gücün{' '}
              <T v="small" color={up(-data.realIncomeChange)}>{pct(data.realIncomeChange)}</T>.
            </T>
          )}
          {data.items.slice(0, 6).map((i) => (
            <Row key={i.name} style={{ justifyContent: 'space-between' }}>
              <T v="small" style={{ flex: 1 }} numberOfLines={1}>{i.name}</T>
              <T v="small" muted>{formatMoney(i.firstAvg, { cents: false })} → {formatMoney(i.lastAvg, { cents: false })}</T>
              <T v="label" color={up(i.change)} style={{ width: 64, textAlign: 'right' }}>{pct(i.change)}</T>
            </Row>
          ))}
          {data.envelopes.filter((e) => e.change !== null).length > 0 && data.period && (
            <>
              <T v="tiny" muted style={{ marginTop: 4 }}>
                Kategori harcamaları · {formatDay(data.period.from)} → {formatDay(data.period.to)}
              </T>
              {data.envelopes
                .filter((e) => e.change !== null)
                .slice(0, 5)
                .map((e) => (
                  <Row key={e.id} gap={10}>
                    <Shape shape={shapeFor(e.id)} color={e.color} size={20} />
                    <T v="small" style={{ flex: 1 }}>{e.icon} {e.name}</T>
                    <T v="label" color={up(e.change!)}>{pct(e.change!)}</T>
                  </Row>
                ))}
            </>
          )}
        </>
      )}
    </Card>
  );
}
