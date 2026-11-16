import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ErrorText, Header, Loading, RoundButton, Row, Screen, SectionTitle, T } from '@/components/ui';
import { api, useApiMutation, useBalances, useSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

// Hesaplaşma: ortak alanda kimin ne ödediği, payına düşen ve kim kime ne kadar borçlu
export default function Settle() {
  const c = useTheme();
  const toast = useToast();
  const { user, space } = useAuth();
  const { data: summary } = useSummary();
  const { data, error, refetch } = useBalances(space);
  const [editing, setEditing] = useState<Record<string, number> | null>(null);
  const pay = useApiMutation((v: { toUserId: string; amount: number }) => api('POST', `/spaces/${space}/settlements`, v));
  const saveShares = useApiMutation((shares: { userId: string; share: number }[] | null) => api('PATCH', `/spaces/${space}/shares`, { shares }));

  if (!space) {
    return (
      <Screen header={<Header title="Hesaplaşma" onClose={goBack} back />}>
        <Empty title="Önce bir ortak alan seç" text="Hesaplaşma, Birlikte alanlarında kimin ne ödediğini gösterir." action="Birlikte'ye git" onAction={() => router.push('/together')} />
      </Screen>
    );
  }
  if (!data) return <Loading error={error} onRetry={refetch} />;
  const sum = editing ? Object.values(editing).reduce((s, x) => s + x, 0) : 100;

  return (
    <Screen header={<Header caption={summary?.space?.name} title="Hesaplaşma" onClose={goBack} back />}>
      <T muted>Ortak harcamalar paylara göre bölünür. Ödeme yaptığında “Ödedim” de, bakiye sıfırlansın.</T>
      <Card style={{ gap: 4 }}>
        <T v="small" muted>Ortak harcama toplamı</T>
        <T v="display">{formatMoney(data.total, { cents: false })}</T>
      </Card>

      {data.transfers.length === 0 ? (
        <Card>
          <Row gap={10}>
            <Ionicons name="checkmark-circle" size={22} color={c.success} />
            <T v="label">Ödeşiksiniz, kimsenin kimseye borcu yok.</T>
          </Row>
        </Card>
      ) : (
        data.transfers.map((x) => {
          const mine = x.fromUserId === user?.id;
          return (
            <Card key={`${x.fromUserId}-${x.toUserId}`} style={{ gap: 12 }}>
              <T v="h2">
                {mine ? 'Sen' : x.fromName} → {x.toUserId === user?.id ? 'sana' : x.toName}
              </T>
              <T v="display">{formatMoney(x.amount, { cents: false })}</T>
              {mine && (
                <Button
                  title="Ödedim"
                  icon="checkmark"
                  loading={pay.isPending}
                  onPress={async () => {
                    if (await confirm('Ödeme işaretlensin mi?', `${x.toName} kişisine ${formatMoney(x.amount)} ödediğin kaydedilecek.`, 'Ödedim'))
                      pay.mutate({ toUserId: x.toUserId, amount: x.amount }, { onSuccess: () => toast({ message: 'Ödeme kaydedildi' }) });
                  }}
                />
              )}
            </Card>
          );
        })
      )}
      <ErrorText error={pay.error} />

      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <T v="tiny" muted>Üyeler ve paylar {data.customShares ? '' : '(eşit)'}</T>
        {!editing ? (
          <Button title="Payları düzenle" small kind="ghost" onPress={() => setEditing(Object.fromEntries(data.members.map((m) => [m.userId, m.share])))} />
        ) : null}
      </Row>
      {data.members.map((m) => (
        <Card key={m.userId}>
          <Row gap={12}>
            <Avatar index={m.avatar} size={40} />
            <View style={{ flex: 1 }}>
              <T v="label">{m.userId === user?.id ? `${m.name} (sen)` : m.name}</T>
              <T v="small" muted>
                ödedi {formatMoney(m.paid, { cents: false })} · payı {formatMoney(m.fair, { cents: false })}
              </T>
            </View>
            {editing ? (
              <Row gap={6}>
                <RoundButton icon="remove" size={32} label={`${m.name} payını azalt`} onPress={() => setEditing({ ...editing, [m.userId]: Math.max(0, editing[m.userId] - 5) })} />
                <T v="label" style={{ width: 40, textAlign: 'center' }}>%{editing[m.userId]}</T>
                <RoundButton icon="add" size={32} label={`${m.name} payını artır`} onPress={() => setEditing({ ...editing, [m.userId]: Math.min(100, editing[m.userId] + 5) })} />
              </Row>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <T v="label" color={m.net > 0 ? c.success : m.net < 0 ? c.danger : c.muted}>
                  {m.net > 0 ? '+' : ''}
                  {formatMoney(m.net, { cents: false })}
                </T>
                <T v="tiny" muted>%{m.share}</T>
              </View>
            )}
          </Row>
        </Card>
      ))}
      {editing && (
        <>
          {sum !== 100 && <T v="small" color={c.danger}>Payların toplamı %{sum}; %100 olmalı.</T>}
          <Row>
            <Button
              title="Payları kaydet"
              style={{ flex: 1 }}
              disabled={sum !== 100}
              loading={saveShares.isPending}
              onPress={() => saveShares.mutate(Object.entries(editing).map(([userId, share]) => ({ userId, share })), { onSuccess: () => setEditing(null) })}
            />
            <Button title="Eşit böl" kind="secondary" onPress={() => saveShares.mutate(null, { onSuccess: () => setEditing(null) })} />
          </Row>
          <ErrorText error={saveShares.error} />
        </>
      )}

      {data.history.length > 0 && (
        <>
          <SectionTitle title="Geçmiş ödemeler" />
          <Card style={{ gap: 10 }}>
            {data.history.map((h) => (
              <Row key={h.id} style={{ justifyContent: 'space-between' }}>
                <T v="small">
                  {h.from} → {h.to}
                </T>
                <T v="small" muted>
                  {formatMoney(h.amount, { cents: false })} · {relativeDay(h.createdAt.slice(0, 10))}
                </T>
              </Row>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
