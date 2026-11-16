import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ErrorText, Field, Glow, ListRow, Loading, Row, SectionTitle, T, type IconName } from '@/components/ui';
import { api, useApiMutation, useDebts, useMoney, type Account, type Debt, type MoneyOverview } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { DEBT_TYPES } from '@/lib/debt';
import { formatDay, formatMoney, formatMonth, relativeDay, todayIso } from '@/lib/money';
import { useTheme } from '@/lib/theme';

const KIND: Record<Account['kind'], { icon: IconName; bg: string }> = {
  bank: { icon: 'business-outline', bg: '#A7D3F2' },
  card: { icon: 'card-outline', bg: '#F7B49A' },
  cash: { icon: 'wallet-outline', bg: '#A8E6A1' },
};
const m0 = (n: number) => formatMoney(n, { cents: false });

function accountLine(a: Account) {
  if (a.kind === 'card') return `Borç ${m0(-a.balance)}${a.pending ? ` · provizyon ${m0(a.pending)}` : ''}${a.dueDate ? ` · ekstre ${formatDay(a.dueDate)}` : ''}`;
  if (a.kind === 'bank' && a.creditLimit) return `Bakiye ${m0(a.balance)} · esnek hesap ${m0(a.creditLimit)}`;
  return `Bakiye ${m0(a.balance)}`;
}

function debtLine(d: Debt) {
  if (d.balance <= 0) return 'Kapandı';
  if (d.scheduleSource && d.payoffDate) return `Sıradaki ${m0(d.monthlyPayment)} · son taksit ${formatMonth(d.payoffDate, true)}`;
  if (d.payoffDate) return `Ayda ${m0(d.monthlyPayment)} · ${formatMonth(d.payoffDate, true)} biter`;
  return d.monthlyPayment > 0 ? 'Aylık ödeme faizi karşılamıyor' : 'Aylık ödeme gir, bitiş tarihini hesaplayalım';
}

// Hesaplar: bakiyeler, borçlar, net durum geçmişi ve taksit kaynakları
export default function Accounts() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { data, error, refetch, isRefetching } = useMoney();
  const { data: debts } = useDebts();
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const staleDays = data.staleSince ? Math.round((Date.parse(todayIso()) - Date.parse(data.staleSince.slice(0, 10))) / 86_400_000) : 0;
  const debtTotal = (debts ?? []).reduce((s, d) => s + Math.max(0, d.balance), 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Glow />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={c.muted} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="title">Hesaplar</T>
            <T v="small" muted>Bankadaki paran ve borçların</T>
          </View>
          <Button title="Hesap" icon="add" small kind="secondary" onPress={() => router.push('/account?id=new')} />
        </Row>

        <Card style={{ gap: 6 }}>
          <T v="small" muted>Hemen kullanılabilir (esnek hesap dahil)</T>
          <T v="display" color={data.totals.available < 0 ? c.danger : c.text}>{m0(data.totals.available)}</T>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="small" muted>Kartlarda kullanılabilir</T>
            <T v="small">{m0(data.totals.cardAvailable)}</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="small" muted>Net durum (bakiyeler)</T>
            <T v="small" color={data.totals.net < 0 ? c.danger : c.success}>{m0(data.totals.net)}</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="small" muted>Toplam borç (taksitler dahil)</T>
            <T v="small" color={c.danger}>{m0(debtTotal)}</T>
          </Row>
          {data.totals.monthlyInterest > 0 && <T v="small" color={c.danger}>Eksi bakiyelerin aylık tahmini faiz maliyeti ~{m0(data.totals.monthlyInterest)}</T>}
        </Card>

        {staleDays >= 7 && (
          <ListRow icon="refresh" iconBg="#F8D66D" title={`Bakiyelerin ${staleDays} gündür güncellenmedi`} subtitle="Hesaba dokunup bankadaki güncel rakamları gir" chevron={false} />
        )}

        <SectionTitle title="Bakiyeler" />
        {data.accounts.length === 0 ? (
          <Empty title="Henüz hesap yok" text="Vadesiz hesabını, kredi kartını ya da nakdini ekle; bakiyeleri buradan takip et." action="Hesap ekle" onAction={() => router.push('/account?id=new')} />
        ) : (
          data.accounts.map((a) => (
            <ListRow
              key={a.id}
              icon={KIND[a.kind].icon}
              iconBg={KIND[a.kind].bg}
              title={a.name}
              subtitle={
                <View>
                  <T v="small" muted>{accountLine(a)}</T>
                  {a.monthlyInterest ? <T v="tiny" color={c.danger} style={{ fontWeight: '400' }}>Faiz ~{m0(a.monthlyInterest)}/ay{a.payoffDate ? ` · ${formatMonth(a.payoffDate)} kapanır` : ''}</T> : null}
                  <T v="tiny" muted style={{ fontWeight: '400' }}>Güncelleme: {relativeDay(a.updatedAt.slice(0, 10))}</T>
                </View>
              }
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="label" color={a.available > 0 ? c.text : c.danger}>{m0(a.available)}</T>
                  <T v="tiny" muted>kullanılabilir</T>
                </View>
              }
              onPress={() => router.push(`/account?id=${a.id}`)}
            />
          ))
        )}

        <SectionTitle title="Borçlar" action="Kapatma planı" onAction={() => router.push('/debts')} />
        {!debts?.length ? (
          <T v="small" muted>Eksi bakiyeler, kart borcu ve taksitler burada kendiliğinden listelenir.</T>
        ) : (
          debts.map((d) => {
            const type = DEBT_TYPES.find((t) => t.key === d.type)!;
            return (
              <ListRow
                key={d.id}
                icon={type.icon}
                iconBg={d.balance > 0 ? '#FF8A73' : '#A8E6A1'}
                title={d.name}
                subtitle={
                  <View>
                    <T v="small" muted>{debtLine(d)}</T>
                    {d.auto && <T v="tiny" muted style={{ fontWeight: '400' }}>{d.scheduleSource ? 'Ödeme takviminden' : 'Bakiyeden'}</T>}
                  </View>
                }
                right={<T v="label">{m0(d.balance)}</T>}
                onPress={() => router.push(`/debt/${d.id}`)}
              />
            );
          })
        )}
        <Button title="Elle borç ekle" icon="add" small kind="ghost" onPress={() => router.push('/debt/new')} />

        <History history={data.history ?? []} />
        <Sources data={data} />
      </ScrollView>
    </View>
  );
}

// Net durum geçmişi: bakiyeler güncellendikçe toplam net değerin seyri
function History({ history }: { history: MoneyOverview['history'] }) {
  const c = useTheme();
  if (history.length < 2) return null;
  const vals = history.map((h) => h.net);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const first = vals[0];
  const last = vals.at(-1)!;
  return (
    <>
      <SectionTitle title="Net durum geçmişi" />
      <Card style={{ gap: 10 }}>
        <T v="small" muted>
          {formatDay(history[0].day)}’den beri{' '}
          <T v="small" color={last >= first ? c.success : c.danger}>
            {last >= first ? '+' : ''}
            {m0(last - first)}
          </T>
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60 }}>
          {history.slice(-40).map((h) => (
            <View key={h.day} style={{ flex: 1, height: `${Math.max(4, ((h.net - min) / span) * 100)}%`, borderRadius: 3, backgroundColor: h.net < 0 ? c.danger : c.success, opacity: 0.8 }} />
          ))}
        </View>
      </Card>
    </>
  );
}

// Taksit ve kredi kaynakları: yeniden adlandır, birleştir ya da sil
function Sources({ data }: { data: MoneyOverview }) {
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const removeSource = useApiMutation((source: string) => api<{ deleted: number }>('DELETE', `/schedule?source=${encodeURIComponent(source)}`));
  const rename = useApiMutation((v: { from: string; to: string }) => api('POST', '/schedule/rename', v));
  // Kart ekstreleri karttan yönetilir
  const statements = new Set(data.accounts.filter((a) => a.kind === 'card').map((a) => `${a.name} ekstresi`));
  const sources = data.sources.filter((s) => !statements.has(s));
  if (!sources.length) return null;

  return (
    <>
      <SectionTitle title="Taksit ve kredi kaynakları" action="Yapıştırarak ekle" onAction={() => router.push('/schedule-import')} />
      <T v="tiny" muted style={{ fontWeight: '400' }}>Her kaynak Borçlar’da tek borç olarak görünür. Aynı adı verirsen iki kaynak birleşir.</T>
      {sources.map((s) =>
        renaming?.from === s ? (
          <Card key={s} style={{ gap: 10 }}>
            <Field label="Yeni ad" value={renaming.to} onChangeText={(to) => setRenaming({ from: s, to })} maxLength={60} />
            <Row>
              <Button
                title="Kaydet"
                small
                style={{ flex: 1 }}
                disabled={!renaming.to.trim() || renaming.to.trim() === s}
                loading={rename.isPending}
                onPress={() => rename.mutate({ from: s, to: renaming.to.trim() }, { onSuccess: () => setRenaming(null) })}
              />
              <Button title="Vazgeç" small kind="ghost" onPress={() => setRenaming(null)} />
            </Row>
          </Card>
        ) : (
          <Row key={s} style={{ justifyContent: 'space-between' }}>
            <Ionicons name="layers-outline" size={16} color="#9A958F" />
            <T v="small" style={{ flex: 1 }}>{s}</T>
            <Button title="Adını değiştir" small kind="ghost" onPress={() => setRenaming({ from: s, to: s })} />
            <Button
              title="Sil"
              small
              kind="ghost"
              onPress={async () => {
                if (await confirm(`${s} silinsin mi?`, 'Bu kaynağın ödenmemiş tüm kalemleri takvimden kaldırılır. Yanlış yapıştırdıysan sonra yeniden ekleyebilirsin.'))
                  removeSource.mutate(s, { onSuccess: (r) => toast({ message: `${r.deleted} kalem silindi` }) });
              }}
            />
          </Row>
        ),
      )}
      <ErrorText error={removeSource.error ?? rename.error} />
    </>
  );
}
