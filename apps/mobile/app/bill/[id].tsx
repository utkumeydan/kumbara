import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';
import { Button, Card, Chip, ErrorText, Field, Header, Loading, RoundButton, Row, Screen, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useBills, useSummary, type Bill, type Summary } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { parseMoney, toInput } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

export default function BillScreen() {
  const { id, installment } = useLocalSearchParams<{ id: string; installment?: string }>();
  const billsQ = useBills();
  const summaryQ = useSummary();
  const bills = billsQ.data;
  const summary = summaryQ.data;
  const bill = bills?.find((b) => b.id === id);
  if (!summary || (id !== 'new' && !bill))
    return <Loading error={summaryQ.error ?? billsQ.error ?? (bills && !bill ? new Error('Fatura bulunamadı') : undefined)} onRetry={() => (billsQ.refetch(), summaryQ.refetch())} />;
  return <BillForm key={bill?.id ?? 'new'} id={id} bill={bill} summary={summary} installment={!!installment} />;
}

function BillForm({ id, bill, summary, installment }: { id: string; bill?: Bill; summary: Summary; installment: boolean }) {
  const c = useTheme();
  const isNew = id === 'new';

  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(bill ? toInput(bill.amount) : '');
  const [dueDay, setDueDay] = useState(bill ? String(bill.dueDay) : '1');
  const [envelopeId, setEnvelopeId] = useState<string | null>(bill?.envelopeId ?? null);
  const [isInstallment, setIsInstallment] = useState(bill ? !!bill.installmentsTotal : installment);
  const [total, setTotal] = useState(bill?.installmentsTotal ? String(bill.installmentsTotal) : '');


  const day = Number(dueDay);
  const valid = name.trim() && parseMoney(amount) > 0 && day >= 1 && day <= 31 && (!isInstallment || Number(total) > 0);

  const save = useApiMutation(async () => {
    const body = { name: name.trim(), amount: parseMoney(amount), dueDay: day, envelopeId };
    if (isNew) await api('POST', '/bills', { ...body, installmentsTotal: isInstallment ? Number(total) : null });
    else await api('PATCH', `/bills/${id}`, body);
  });
  const remove = useApiMutation(() => api('DELETE', `/bills/${id}`));


  return (
    <Screen
      header={
        <Header
          caption="Maaştan önce"
          title={isNew ? (isInstallment ? 'Taksit ekle' : 'Fatura ekle') : bill!.name}
          onClose={goBack}
          right={
            !isNew ? (
              <RoundButton
                icon="trash-outline"
                color={c.danger}
                onPress={async () => {
                  if (await confirm('Silinsin mi?', 'Geçmiş ödemeler harcama olarak kalır.')) remove.mutate(undefined, { onSuccess: goBack });
                }}
              />
            ) : undefined
          }
        />
      }
      footer={<Button title="Kaydet" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: goBack })} />}>
      <Field label="Adı" value={name} onChangeText={setName} placeholder="Ör. Kira, Netflix, Telefon taksidi" maxLength={60} />
      <Field
        label={isInstallment ? 'Aylık taksit tutarı' : 'Tutar'}
        value={amount}
        onChangeText={(s) => setAmount(s.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
      />
      <Field label="Ayın kaçında ödeniyor?" value={dueDay} onChangeText={(s) => setDueDay(s.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />

      <T v="tiny" muted>Hangi kategoriye yazılsın?</T>
      <Wrap>
        {summary.envelopes.map((e) => (
          <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={envelopeId === e.id} onPress={() => setEnvelopeId(e.id)} />
        ))}
      </Wrap>

      {isNew ? (
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="label">Taksitli</T>
            <Switch value={isInstallment} onValueChange={setIsInstallment} trackColor={{ true: c.primary }} />
          </Row>
          {isInstallment && (
            <Field label="Toplam taksit sayısı" value={total} onChangeText={(s) => setTotal(s.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="12" />
          )}
        </Card>
      ) : bill!.installmentsTotal ? (
        <T muted>{bill!.installmentsPaid}/{bill!.installmentsTotal} taksit ödendi.</T>
      ) : null}
      <ErrorText error={save.error ?? remove.error} />
    </Screen>
  );
}
