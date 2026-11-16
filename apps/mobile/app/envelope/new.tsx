import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Chip, ColorPicker, ErrorText, Field, Header, IconPicker, IconTile, Row, Screen, T, Wrap, type IconName } from '@/components/ui';
import { AmountSheet } from '@/components/AmountSheet';
import { api, ApiError, useApiMutation } from '@/lib/api';
import { deadlineOptions, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { ENVELOPE_ICONS, GOAL_ICONS, PALETTE, useTheme } from '@/lib/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type Kind = 'variable' | 'fixed' | 'goal';

const KINDS: { key: Kind; title: string; text: string; icon: IconName; color: string }[] = [
  { key: 'variable', title: 'Harcama kategorisi', text: 'Market, yeme içme, ulaşım gibi değişen harcamalar', icon: 'cart-outline', color: '#F7B49A' },
  { key: 'fixed', title: 'Sabit gider', text: 'Her ay aynı ödeme: kira, aidat, abonelik', icon: 'calendar-outline', color: '#A7D3F2' },
  { key: 'goal', title: 'Birikim hedefi', text: 'Bir şey için biriktirmek: tatil, acil durum', icon: 'locate-outline', color: '#A8E6A1' },
];

// Yeni zarf: değişken, sabit ya da birikim hedefi
export default function NewEnvelope() {
  const c = useTheme();
  const [kind, setKind] = useState<Kind>('variable');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState(PALETTE[0]);
  const [amount, setAmount] = useState(0);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dueDay, setDueDay] = useState('');

  const save = useApiMutation(async () => {
    if (kind === 'goal') return void (await api('POST', '/goals', { name: name.trim(), icon, color, target: amount, deadline }));
    await api('POST', '/envelopes', { name: name.trim(), icon, color, kind, plannedAmount: kind === 'fixed' ? amount : 0, dueDay: kind === 'fixed' && dueDay ? Number(dueDay) : null });
  });
  const valid = name.trim() && (kind !== 'goal' || amount > 0);

  return (
    <Screen
      header={<Header title="Yeni kategori" onClose={goBack} />}
      footer={
        <View style={{ gap: 8 }}>
          {!name.trim() && <T v="small" muted style={{ textAlign: 'center' }}>Önce bir ad ver.</T>}
          <ErrorText error={save.error} />
          {save.error instanceof ApiError && save.error.status === 402 && <Button title="Kumbara+'ı incele" kind="secondary" onPress={() => router.push('/plus')} />}
          <Button
            title={kind === 'goal' ? 'Hedef oluştur' : 'Kategori oluştur'}
            icon="arrow-forward"
            disabled={!valid}
            loading={save.isPending}
            onPress={() => save.mutate(undefined, { onSuccess: () => (kind === 'goal' ? router.replace('/goals') : goBack()) })}
          />
        </View>
      }>
      <Field label="Adı" value={name} onChangeText={setName} placeholder={kind === 'goal' ? 'Ör. Yaz tatili' : 'Ör. Market'} maxLength={40} />

      <T v="tiny" muted>Türü</T>
      {KINDS.map((k) => {
        const on = kind === k.key;
        return (
          <Pressable key={k.key} onPress={() => setKind(k.key)}>
            <Card style={on ? { backgroundColor: k.color } : undefined}>
              <Row gap={12}>
                <IconTile icon={k.icon} bg={on ? '#ffffff55' : c.cardAlt} color={on ? c.onPastel : c.text} />
                <View style={{ flex: 1 }}>
                  <T v="label" color={on ? c.onPastel : c.text}>{k.title}</T>
                  <T v="small" color={on ? c.onPastel : c.muted}>{k.text}</T>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? c.onPastel : c.faint} />
              </Row>
            </Card>
          </Pressable>
        );
      })}

      {kind !== 'variable' && (
        <>
          <T v="tiny" muted>{kind === 'goal' ? 'Hedef tutar' : 'Aylık tutar'}</T>
          <Card onPress={() => setSheet(true)}>
            <T v="h2" color={amount ? c.text : c.faint}>{formatMoney(amount, { cents: false })}</T>
          </Card>
        </>
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
      {kind === 'goal' && (
        <>
          <T v="tiny" muted>Şu tarihe kadar</T>
          <Wrap>
            {deadlineOptions().map((o) => (
              <Chip key={o.label} label={o.label} active={deadline === o.value} onPress={() => setDeadline(o.value)} />
            ))}
          </Wrap>
          <T v="small" muted>Bir tarih seç, her ay ne kadar biriktirmen gerektiğini hesaplayalım.</T>
        </>
      )}

      <T v="tiny" muted>Renk</T>
      <ColorPicker value={color} onChange={setColor} colors={PALETTE} />
      <T v="tiny" muted>Simge</T>
      <IconPicker value={icon} onChange={setIcon} icons={kind === 'goal' ? GOAL_ICONS : ENVELOPE_ICONS} />

      <AmountSheet
        open={sheet}
        title={kind === 'goal' ? 'Hedef tutar' : 'Aylık tutar'}
        initial={amount}
        onClose={() => setSheet(false)}
        onDone={(k) => {
          setAmount(k);
          setSheet(false);
        }}
      />
    </Screen>
  );
}
