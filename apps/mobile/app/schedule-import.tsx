import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorText, Field, Header, Row, Screen, SectionTitle, T } from '@/components/ui';
import { api, useApiMutation } from '@/lib/api';
import { formatDay, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { parseSchedule } from '@/lib/schedule';
import { useTheme } from '@/lib/theme';

const EXAMPLE = `kredi kartı taksitleri :
11/11/2026
zara 1495 tl
mediamarkt 8289 tl

ihtiyaç kredisi :
20/11/2026 14254 tl
20/12/2026 14254 tl`;

// Bankadan kopyalanan taksit ve kredi listesini ödeme takvimine ekler
export default function ScheduleImport() {
  const c = useTheme();
  const toast = useToast();
  const [text, setText] = useState('');
  // Kaynak adları önizlemede değiştirilebilir
  const [rename, setRename] = useState<Record<string, string>>({});
  const { items, warnings } = parseSchedule(text);
  const sources = [...new Set(items.map((i) => i.source))];
  const final = items.map((i) => {
    const source = (rename[i.source] ?? i.source).trim() || i.source;
    return { ...i, source, name: i.name === i.source ? source : i.name };
  });
  const total = items.reduce((s, i) => s + i.amount, 0);

  const save = useApiMutation(() => api<{ added: number; skipped: number }>('POST', '/schedule', { items: final }));

  return (
    <Screen
      header={<Header caption="Banka durumu" title="Ödemeleri yapıştır" onClose={goBack} back />}
      footer={
        <Button
          title={items.length ? `${items.length} ödemeyi ekle · ${formatMoney(total, { cents: false })}` : 'Ödemeleri ekle'}
          disabled={!items.length}
          loading={save.isPending}
          onPress={() =>
            save.mutate(undefined, {
              onSuccess: (r) => {
                toast({ message: r.skipped ? `${r.added} ödeme eklendi, ${r.skipped} zaten kayıtlıydı` : `${r.added} ödeme eklendi` });
                goBack();
              },
            })
          }
        />
      }>
      <T muted>
        Banka uygulamandaki taksit ve kredi listesini kopyalayıp yapıştır. “İhtiyaç kredisi :” gibi iki noktayla biten satırlar başlık, tarih satırları altındaki kalemlerin tarihi olur.
      </T>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder={EXAMPLE}
        placeholderTextColor={c.faint}
        accessibilityLabel="Ödeme listesi"
        style={{ minHeight: 220, borderRadius: 20, padding: 16, backgroundColor: c.card, color: c.text, fontSize: 15, textAlignVertical: 'top' }}
      />
      {warnings.map((w) => (
        <T key={w} v="small" color={c.danger}>{w}</T>
      ))}

      {sources.length > 0 && (
        <>
          <SectionTitle title="Önizleme" />
          {sources.map((s) => {
            const rows = items.filter((i) => i.source === s);
            return (
              <Card key={s} style={{ gap: 10 }}>
                <Field label="Kaynak adı" value={rename[s] ?? s} onChangeText={(v) => setRename({ ...rename, [s]: v })} maxLength={60} />
                {rows.map((i, k) => (
                  <Row key={k} gap={10}>
                    <T v="small" muted style={{ width: 64 }}>{formatDay(i.dueDate)}</T>
                    <View style={{ flex: 1 }}>
                      <T v="small" numberOfLines={1}>{i.name === s ? (rename[s] ?? s) : i.name}</T>
                    </View>
                    <T v="small">{formatMoney(i.amount)}</T>
                  </Row>
                ))}
                <T v="tiny" muted>
                  {rows.length} kalem · {formatMoney(rows.reduce((t, i) => t + i.amount, 0))}
                </T>
              </Card>
            );
          })}
        </>
      )}
      <ErrorText error={save.error} />
    </Screen>
  );
}
