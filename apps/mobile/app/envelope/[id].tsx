import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, ColorPicker, ErrorText, Field, Header, IconPicker, Loading, RoundButton, Row, Screen, Segmented, T } from '@/components/ui';
import { api, useApiMutation, useSpending, useSummary, useTransactions } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDay, formatMoney, parseMoney, relativeDay, toInput, todayIso } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { FONT, ENVELOPE_ICONS, PALETTE, useTheme } from '@/lib/theme';

// Kategori detayı: bu ay ve geçen ay harcama, son 6 ay, bu ayın hareketleri
// gg.aa.yyyy → yyyy-aa-gg; geçersizse null
function fromTr(s: string) {
  const m = s.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export default function EnvelopeScreen() {
  const c = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refetch } = useSummary();
  const env = data?.envelopes.find((e) => e.id === id);
  const monthStart = todayIso().slice(0, 8) + '01';
  const { data: txs } = useTransactions({ envelopeId: id, from: monthStart, to: todayIso() });
  const { data: spending } = useSpending();
  const cat = spending?.categories.find((x) => x.id === id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState(PALETTE[0]);
  const [kind, setKind] = useState<'variable' | 'fixed'>('variable');
  const [dueDay, setDueDay] = useState('');
  const [planned, setPlanned] = useState('');
  const [from, setFrom] = useState('');


  const day = dueDay ? Number(dueDay) : null;
  const fromIso = from.trim() ? fromTr(from) : null;
  const fromInvalid = !!from.trim() && !fromIso;
  const save = useApiMutation(() => api('PATCH', `/envelopes/${id}`, { name: name.trim(), icon, color, kind, dueDay: kind === 'fixed' ? day : null, plannedFrom: kind === 'fixed' ? fromIso : null, plannedAmount: parseMoney(planned) }));
  const archive = useApiMutation(() => api('DELETE', `/envelopes/${id}`));
  const restore = useApiMutation(() => api('PATCH', `/envelopes/${id}`, { archived: false }));

  // Düzenleme formu açılırken güncel değerlerle doldurulur
  function startEditing() {
    if (!env) return;
    setName(env.name);
    setIcon(env.icon);
    setColor(env.color);
    setKind(env.kind);
    setDueDay(env.dueDay ? String(env.dueDay) : '');
    setPlanned(toInput(env.plannedAmount));
    setFrom(env.plannedFrom ? env.plannedFrom.split('-').reverse().join('.') : '');
    setEditing(true);
  }

  if (!data || !env) return <Loading error={error ?? (data && !env ? new Error('Kategori bulunamadı') : undefined)} onRetry={refetch} />;

  if (editing) {
    return (
      <Screen
        header={<Header title="Kategoriyi düzenle" onClose={() => setEditing(false)} back />}
        footer={
          <Button title="Kaydet" disabled={!name.trim() || fromInvalid || (day !== null && (day < 1 || day > 31))} loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: () => setEditing(false) })} />
        }>
        <Field label="Adı" value={name} onChangeText={setName} maxLength={40} />
        <T v="tiny" muted>Türü</T>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { key: 'variable', label: 'Harcama kategorisi' },
            { key: 'fixed', label: 'Sabit gider' },
          ]}
        />
        {kind === 'fixed' && (
          <Field
            label="Aylık tutar"
            value={planned}
            onChangeText={(s) => setPlanned(s.replace(/[^\d.,]/g, ''))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            hint="Ödemeler takviminde her ay bu tutar yazılır."
          />
        )}
        {kind === 'fixed' && (
          <Field
            label="Ödeme günü (isteğe bağlı)"
            value={dueDay}
            onChangeText={(s) => setDueDay(s.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder="Ör. 5"
            hint="Girersen Ödemeler takviminde o güne yazılır."
          />
        )}
        {kind === 'fixed' && (
          <Field
            label="Başlangıç tarihi (isteğe bağlı)"
            value={from}
            onChangeText={setFrom}
            keyboardType="numbers-and-punctuation"
            placeholder="gg.aa.yyyy"
            hint={fromInvalid ? 'Tarihi gg.aa.yyyy biçiminde yaz.' : 'Bu tarihten önceki aylarda Ödemeler planına yazılmaz. Ör. kira 1 Ocak’ta başlıyorsa.'}
          />
        )}
        <T v="tiny" muted>Renk</T>
        <ColorPicker value={color} onChange={setColor} colors={PALETTE} />
        <T v="tiny" muted>Simge</T>
        <IconPicker value={icon} onChange={setIcon} icons={ENVELOPE_ICONS} />
        <ErrorText error={save.error} />
      </Screen>
    );
  }

  return (
    <Screen
      glow={false}
      header={
        <Header
          onClose={goBack}
          back
          right={
            <Row gap={8}>
              <RoundButton icon="pencil" size={40} onPress={startEditing} />
              <RoundButton
                icon="trash-outline"
                size={40}
                color={c.danger}
                onPress={async () => {
                  if (
                    await confirm(
                      'Kategori arşivlensin mi?',
                      'Kategori listeden kalkar; geçmiş harcamalar korunur. Kategoriler > Arşiv’den geri getirebilirsin.',
                      'Arşivle',
                    )
                  )
                    archive.mutate(undefined, {
                      onSuccess: () => {
                        toast({ message: `${env.name} arşivlendi`, action: { label: 'Geri al', onPress: () => restore.mutate() } });
                        goBack();
                      },
                    });
                }}
              />
            </Row>
          }
        />
      }>
      <View style={{ backgroundColor: env.color, borderRadius: 30, padding: 20, minHeight: 210, justifyContent: 'space-between' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: c.onPastel, fontWeight: '800', fontSize: 15 }}>{env.icon} {env.name}</Text>
          {env.kind === 'fixed' && (
            <View style={{ backgroundColor: '#00000018', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: c.onPastel, fontSize: 11, fontWeight: '700' }}>
                Sabit gider{env.plannedAmount ? ` · ${formatMoney(env.plannedAmount, { cents: false })}` : ''}
                {env.dueDay ? ` · ayın ${env.dueDay}'i` : ''}
                {env.plannedFrom ? ` · ${formatDay(env.plannedFrom, true)} itibarıyla` : ''}
              </Text>
            </View>
          )}
        </Row>
        <View>
          <Text style={{ color: '#00000066', fontSize: 14, fontWeight: '700' }}>Bu ay harcanan</Text>
          <Text style={{ color: c.onPastel, fontSize: 40, fontFamily: FONT.display, letterSpacing: -1.5 }}>{formatMoney(cat?.total ?? 0, { cents: false })}</Text>
          <Text style={{ color: '#00000088', fontSize: 13, fontWeight: '700' }}>
            Geçen ay {formatMoney(cat?.prev ?? 0, { cents: false })}
            {cat && spending?.total ? ` · bu ayın %${Math.round(cat.share * 100)}'i` : ''}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => router.push(`/add?envelopeId=${env.id}`)}
        style={({ pressed }) => ({ backgroundColor: env.color, opacity: pressed ? 0.8 : 0.85, borderRadius: 999, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 })}>
        <Ionicons name="add" size={20} color={c.onPastel} />
        <Text style={{ color: c.onPastel, fontWeight: '800' }}>Harcama ekle</Text>
      </Pressable>

      <T v="tiny" muted style={{ marginTop: 6 }}>Bu ay</T>
      {txs?.length ? (
        <Card style={{ gap: 14 }}>
          {txs.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/add?id=${t.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="label">{t.note || 'Harcama'}</T>
                  <T v="small" muted>{relativeDay(t.spentOn)}</T>
                </View>
                <T v="label">-{formatMoney(t.amount)}</T>
              </Row>
            </Pressable>
          ))}
        </Card>
      ) : (
        <T v="small" muted>Bu ay bu kategoride harcama yok.</T>
      )}

    </Screen>
  );
}
