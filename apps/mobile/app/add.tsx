import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applyKey, formatKeypad, Keypad, keypadToKurus, kurusToKeypad } from '@/components/Keypad';
import { useToast } from '@/components/Toast';
import { Button, Chip, ErrorText, Glow, Header, Loading, RoundButton, Row, Wrap } from '@/components/ui';
import { api, useApiMutation, useFavorites, useMoney, useSpending, useSummary, useTags, useTransaction, type Summary, type Transaction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { formatMoney, relativeDay, todayIso } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { addExpense } from '@/lib/offline';
import { FONT, useTheme } from '@/lib/theme';

function shiftDay(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Harcama ekle: büyük tutar, zarf seçimi, tuş takımı. ?id= ile düzenleme.
// Kısayollar / derin bağlantı: kumbara://add?amount=125,50&envelope=Market&note=Kahve
type Params = { id?: string; envelopeId?: string; amount?: string; envelope?: string; note?: string };

export default function AddExpense() {
  const params = useLocalSearchParams<Params>();
  const { data, error, refetch } = useSummary();
  const existingQ = useTransaction(params.id);
  if (!data) return <Loading error={error} onRetry={refetch} />;
  if (params.id && !existingQ.data) return <Loading error={existingQ.error} onRetry={existingQ.refetch} />;
  // Form, veriler geldikten sonra başlangıç değerleriyle açılır
  return <AddForm key={params.id ?? 'new'} params={params} data={data} existing={existingQ.data} />;
}

function AddForm({ params, data, existing }: { params: Params; data: Summary; existing?: Transaction }) {
  const c = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const { space } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Not yazarken ekran klavyesi açılır; tuş takımı gizlenip yalnızca kaydet düğmesi kalır
  const [typing, setTyping] = useState(false);

  // Zarf adıyla gelen bağlantıda eşleşen zarf seçilir, yoksa ilk zarf
  const [amount, setAmount] = useState(() =>
    existing ? kurusToKeypad(existing.amount) : params.amount ? params.amount.replace('.', ',').replace(/[^\d,]/g, '') : '',
  );
  const [picked, setEnvelopeId] = useState<string | undefined>(existing?.envelopeId ?? params.envelopeId);
  // Seçim yapılmadıysa o anki listeden hesaplanır; önbellekteki boş liste güncellenince form kilitli kalmaz
  const byName = params.envelope && data.envelopes.find((e) => e.name.toLocaleLowerCase('tr-TR') === params.envelope!.toLocaleLowerCase('tr-TR'));
  const envelopeId = picked ?? (byName || data.envelopes[0])?.id;
  const [note, setNote] = useState(existing?.note ?? params.note ?? '');
  const [day, setDay] = useState(existing?.spentOn ?? todayIso());
  const [pickDay, setPickDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  // Ödeme aracı: kartla ödenirse kartın provizyonuna, hesaptan ödenirse bakiyesine yansır
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? null);
  const { data: money } = useMoney();
  const { data: spending } = useSpending();

  const remove = useApiMutation(() => api('DELETE', `/transactions/${params.id}`));
  const k = keypadToKurus(amount);
  const busy = useRef(false);

  // Verilen değerlerle kaydeder; favoriye basılı tutunca formu beklemeden doğrudan kullanılır
  const saveWith = useCallback(
    async (v: { envelopeId?: string; amount: number; note: string }) => {
      if (busy.current || v.amount <= 0 || !v.envelopeId) return;
      busy.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        if (params.id) {
          await api('PATCH', `/transactions/${params.id}`, { envelopeId: v.envelopeId, amount: v.amount, note: v.note.trim(), spentOn: day, accountId });
          await qc.invalidateQueries();
        } else {
          const r = await addExpense(qc, { envelopeId: v.envelopeId, amount: v.amount, note: v.note.trim(), spentOn: day, space, accountId });
          if (r.queued) toast({ message: 'Çevrimdışısın. Harcama kaydedildi, bağlanınca gönderilecek.' });
          else {
            await qc.invalidateQueries();
            // Zarf %80'i geçtiyse, eksiye düştüyse ya da günlük pay aşıldıysa haber verilir
            if (r.alerts.length) toast({ message: r.alerts.join(' ') });
          }
        }
        goBack();
      } catch (e) {
        setSaveError(e);
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [day, params.id, qc, space, toast, accountId],
  );
  const save = useCallback(() => saveWith({ envelopeId, amount: k, note }), [saveWith, envelopeId, k, note]);
  const { data: favorites } = useFavorites();
  const { data: tags } = useTags();
  const pin = useApiMutation(() => api('POST', '/favorites', { envelopeId, amount: k, note: note.trim() }));


  const env = data.envelopes.find((e) => e.id === envelopeId);
  // Bu ay bu kategoride harcanan (düzenlemede eski tutar düşülerek) ve bu harcamayla birlikte
  const monthSpent = (spending?.categories.find((x) => x.id === envelopeId)?.total ?? 0) - (existing && existing.envelopeId === envelopeId ? existing.amount : 0);
  const recentTags = (tags ?? []).slice(0, 8).filter((t) => !note.toLocaleLowerCase('tr-TR').includes(`#${t.tag}`));
  const favs = (favorites ?? []).filter((f) => data.envelopes.some((e) => e.id === f.envelopeId));

  async function onDelete() {
    if (!existing || !(await confirm('Harcama silinsin mi?', 'Harcama kaydı silinir.'))) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        goBack();
        const copy = { envelopeId: existing.envelopeId, amount: existing.amount, note: existing.note, spentOn: existing.spentOn, accountId: existing.accountId ?? null };
        toast({
          message: 'Harcama silindi',
          action: { label: 'Geri al', onPress: () => void api('POST', '/transactions', copy).then(() => qc.invalidateQueries()) },
        });
      },
    });
  }

  // Tutar uzadıkça yazı küçülür; kısa ekranlarda tuşlar alçalır
  const shown = formatKeypad(amount);
  const amountSize = Math.max(34, Math.min(68, Math.floor((Math.min(width, 560) - 90) / (shown.length * 0.6 + 0.4))));
  const keyHeight = height < 640 ? 42 : height < 740 ? 48 : 54;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow height={240} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <Header
          title={params.id ? 'Harcamayı düzenle' : 'Harcama ekle'}
          onClose={goBack}
          right={params.id ? <RoundButton icon="trash-outline" label="Harcamayı sil" color={c.danger} onPress={onDelete} /> : undefined}
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          <Row gap={2} style={{ alignItems: 'flex-start', maxWidth: '100%' }}>
            <Text style={{ color: k > 0 ? c.accent : c.faint, fontSize: amountSize * 0.5, fontFamily: FONT.bold, marginTop: amountSize * 0.16 }}>₺</Text>
            <Text
              accessibilityLabel={`Tutar ${formatMoney(k)}`}
              accessibilityLiveRegion="polite"
              style={{ color: k > 0 ? c.text : c.faint, fontSize: amountSize, lineHeight: amountSize * 1.12, fontFamily: FONT.display, letterSpacing: -amountSize * 0.035 }}
              numberOfLines={1}>
              {shown}
            </Text>
          </Row>
          {env && (
            <Text style={{ color: c.muted, fontSize: 13.5, textAlign: 'center' }} numberOfLines={2}>
              {env.icon} <Text style={{ color: c.text, fontWeight: '700' }}>{env.name}</Text> · bu ay {formatMoney(monthSpent + k, { cents: false })}
            </Text>
          )}
        </View>

        {!params.id && favs.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
            {favs.map((f) => {
              const fe = data.envelopes.find((e) => e.id === f.envelopeId)!;
              return (
                <Pressable
                  key={`${f.id ?? 'auto'}-${f.envelopeId}-${f.note}`}
                  onPress={() => {
                    setAmount(kurusToKeypad(f.amount));
                    setEnvelopeId(f.envelopeId);
                    setNote(f.note);
                  }}
                  onLongPress={() => saveWith({ envelopeId: f.envelopeId, amount: f.amount, note: f.note })}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.note || fe.name} ${formatMoney(f.amount)}`}
                  accessibilityHint="Dokun: forma doldur. Basılı tut: hemen kaydet."
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
                  <Text style={{ fontSize: 13 }}>{f.pinned ? '⭐' : fe.icon}</Text>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{f.note || fe.name}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{formatMoney(f.amount, { cents: false })}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={{ gap: 8 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
            {/* İki sıra: çok kategori olsa da ekranı doldurmaz, yana kayar */}
            <View style={{ gap: 8 }}>
              {[0, 1].map((row) => (
                <View key={row} style={{ flexDirection: 'row', gap: 8 }}>
                  {data.envelopes
                    .filter((_, i) => (data.envelopes.length > 6 ? i % 2 === row : row === 0))
                    .map((e) => (
                      <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(e.id)} />
                    ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {!!money?.accounts.length && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>Nereden ödendi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
              <Chip label="Belirtme" active={!accountId} onPress={() => setAccountId(null)} />
              {money.accounts.map((a) => (
                <Chip key={a.id} label={a.name} icon={a.kind === 'card' ? 'card-outline' : a.kind === 'cash' ? 'wallet-outline' : 'business-outline'} active={accountId === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </ScrollView>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {!accountId
                ? 'Hesap ve kart bakiyesi değişmez, yalnızca harcamalara yazılır.'
                : money.accounts.find((a) => a.id === accountId)?.kind === 'card'
                  ? 'Kart borcuna eklenir; hesabından ekstreyi ödeyince düşer.'
                  : 'Bakiyeden hemen düşer.'}
            </Text>
          </View>
        )}

        <Row gap={8}>
          <Row gap={8} style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderWidth: 1, borderColor: typing ? c.accent : c.border, borderRadius: 16, paddingHorizontal: 14 }}>
            <Ionicons name="create-outline" size={17} color={c.muted} />
            <TextInput
              value={note}
              onChangeText={setNote}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              placeholder="Satıcı ya da not"
              accessibilityLabel="Not"
              placeholderTextColor={c.faint}
              maxLength={200}
              returnKeyType="done"
              onSubmitEditing={save}
              style={{ flex: 1, minWidth: 0, paddingVertical: 13, color: c.text, fontSize: 15, outlineWidth: 0 } as object}
            />
            {!params.id && k > 0 && (
              <Pressable
                onPress={() => pin.mutate(undefined, { onSuccess: () => toast({ message: 'Favorilere eklendi ⭐' }) })}
                accessibilityRole="button"
                accessibilityLabel="Favorilere ekle"
                hitSlop={8}>
                <Ionicons name="star-outline" size={18} color={c.muted} />
              </Pressable>
            )}
          </Row>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tarih: ${relativeDay(day)}. Değiştir`}
            onPress={() => setPickDay((x) => !x)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pickDay ? c.inverse : c.card, borderWidth: 1, borderColor: pickDay ? c.inverse : c.border, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 13 }}>
            <Ionicons name="calendar-outline" size={16} color={pickDay ? c.inverseText : c.text} />
            <Text style={{ color: pickDay ? c.inverseText : c.text, fontWeight: '700', fontSize: 13 }}>{relativeDay(day)}</Text>
          </Pressable>
        </Row>
        {pickDay && (
          <Wrap>
            <Chip label="Bugün" active={day === todayIso()} onPress={() => setDay(todayIso())} />
            <Chip label="Dün" active={day === shiftDay(todayIso(), -1)} onPress={() => setDay(shiftDay(todayIso(), -1))} />
            <Chip label="‹ Önceki gün" onPress={() => setDay(shiftDay(day, -1))} />
            {day < todayIso() && <Chip label="Sonraki gün ›" onPress={() => setDay(shiftDay(day, 1))} />}
          </Wrap>
        )}
        {recentTags.length > 0 && note.length < 120 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
            {recentTags.map((t) => (
              <Pressable
                key={t.tag}
                onPress={() => setNote((n) => `${n.trim()} #${t.tag}`.trim())}
                accessibilityRole="button"
                accessibilityLabel={`#${t.tag} etiketini ekle`}
                style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>#{t.tag}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <ErrorText error={saveError ?? remove.error} />
      </ScrollView>

      {/* Tuş takımı ve kaydet düğmesi her zaman ekranın altında görünür */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 12, paddingTop: typing ? 10 : 6, paddingBottom: Math.max(insets.bottom, 10) }}>
        <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 6 }}>
          {!typing && <Keypad keyHeight={keyHeight} onKey={(key) => setAmount((v) => applyKey(v, key))} onSubmit={save} />}
          <Button
            title={k > 0 ? (params.id ? 'Kaydet' : `${formatMoney(k)} ekle`) : 'Bir tutar gir'}
            icon={k > 0 ? 'checkmark' : undefined}
            disabled={k <= 0 || !envelopeId}
            loading={saving}
            onPress={save}
          />
        </View>
      </View>
    </View>
  );
}
