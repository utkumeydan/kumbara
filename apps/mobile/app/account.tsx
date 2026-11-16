import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Header, Loading, RoundButton, Screen, Segmented, T } from '@/components/ui';
import { api, useApiMutation, useMoney, type Account } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatMoney, parseMoney, toInput } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

// "-1.250,50" gibi eksi tutarları da kabul eder
function parseSigned(s: string) {
  const neg = s.trim().startsWith('-');
  const n = parseMoney(s.replace('-', ''));
  return neg ? -n : n;
}
const signedInput = (n: number) => (n < 0 ? `-${toInput(-n)}` : toInput(n));
const clean = (s: string, allowMinus = false) => s.replace(allowMinus ? /[^\d.,-]/g : /[^\d.,]/g, '');

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refetch } = useMoney();
  const account = data?.accounts.find((a) => a.id === id);
  if (id !== 'new' && !account) return <Loading error={error ?? (data ? new Error('Hesap bulunamadı') : undefined)} onRetry={refetch} />;
  return <AccountForm key={account?.id ?? 'new'} account={account} />;
}

function AccountForm({ account }: { account?: Account }) {
  const c = useTheme();
  const isNew = !account;
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(account?.kind ?? 'bank');
  // Banka: bakiye (eksi olabilir) ve esnek hesap dahil kullanılabilir tutar; kart: limit, borç, provizyon
  const [balance, setBalance] = useState(account && account.kind !== 'card' ? signedInput(account.balance) : '');
  const [available, setAvailable] = useState(account?.kind === 'bank' && account.creditLimit ? toInput(account.balance + account.creditLimit) : '');
  // Kartta banka "kullanılabilir limit"i gösterir; toplam limit = kullanılabilir + borç + provizyon olarak saklanır
  const [limit, setLimit] = useState(account?.kind === 'card' ? toInput(account.available) : '');
  const [debt, setDebt] = useState(account?.kind === 'card' ? toInput(-account.balance) : '');
  const [pending, setPending] = useState(account?.kind === 'card' ? toInput(account.pending) : '');
  // Kart ekstresi: son ödeme tarihi ve ödenecek tutar ödeme takvimine düşer
  const [dueDate, setDueDate] = useState(account?.dueDate ? account.dueDate.split('-').reverse().join('.') : '');
  const [dueAmount, setDueAmount] = useState(account?.dueAmount ? toInput(account.dueAmount) : '');
  const dueIso = (() => {
    const m = dueDate.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  })();

  const bal = kind === 'card' ? -parseMoney(debt) : parseSigned(balance);
  const creditLimit = kind === 'card' ? parseMoney(limit) - bal + parseMoney(pending) : kind === 'bank' && available ? Math.max(0, parseMoney(available) - bal) : null;
  const valid = name.trim() && (kind !== 'card' || parseMoney(limit) > 0) && (!dueDate.trim() || dueIso);

  const save = useApiMutation(async () => {
    const card = kind === 'card';
    const body = {
      name: name.trim(),
      kind,
      balance: bal,
      creditLimit,
      pending: card ? parseMoney(pending) : 0,
      dueDate: card && dueIso && parseMoney(dueAmount) > 0 ? dueIso : null,
      dueAmount: card && dueIso && parseMoney(dueAmount) > 0 ? parseMoney(dueAmount) : null,
    };
    if (isNew) await api('POST', '/accounts', body);
    else await api('PATCH', `/accounts/${account.id}`, body);
  });
  const remove = useApiMutation(() => api('DELETE', `/accounts/${account!.id}`));

  return (
    <Screen
      header={
        <Header
          caption="Banka durumu"
          title={isNew ? 'Hesap ekle' : 'Hesabı güncelle'}
          onClose={goBack}
          right={
            !isNew ? (
              <RoundButton
                icon="trash-outline"
                color={c.danger}
                label="Hesabı sil"
                onPress={async () => {
                  if (await confirm('Hesap silinsin mi?', 'Yalnızca bu hesabın bakiye kaydı silinir; bütçen ve harcamaların etkilenmez.')) remove.mutate(undefined, { onSuccess: goBack });
                }}
              />
            ) : undefined
          }
        />
      }
      footer={<Button title="Kaydet" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: goBack })} />}>
      <Field label="Adı" value={name} onChangeText={setName} placeholder={kind === 'card' ? 'Ör. Bonus kart' : 'Ör. Vadesiz hesap'} maxLength={60} />
      <T v="tiny" muted>Türü</T>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { key: 'bank', label: 'Banka', icon: 'business-outline' },
          { key: 'card', label: 'Kredi kartı', icon: 'card-outline' },
          { key: 'cash', label: 'Nakit', icon: 'wallet-outline' },
        ]}
      />
      {kind === 'card' ? (
        <>
          <Field
            label="Kullanılabilir limit"
            value={limit}
            onChangeText={(s) => setLimit(clean(s))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            hint="Banka uygulamasında görünen, şu an harcayabileceğin limit."
          />
          <Field label="Güncel kart borcu" value={debt} onChangeText={(s) => setDebt(clean(s))} keyboardType="decimal-pad" inputMode="decimal" placeholder="0" hint="Ekstre ve dönem içi harcamalar dahil, bankanın gösterdiği borç." />
          <Field label="Bekleyen provizyonlar (isteğe bağlı)" value={pending} onChangeText={(s) => setPending(clean(s))} keyboardType="decimal-pad" inputMode="decimal" placeholder="0" hint="Henüz borca yansımamış harcamaların toplamı." />
          {parseMoney(limit) > 0 && <T v="small" muted>Toplam kart limitin {formatMoney(creditLimit ?? 0, { cents: false })} olarak hesaplandı.</T>}
          <T v="tiny" muted style={{ marginTop: 6 }}>Ekstre (isteğe bağlı)</T>
          <Field label="Son ödeme tarihi" value={dueDate} onChangeText={setDueDate} placeholder="gg.aa.yyyy" keyboardType="numbers-and-punctuation" />
          <Field
            label="Ödeyeceğin tutar"
            value={dueAmount}
            onChangeText={(s) => setDueAmount(clean(s))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            hint="Ekstre borcu ya da asgari tutar. Ödeme takvimine ve Borçlarım’a yansır."
          />
        </>
      ) : (
        <>
          <Field
            label="Bakiye"
            value={balance}
            onChangeText={(s) => setBalance(clean(s, true))}
            keyboardType="numbers-and-punctuation"
            inputMode="decimal"
            placeholder="0"
            hint={kind === 'bank' ? 'Esnek hesap kullanıyorsan başına eksi koy: -105.156,37' : undefined}
          />
          {kind === 'bank' && (
            <Field
              label="Kullanılabilir tutar (esnek hesap dahil, isteğe bağlı)"
              value={available}
              onChangeText={(s) => setAvailable(clean(s))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0"
              hint={creditLimit ? `Esnek hesap limitin ${formatMoney(creditLimit, { cents: false })} olarak hesaplandı.` : 'Banka uygulamandaki “kullanılabilir bakiye”.'}
            />
          )}
        </>
      )}
      {account?.debtId && (
        <Button
          title={account.monthlyInterest ? `Faiz ~${formatMoney(account.monthlyInterest, { cents: false })}/ay · kapatma planı` : 'Faiz oranı ve kapatma planı'}
          kind="secondary"
          icon="trending-down-outline"
          onPress={() => router.push(`/debt/${account.debtId}`)}
        />
      )}
      <ErrorText error={save.error ?? remove.error} />
    </Screen>
  );
}
