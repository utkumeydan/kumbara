import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Chip, ErrorText, Field, Header, Loading, RoundButton, Screen, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useMoney, useSummary, type ScheduledPayment } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDay, formatMoney, parseMoney, toInput } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

const toTr = (iso: string) => iso.split('-').reverse().join('.');
function fromTr(s: string) {
  const m = s.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// Ödeme takviminde tek bir kalem: düzenle, ödendi işaretle (isteğe bağlı zarftan düş), sil
export default function ScheduleItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refetch } = useMoney();
  const item = data ? [...data.months.flatMap((m) => m.items), ...data.recentPaid].find((p) => p.id === id) : undefined;
  if (!item) return <Loading error={error ?? (data ? new Error('Ödeme bulunamadı') : undefined)} onRetry={refetch} />;
  return <ItemForm key={item.id} item={item} sources={data!.sources} />;
}

function ItemForm({ item, sources }: { item: ScheduledPayment; sources: string[] }) {
  const c = useTheme();
  const toast = useToast();
  const { data: summary } = useSummary();
  const [name, setName] = useState(item.name);
  const [source, setSource] = useState(item.source);
  const [amount, setAmount] = useState(toInput(item.amount));
  const [date, setDate] = useState(toTr(item.dueDate));
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const dueDate = fromTr(date);
  const valid = name.trim() && source.trim() && parseMoney(amount) > 0 && dueDate;
  const paid = !!item.paidAt;

  const body = () => ({ name: name.trim(), source: source.trim(), amount: parseMoney(amount), dueDate: dueDate! });
  const save = useApiMutation(() => api('PATCH', `/schedule/${item.id}`, body()));
  const markPaid = useApiMutation((v: { paid: boolean }) => api('PATCH', `/schedule/${item.id}`, { ...body(), paid: v.paid, ...(v.paid && envelopeId ? { envelopeId } : {}) }));
  const remove = useApiMutation(() => api('DELETE', `/schedule/${item.id}`));

  return (
    <Screen
      header={
        <Header
          caption={item.source}
          title={paid ? 'Ödendi' : 'Ödemeyi düzenle'}
          onClose={goBack}
          right={
            <RoundButton
              icon="trash-outline"
              color={c.danger}
              label="Ödemeyi sil"
              onPress={async () => {
                if (await confirm('Ödeme silinsin mi?', `${item.name} · ${formatMoney(item.amount)} · ${formatDay(item.dueDate, true)}`)) remove.mutate(undefined, { onSuccess: goBack });
              }}
            />
          }
        />
      }
      footer={
        <View style={{ gap: 8 }}>
          {paid ? (
            <Button
              title="Ödenmedi olarak geri al"
              kind="secondary"
              loading={markPaid.isPending}
              onPress={() => markPaid.mutate({ paid: false }, { onSuccess: () => (toast({ message: item.transactionId ? 'Geri alındı, kaydedilen harcama da silindi' : 'Geri alındı' }), goBack()) })}
            />
          ) : (
            <Button
              title={envelopeId ? 'Ödendi · harcama olarak kaydet' : 'Ödendi'}
              icon="checkmark"
              disabled={!valid}
              loading={markPaid.isPending}
              onPress={() => markPaid.mutate({ paid: true }, { onSuccess: () => (toast({ message: `${name.trim()} ödendi` }), goBack()) })}
            />
          )}
          <Button title="Değişiklikleri kaydet" kind="ghost" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: goBack })} />
        </View>
      }>
      <Field label="Adı" value={name} onChangeText={setName} maxLength={80} />
      <Field label="Tutar" value={amount} onChangeText={(s) => setAmount(s.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" inputMode="decimal" />
      <Field label="Tarih" value={date} onChangeText={setDate} placeholder="gg.aa.yyyy" keyboardType="numbers-and-punctuation" hint={dueDate ? formatDay(dueDate, true) : 'Tarihi gg.aa.yyyy biçiminde yaz.'} />
      <Field label="Kaynak" value={source} onChangeText={setSource} maxLength={60} hint="Aynı kaynaktaki kalemler Borçlarım’da tek borç olarak toplanır." />
      {sources.length > 1 && (
        <Wrap>
          {sources.map((s) => (
            <Chip key={s} label={s} active={source === s} onPress={() => setSource(s)} />
          ))}
        </Wrap>
      )}
      {!paid && summary?.cycle && summary.envelopes.length > 0 && (
        <>
          <T v="tiny" muted>Ödendi derken bir kategoriye harcama olarak da yazılsın mı? (isteğe bağlı)</T>
          <Wrap>
            {summary.envelopes.map((e) => (
              <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(envelopeId === e.id ? null : e.id)} />
            ))}
          </Wrap>
          {envelopeId && <T v="small" muted>Tutar seçtiğin kategoriye bugünün harcaması olarak yazılır; geri alırsan harcama da silinir.</T>}
        </>
      )}
      {paid && item.transactionId && <T v="small" muted>Bu ödeme bir kategoriye harcama olarak da kaydedildi.</T>}
      <ErrorText error={save.error ?? markPaid.error ?? remove.error} />
    </Screen>
  );
}
