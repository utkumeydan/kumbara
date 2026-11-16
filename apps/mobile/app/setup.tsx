import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AmountSheet } from '@/components/AmountSheet';
import { Shape, type ShapeName } from '@/components/Shape';
import { Button, Card, ErrorText, Field, Row, Screen, T, Wrap } from '@/components/ui';
import { api, useSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { FONT, PALETTE, PRESET_ENVELOPES, useTheme } from '@/lib/theme';

const SHAPES: ShapeName[] = ['diamond', 'square', 'dome', 'pill', 'circle'];

// İlk açılış: gelir, maaş günü ve zarflar; ardından zarfları doldurma ekranı
export default function Setup() {
  const c = useTheme();
  const { user, space } = useAuth();
  const { data: summary } = useSummary();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  // Ortak alanda kişisel gelir varsayılan olarak kullanılmaz
  const [income, setIncome] = useState(space ? 0 : (user?.income ?? 0));
  const [payday, setPayday] = useState(user?.paydayDay ?? 1);
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<string[]>(['Kira', 'Market', 'Yeme içme', 'Faturalar']);
  const [custom, setCustom] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const overLimit = !!summary?.envelopeLimit && picked.length + extras.length > summary.envelopeLimit;
  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  async function finish() {
    setLoading(true);
    setError(null);
    try {
      // Kişisel bütçe ya da seçili ortak alan için ayarlar
      await api('PATCH', '/settings', { paydayDay: payday, income });
      const existing = await api<{ envelopes: { name: string }[] }>('GET', '/summary');
      const have = new Set(existing.envelopes.map((e) => e.name));
      const list = [
        ...PRESET_ENVELOPES.filter((p) => picked.includes(p.name)),
        ...extras.map((name, i) => ({ name, icon: '💰', color: PALETTE[(i + 4) % PALETTE.length], kind: 'variable' as const })),
      ].filter((e) => !have.has(e.name));
      for (const e of list) await api('POST', '/envelopes', e);
      await qc.invalidateQueries();
      router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  if (step === 1) {
    return (
      <Screen footer={<Button title="Devam" icon="arrow-forward" disabled={income <= 0} onPress={() => setStep(2)} />}>
        <Text style={{ fontSize: 32, fontFamily: FONT.display, letterSpacing: -1, color: c.text, marginTop: 30 }}>
          Ayda ne kadar <Text style={{ color: c.muted }}>kazanıyorsun?</Text>
        </Text>
        <Card onPress={() => setSheet(true)}>
          <T v="display" color={income ? c.text : c.faint}>{formatMoney(income, { cents: false })}</T>
        </Card>
        <T v="small" muted>Maaşın ya da her dönem eline geçen toplam tutar. Sonra Ayarlar’dan değiştirebilirsin.</T>

        <Text style={{ fontSize: 24, fontFamily: FONT.display, letterSpacing: -0.6, color: c.text, marginTop: 16 }}>
          Maaş ayın <Text style={{ color: c.muted }}>kaçında yatıyor?</Text>
        </Text>
        <Wrap gap={8}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <Pressable
              key={d}
              onPress={() => setPayday(d)}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: payday === d ? c.primary : c.card }}>
              <Text style={{ color: payday === d ? c.primaryText : c.text, fontWeight: '700' }}>{d}</Text>
            </Pressable>
          ))}
        </Wrap>
        {payday > 28 && <T v="small" muted>Kısa aylarda ayın son günü maaş günü sayılır.</T>}
        <AmountSheet
          open={sheet}
          title="Aylık gelirin"
          initial={income}
          onClose={() => setSheet(false)}
          onDone={(k) => {
            setIncome(k);
            setSheet(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={{ gap: 6 }}>
          <ErrorText error={error} />
          {overLimit && <T v="small" muted style={{ textAlign: 'center' }}>Ücretsiz planda en fazla {summary!.envelopeLimit} kategori seçebilirsin.</T>}
          <Button title="Kategorileri oluştur" icon="arrow-forward" onPress={finish} loading={loading} disabled={(!picked.length && !extras.length) || overLimit} />
          <Button title="Geri" kind="ghost" onPress={() => setStep(1)} />
        </View>
      }>
      <Text style={{ fontSize: 32, fontFamily: FONT.display, letterSpacing: -1, color: c.text, marginTop: 30 }}>
        Kategorilerini <Text style={{ color: c.muted }}>seç.</Text>
      </Text>
      <T muted>Harcamaların bu kategorilere göre gruplanır; en çok nereye para gittiğini böyle görürsün.</T>
      {PRESET_ENVELOPES.map((p, i) => {
        const on = picked.includes(p.name);
        return (
          <Card key={p.name} onPress={() => toggle(p.name)} style={on ? { backgroundColor: p.color } : undefined}>
            <Row gap={14}>
              <Shape shape={SHAPES[i % SHAPES.length]} color={on ? '#ffffff88' : p.color} size={36} />
              <View style={{ flex: 1 }}>
                <T v="label" color={on ? c.onPastel : c.text}>{p.icon} {p.name}</T>
                <T v="small" color={on ? c.onPastel : c.muted}>{p.kind === 'fixed' ? 'Sabit gider' : 'Harcama kategorisi'}</T>
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? c.onPastel : c.faint} />
            </Row>
          </Card>
        );
      })}
      {extras.map((n) => (
        <Card key={n} onPress={() => setExtras((x) => x.filter((y) => y !== n))}>
          <Row gap={14}>
            <Shape shape="circle" color={c.primary} size={36} />
            <T v="label" style={{ flex: 1 }}>💰 {n}</T>
            <Ionicons name="checkmark-circle" size={26} color={c.text} />
          </Row>
        </Card>
      ))}
      <Row>
        <View style={{ flex: 1 }}>
          <Field value={custom} onChangeText={setCustom} placeholder="Kendi kategorini ekle" />
        </View>
        <Button
          title="Ekle"
          kind="secondary"
          small
          disabled={!custom.trim()}
          onPress={() => {
            setExtras((x) => [...x, custom.trim()]);
            setCustom('');
          }}
        />
      </Row>
    </Screen>
  );
}
