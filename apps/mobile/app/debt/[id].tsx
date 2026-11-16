import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, ErrorText, Field, Header, Loading, RoundButton, Screen, Segmented, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useDebts, useSummary, type Debt } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatMoney, parseMoney, toInput } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { DEBT_TYPES } from '@/lib/debt';

export default function DebtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refetch } = useDebts();
  const debt = data?.find((d) => d.id === id);
  if (id !== 'new' && !debt) return <Loading error={error ?? (data ? new Error('Borç bulunamadı') : undefined)} onRetry={refetch} />;
  return <DebtForm key={debt?.id ?? 'new'} id={id} debt={debt} />;
}

function DebtForm({ id, debt }: { id: string; debt?: Debt }) {
  const c = useTheme();
  const isNew = id === 'new';
  const { data: summary } = useSummary();
  const [envelopeId, setEnvelopeId] = useState<string | null>(debt?.envelopeId ?? null);
  const [name, setName] = useState(debt?.name ?? '');
  const [type, setType] = useState<Debt['type']>(debt?.type ?? 'card');
  const [balance, setBalance] = useState(debt ? toInput(debt.balance) : '');
  const [monthly, setMonthly] = useState(debt ? toInput(debt.monthlyPayment) : '');
  const [dueDay, setDueDay] = useState(debt?.dueDay ? String(debt.dueDay) : '');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>(debt?.ratePeriod ?? 'monthly');
  const [rate, setRate] = useState(debt?.interestRate ? String(debt.interestRate / 100).replace('.', ',') : '');


  const day = dueDay ? Number(dueDay) : null;
  const rateNum = rate ? Math.round(Number(rate.replace(',', '.')) * 100) : null;
  const auto = !!debt?.auto;
  const valid = name.trim() && (auto || parseMoney(balance) > 0) && (day === null || (day >= 1 && day <= 31)) && (rateNum === null || Number.isFinite(rateNum));

  const save = useApiMutation(async () => {
    const body = auto
      ? { ...(debt?.scheduleSource ? {} : { monthlyPayment: parseMoney(monthly) }), dueDay: day, interestRate: rateNum, ratePeriod: period, envelopeId }
      : { name: name.trim(), type, balance: parseMoney(balance), monthlyPayment: parseMoney(monthly), dueDay: day, interestRate: rateNum, ratePeriod: period, envelopeId };
    if (isNew) await api('POST', '/debts', body);
    else await api('PATCH', `/debts/${id}`, body);
  });
  const remove = useApiMutation(() => api('DELETE', `/debts/${id}`));


  return (
    <Screen
      header={
        <Header
          caption="Borçlarım"
          title={isNew ? 'Borç ekle' : 'Borcu düzenle'}
          onClose={goBack}
          right={
            !isNew && !auto ? (
              <RoundButton
                icon="trash-outline"
                color={c.danger}
                onPress={async () => {
                  if (await confirm('Borç silinsin mi?', 'Bu borç listeden kaldırılır.')) remove.mutate(undefined, { onSuccess: goBack });
                }}
              />
            ) : undefined
          }
        />
      }
      footer={<Button title="Kaydet" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: goBack })} />}>
      {auto && debt ? (
        <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 16, gap: 4 }}>
          <T v="label">{debt.name}</T>
          <T v="display">{formatMoney(debt.balance, { cents: false })}</T>
          <T v="small" muted>
            {debt.scheduleSource
              ? 'Bu borç ödeme takviminden geliyor; kalan taksitler ödendikçe kendiliğinden azalır.'
              : 'Bakiye Banka durumundan güncellenir. Aylık ne kadar ödeyeceğini ve faiz oranını girersen kapatma planı ve aylık faiz maliyeti hesaplanır.'}
          </T>
        </View>
      ) : (
        <>
          <Field label="Adı" value={name} onChangeText={setName} placeholder="Kredi kartım" maxLength={60} />
          <T v="tiny" muted>Türü</T>
          <Wrap>
            {DEBT_TYPES.map((t) => (
              <Chip key={t.key} label={t.label} icon={t.icon} active={type === t.key} onPress={() => setType(t.key)} />
            ))}
          </Wrap>
          <Field label="Şu an ne kadar borcun var?" value={balance} onChangeText={(s) => setBalance(s.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" inputMode="decimal" placeholder="0" />
        </>
      )}
      {!debt?.scheduleSource && <Field
        label="Her ay ne kadar ödüyorsun?"
        value={monthly}
        onChangeText={(s) => setMonthly(s.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        hint={auto ? 'Esnek hesap için: her ay kapatmak için ayıracağın tutar.' : 'Asgari ödemen. Belirli bir tutar yoksa 0 yaz.'}
      />}
      <Field
        label="Ödeme günü (isteğe bağlı)"
        value={dueDay}
        onChangeText={(s) => setDueDay(s.replace(/\D/g, '').slice(0, 2))}
        keyboardType="number-pad"
        placeholder="15"
        hint="Ayın hangi günü ödeniyor."
      />
      <T v="tiny" muted>Faiz oranı (isteğe bağlı)</T>
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { key: 'monthly', label: 'Aylık' },
          { key: 'yearly', label: 'Yıllık' },
        ]}
      />
      <Field value={rate} onChangeText={(s) => setRate(s.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" inputMode="decimal" placeholder="%" hint="Ekstrende yazar. Bilmiyorsan boş bırak." />
      {summary && summary.envelopes.length > 0 && (
        <>
          <T v="tiny" muted>Ödemeler hangi kategoriye yazılsın? (isteğe bağlı)</T>
          <Wrap>
            {summary.envelopes.map((e) => (
              <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(envelopeId === e.id ? null : e.id)} />
            ))}
          </Wrap>
        </>
      )}
      <ErrorText error={save.error ?? remove.error} />
    </Screen>
  );
}
