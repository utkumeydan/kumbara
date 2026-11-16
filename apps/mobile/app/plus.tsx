import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { TurtleFace } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorText, Header, Row, Screen, T, type IconName } from '@/components/ui';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { goBack } from '@/lib/nav';
import { buy, getPlans, initPurchases, purchasesAvailable, restore, type PlanOption } from '@/lib/purchases';
import { FONT, useTheme } from '@/lib/theme';

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: 'albums-outline', text: 'Sınırsız kategori' },
  { icon: 'pie-chart-outline', text: 'Kategoriye göre analiz ve dönem karşılaştırması' },
  { icon: 'people-outline', text: 'Birlikte: ortak bütçe alanı aç' },
  { icon: 'cloud-upload-outline', text: 'CSV ile harcama içe aktarma' },
];

// Mağaza fiyatları yüklenemezse gösterilen bilgi amaçlı fiyatlar
const FALLBACK: PlanOption[] = [
  { id: 'weekly', title: 'Haftalık', price: '₺149,99', period: 'haftada bir' },
  { id: 'monthly', title: 'Aylık', price: '₺299,99', period: 'ayda bir' },
  { id: 'annual', title: 'Yıllık', price: '₺1.999,99', period: 'yılda bir', badge: '%44 tasarruf' },
];

export default function Plus() {
  const c = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [plans, setPlans] = useState<PlanOption[]>(FALLBACK);
  const [selected, setSelected] = useState('monthly');
  const [busy, setBusy] = useState<'buy' | 'restore' | 'dev' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [devToggle, setDevToggle] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ devToggle: boolean }>('GET', '/billing').then((b) => setDevToggle(b.devToggle)).catch(() => {});
    initPurchases(user.id)
      .then(getPlans)
      .then((p) => {
        if (p.length) {
          setPlans(p);
          setSelected(p.find((x) => x.badge)?.id ?? p[0].id);
        }
      })
      .catch(setError);
  }, [user]);

  // Satın alma sonrası sunucu webhook ile güncellenir; birkaç kez kontrol edilir
  async function refreshPlan() {
    for (let i = 0; i < 5; i++) {
      const me = await api<User>('GET', '/auth/me');
      setUser(me);
      if (me.plus) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await qc.invalidateQueries();
  }

  async function run(kind: 'buy' | 'restore' | 'dev', fn: () => Promise<boolean | void>) {
    setBusy(kind);
    setError(null);
    try {
      const ok = await fn();
      if (ok !== false) {
        await refreshPlan();
        toast({ message: kind === 'restore' ? 'Satın alımlar geri yüklendi' : 'Kumbara+ etkin 🎉' });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const plan = plans.find((p) => p.id === selected) ?? plans[0];

  if (user?.plus) {
    return (
      <Screen header={<Header title="Kumbara+" onClose={goBack} />}>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 20 }}>
          <TurtleFace size={120} stage={4} />
          <T v="title">Kumbara+ etkin</T>
          <T muted style={{ textAlign: 'center' }}>
            {user.planExpiresAt ? `Yenileme tarihi: ${new Date(user.planExpiresAt).toLocaleDateString('tr-TR')}` : 'Tüm özellikler açık.'}
          </T>
        </View>
        {FEATURES.map((f) => (
          <Row key={f.text} gap={12}>
            <Ionicons name="checkmark-circle" size={22} color={c.success} />
            <T>{f.text}</T>
          </Row>
        ))}
        {devToggle && <Button title="Ücretsiz plana dön (geliştirme)" kind="ghost" loading={busy === 'dev'} onPress={() => run('dev', () => api('POST', '/billing/dev-toggle'))} />}
        {Platform.OS !== 'web' && (
          <T v="small" muted style={{ textAlign: 'center' }}>Aboneliğini {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} ayarlarından yönetebilirsin.</T>
        )}
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header onClose={goBack} />}
      footer={
        <View style={{ gap: 8 }}>
          <ErrorText error={error} />
          {purchasesAvailable ? (
            <Button title={`${plan.price} ile devam et`} icon="arrow-forward" loading={busy === 'buy'} onPress={() => run('buy', () => buy(plan))} />
          ) : (
            <T v="small" muted style={{ textAlign: 'center' }}>
              {Platform.OS === 'web' ? 'Abonelik mobil uygulamadan alınır.' : 'Mağaza bağlantısı bu derlemede yapılandırılmamış.'}
            </T>
          )}
          {devToggle && <Button title="Kumbara+'ı dene (geliştirme)" kind="secondary" loading={busy === 'dev'} onPress={() => run('dev', () => api('POST', '/billing/dev-toggle'))} />}
          <T v="tiny" muted style={{ textAlign: 'center' }}>Abonelik dönem sonunda otomatik yenilenir. İstediğin zaman iptal edebilirsin.</T>
          {purchasesAvailable && (
            <Pressable onPress={() => run('restore', restore)} accessibilityRole="button" style={{ alignSelf: 'center' }}>
              <T v="small" muted>{busy === 'restore' ? 'Geri yükleniyor…' : 'Satın alımları geri yükle'}</T>
            </Pressable>
          )}
        </View>
      }>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 34, fontFamily: FONT.display, letterSpacing: -1, color: c.text, flex: 1, lineHeight: 38 }}>
          Kumbara<Text style={{ color: c.accent }}>+</Text>
          {'\n'}
          <Text style={{ color: c.muted }}>sınırsız kategori</Text>
        </Text>
        <TurtleFace size={96} stage={3} />
      </Row>
      <View style={{ gap: 10 }}>
        {FEATURES.map((f) => (
          <Row key={f.text} gap={12}>
            <Ionicons name={f.icon} size={20} color={c.accent} />
            <T>{f.text}</T>
          </Row>
        ))}
      </View>
      <Row gap={8} style={{ alignItems: 'stretch', marginTop: 8 }}>
        {plans.map((p) => {
          const on = p.id === selected;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${p.title} ${p.price}`}
              style={{ flex: 1, backgroundColor: on ? c.primary : c.card, borderRadius: 20, padding: 12, gap: 6, minHeight: 120 }}>
              {p.badge ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: on ? c.primaryText : c.inverse, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: on ? c.primary : c.inverseText, fontSize: 9.5, fontWeight: '800' }}>{p.badge}</Text>
                </View>
              ) : (
                <View style={{ height: 18 }} />
              )}
              <Text style={{ color: on ? c.primaryText : c.muted, fontSize: 12, fontWeight: '700' }}>{p.title}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: on ? c.primaryText : c.text, fontSize: 16, fontWeight: '800' }}>
                {p.price}
              </Text>
              <Text style={{ color: on ? c.primaryText : c.muted, fontSize: 11 }}>{p.period}</Text>
            </Pressable>
          );
        })}
      </Row>
      {!purchasesAvailable && (
        <Card>
          <T v="small" muted>Fiyatlar bilgi amaçlıdır; kesin fiyat mağazada gösterilir.</T>
        </Card>
      )}
    </Screen>
  );
}
