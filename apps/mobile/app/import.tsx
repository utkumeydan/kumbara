import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { TurtleFace } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ErrorText, Field, Header, Loading, Row, Screen, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useSummary } from '@/lib/api';
import { extractRows, guessMapping, looksLikeHeader, parseCsv, type Field as CsvField, type Mapping } from '@/lib/csv';
import { formatDay, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/lib/theme';

const FIELDS: { key: CsvField; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Tarih', required: true },
  { key: 'amount', label: 'Tutar', required: true },
  { key: 'note', label: 'Açıklama' },
  { key: 'category', label: 'Kategori' },
];

type Result = { imported: number; skipped: { noCycle: number; duplicate: number; badEnvelope: number; future: number } };

// CSV içe aktarma: dosya seç ya da yapıştır, sütunları eşleştir, zarflara dağıt
export default function Import() {
  const c = useTheme();
  const toast = useToast();
  const { data: summary, error, refetch } = useSummary();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [expensesOnly, setExpensesOnly] = useState(true);
  const [defaultEnv, setDefaultEnv] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pickError, setPickError] = useState<unknown>(null);

  const table = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const hasHeader = table.length > 0 && looksLikeHeader(table[0]);
  const header = hasHeader ? table[0] : (table[0] ?? []).map((_, i) => `Sütun ${i + 1}`);
  const map = mapping ?? (table.length ? guessMapping(header) : null);
  const parsed = useMemo(() => (map ? extractRows(table, map, hasHeader) : []), [table, map, hasHeader]);
  const mixedSigns = parsed.some((r) => (r.amount ?? 0) < 0) && parsed.some((r) => (r.amount ?? 0) > 0);

  const envByName = new Map((summary?.envelopes ?? []).map((e) => [e.name.toLocaleLowerCase('tr-TR'), e.id]));
  const fallbackEnv = defaultEnv ?? summary?.envelopes[0]?.id ?? null;
  const rows = parsed
    .filter((r) => r.date && r.amount !== null && r.amount !== 0)
    .filter((r) => !(mixedSigns && expensesOnly && r.amount! > 0))
    .map((r) => ({ date: r.date!, amount: Math.abs(r.amount!), note: r.note.trim(), envelopeId: envByName.get(r.category.toLocaleLowerCase('tr-TR')) ?? fallbackEnv! }));
  const invalid = parsed.filter((r) => !r.date || r.amount === null).length;
  const matched = parsed.filter((r) => envByName.has(r.category.toLocaleLowerCase('tr-TR'))).length;

  const run = useApiMutation(async () => {
    let total: Result = { imported: 0, skipped: { noCycle: 0, duplicate: 0, badEnvelope: 0, future: 0 } };
    for (let i = 0; i < rows.length; i += 2000) {
      const r = await api<Result>('POST', '/import/transactions', { rows: rows.slice(i, i + 2000) });
      total = {
        imported: total.imported + r.imported,
        skipped: {
          noCycle: total.skipped.noCycle + r.skipped.noCycle,
          duplicate: total.skipped.duplicate + r.skipped.duplicate,
          badEnvelope: total.skipped.badEnvelope + r.skipped.badEnvelope,
          future: total.skipped.future + r.skipped.future,
        },
      };
    }
    return total;
  });

  async function pick() {
    setPickError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const content = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
      setText(content);
      setFileName(asset.name);
      setMapping(null);
      setResult(null);
    } catch (e) {
      setPickError(e);
    }
  }

  if (!summary) return <Loading error={error} onRetry={refetch} />;

  if (!summary.plus) {
    return (
      <Screen header={<Header title="CSV'den içe aktar" onClose={goBack} back />}>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 20 }}>
          <TurtleFace size={110} stage={2} />
          <T v="h2">İçe aktarma Kumbara+ ile açılır</T>
          <T muted style={{ textAlign: 'center' }}>Bankandan ya da eski uygulamandan aldığın CSV dosyasındaki harcamaları tek seferde kategorilerine dağıt.</T>
        </View>
        <Button title="Kumbara+'ı incele" onPress={() => router.push('/plus')} />
      </Screen>
    );
  }

  if (result) {
    const s = result.skipped;
    return (
      <Screen header={<Header title="İçe aktarma tamam" onClose={goBack} />}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 20 }}>
          <TurtleFace size={110} mood="happy" stage={1} />
          <T v="display">{result.imported}</T>
          <T muted>harcama eklendi</T>
        </View>
        <Card style={{ gap: 6 }}>
          {s.duplicate > 0 && <T v="small">• {s.duplicate} satır zaten kayıtlı olduğu için atlandı</T>}
          {s.noCycle > 0 && <T v="small">• {s.noCycle} satır ilk bütçe döneminden önce olduğu için atlandı</T>}
          {s.future > 0 && <T v="small">• {s.future} satır ileri tarihli olduğu için atlandı</T>}
          {s.duplicate + s.noCycle + s.future === 0 && <T v="small">Atlanan satır yok.</T>}
        </Card>
        <Button title="Hareketlere git" onPress={() => router.replace('/envelopes')} />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header caption="Verilerin" title="CSV'den içe aktar" onClose={goBack} back />}
      footer={
        table.length > 0 ? (
          <View style={{ gap: 6 }}>
            <ErrorText error={run.error} />
            <Button
              title={`${rows.length} harcamayı içe aktar`}
              disabled={!rows.length || !fallbackEnv || map?.date == null || map?.amount == null}
              loading={run.isPending}
              onPress={() => run.mutate(undefined, { onSuccess: (r) => (setResult(r), toast({ message: `${r.imported} harcama eklendi` })) })}
            />
          </View>
        ) : undefined
      }>
      <T muted>Bankandan ya da başka bir uygulamadan aldığın CSV dosyasını seç. Tarih ve tutar sütunları yeterli.</T>
      <Button title={fileName ? `Dosya: ${fileName}` : 'Dosya seç'} icon="document-outline" kind="secondary" onPress={pick} />
      <ErrorText error={pickError} />
      {!fileName && (
        <Field
          label="ya da metni buraya yapıştır"
          value={text}
          onChangeText={(t) => (setText(t), setMapping(null))}
          multiline
          placeholder={'Tarih;Açıklama;Tutar\n23.10.2026;Migros;-742,50'}
          style={{ minHeight: 110, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }}
        />
      )}

      {table.length > 0 && map && (
        <>
          <T v="tiny" muted>Sütunlar {hasHeader ? '(başlık satırı bulundu)' : ''}</T>
          {FIELDS.map((f) => (
            <View key={f.key} style={{ gap: 6 }}>
              <T v="small">{f.label}{f.required ? ' *' : ''}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {!f.required && <Chip label="Yok" active={map[f.key] === null} onPress={() => setMapping({ ...map, [f.key]: null })} />}
                {header.map((h, i) => (
                  <Chip key={i} label={h || `Sütun ${i + 1}`} active={map[f.key] === i} onPress={() => setMapping({ ...map, [f.key]: i })} />
                ))}
              </ScrollView>
            </View>
          ))}

          {mixedSigns && (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="label">Yalnızca giderleri al</T>
                  <T v="small" muted>Eksi tutarlar harcama sayılır; artı tutarlar (maaş, iade) atlanır.</T>
                </View>
                <Switch value={expensesOnly} onValueChange={setExpensesOnly} trackColor={{ true: c.primary }} accessibilityLabel="Yalnızca giderleri al" />
              </Row>
            </Card>
          )}

          <T v="tiny" muted>Kategorisi eşleşmeyen satırlar hangi kategoriye gitsin?</T>
          <Wrap>
            {summary.envelopes.map((e) => (
              <Chip key={e.id} label={`${e.icon} ${e.name}`} dot={e.color} active={fallbackEnv === e.id} onPress={() => setDefaultEnv(e.id)} />
            ))}
          </Wrap>

          <Card style={{ gap: 8 }}>
            <T v="label">{rows.length} harcama hazır</T>
            {matched > 0 && <T v="small" muted>{matched} satırın kategorisi bir kategoriyle eşleşti.</T>}
            {invalid > 0 && <T v="small" muted>{invalid} satırda tarih ya da tutar okunamadı; atlanacak.</T>}
            {rows.slice(0, 6).map((r, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <T v="small" style={{ flex: 1 }} numberOfLines={1}>
                  {formatDay(r.date, true)} · {r.note || 'Not yok'}
                </T>
                <T v="small">{formatMoney(r.amount)}</T>
              </Row>
            ))}
            {rows.length > 6 && <T v="tiny" muted>… ve {rows.length - 6} satır daha</T>}
          </Card>
        </>
      )}
    </Screen>
  );
}
