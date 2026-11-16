import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image, Text, View } from 'react-native';
import { Celebration } from '@/components/Celebration';
import { pickPhoto } from '@/lib/photo';
import { AmountSheet } from '@/components/AmountSheet';
import { Button, Card, Chip, ColorPicker, ErrorText, Field, Header, IconPicker, Loading, ProgressBar, RoundButton, Row, Screen, T, Wrap } from '@/components/ui';
import { api, useApiMutation, useGoals, type Goal } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { deadlineOptions, formatDay, formatMoney } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { FONT, GOAL_ICONS, PALETTE, useTheme } from '@/lib/theme';

export default function GoalScreen() {
  const params = useLocalSearchParams<{ id: string; deadline?: string }>();
  const goalsQ = useGoals();
  const goal = goalsQ.data?.find((g) => g.id === params.id);
  if (params.id !== 'new' && !goal) return <Loading error={goalsQ.error ?? (goalsQ.data ? new Error('Hedef bulunamadı') : undefined)} onRetry={goalsQ.refetch} />;
  // Form, veri geldikten sonra başlangıç değerleriyle açılır
  return <GoalBody key={goal?.id ?? 'new'} id={params.id} goal={goal} initialDeadline={params.deadline} />;
}

function GoalBody({ id, goal, initialDeadline }: { id: string; goal?: Goal; initialDeadline?: string }) {
  const c = useTheme();
  const isNew = id === 'new';
  const params = { id };

  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal?.target ?? 0);
  const [deadline, setDeadline] = useState<string | null>(goal ? goal.deadline : (initialDeadline ?? null));
  const [icon, setIcon] = useState(goal?.icon ?? '🎯');
  const [color, setColor] = useState(goal?.color ?? PALETTE[1]);
  const [sheet, setSheet] = useState<'target' | 'in' | 'out' | null>(null);


  const save = useApiMutation(async () => {
    const body = { name: name.trim(), target, deadline, icon, color };
    if (isNew) await api('POST', '/goals', body);
    else await api('PATCH', `/goals/${params.id}`, body);
  });
  const contribute = useApiMutation((amount: number) => api('POST', `/goals/${params.id}/contribute`, { amount }));
  const remove = useApiMutation(() => api('DELETE', `/goals/${params.id}`));
  const [celebrate, setCelebrate] = useState(false);
  const [photoError, setPhotoError] = useState<unknown>(null);
  const photo = useQuery({
    queryKey: ['goalPhoto', params.id],
    queryFn: () => api<{ data: string }>('GET', `/goals/${params.id}/photo`),
    enabled: !isNew && !!goal?.hasPhoto,
  });
  const upload = useApiMutation((data: string) => api('PUT', `/goals/${params.id}/photo`, { data }));
  const removePhoto = useApiMutation(() => api('DELETE', `/goals/${params.id}/photo`));


  const sheetEl = (
    <AmountSheet
      open={sheet !== null}
      title={sheet === 'target' ? 'Hedef tutar' : sheet === 'in' ? 'Ne kadar koyuyorsun?' : 'Ne kadar çekiyorsun?'}
      initial={sheet === 'target' ? target : 0}
      max={sheet === 'out' ? goal?.saved : undefined}
      onClose={() => setSheet(null)}
      onDone={(k) => {
        if (sheet === 'target') setTarget(k);
        else if (k > 0)
          contribute.mutate(sheet === 'in' ? k : -k, {
            // Bu katkıyla hedef tamamlandıysa kutlama gösterilir
            onSuccess: () => sheet === 'in' && goal && !goal.done && goal.saved + k >= goal.target && setCelebrate(true),
          });
        setSheet(null);
      }}
    />
  );

  if (editing) {
    const options = deadlineOptions();
    const custom = deadline && !options.some((o) => o.value === deadline);
    return (
      <Screen
        header={<Header title={isNew ? 'Yeni hedef' : 'Hedefi düzenle'} onClose={isNew ? goBack : () => setEditing(false)} back={!isNew} />}
        footer={
          <View style={{ gap: 8 }}>
            {!name.trim() && <T v="small" muted style={{ textAlign: 'center' }}>Önce bir ad ver.</T>}
            <ErrorText error={save.error} />
            <Button
              title={isNew ? 'Hedef oluştur' : 'Kaydet'}
              icon="arrow-forward"
              disabled={!name.trim() || target <= 0}
              loading={save.isPending}
              onPress={() => save.mutate(undefined, { onSuccess: () => (isNew ? goBack() : setEditing(false)) })}
            />
          </View>
        }>
        <Field label="Adı" value={name} onChangeText={setName} placeholder="Ör. Yaz tatili" maxLength={60} />
        <T v="tiny" muted>Hedef tutar</T>
        <Card onPress={() => setSheet('target')}>
          <T v="h2" color={target ? c.text : c.faint}>{formatMoney(target, { cents: false })}</T>
        </Card>
        <T v="small" muted style={{ marginTop: -6 }}>Ulaşmak istediğin toplam tutar.</T>
        <T v="tiny" muted>Şu tarihe kadar</T>
        <Wrap>
          {options.map((o) => (
            <Chip key={o.label} label={o.label} active={deadline === o.value} onPress={() => setDeadline(o.value)} />
          ))}
          {custom && <Chip label={formatDay(deadline!, true)} active />}
        </Wrap>
        <T v="small" muted>Bir tarih seç, her maaşta ne kadar ayırman gerektiğini hesaplayalım.</T>
        <T v="tiny" muted>Renk</T>
        <ColorPicker value={color} onChange={setColor} colors={PALETTE} />
        <T v="tiny" muted>Simge</T>
        <IconPicker value={icon} onChange={setIcon} icons={GOAL_ICONS} />
        {!isNew && (
          <Button
            title="Hedefi sil"
            kind="ghost"
            onPress={async () => {
              if (await confirm('Hedef silinsin mi?', 'Bu hedefe yapılan tüm katkılar da silinir.')) remove.mutate(undefined, { onSuccess: () => router.replace('/goals') });
            }}
          />
        )}
        {sheetEl}
      </Screen>
    );
  }

  const g = goal!;
  return (
    <Screen header={<Header onClose={goBack} back right={<RoundButton icon="pencil" size={40} onPress={() => setEditing(true)} />} />}>
      <Celebration open={celebrate} title="Hedefe ulaştın!" text={`${g.name} için ${formatMoney(g.target, { cents: false })} biriktirdin. Kaplumbağan gurur duyuyor.`} onClose={() => setCelebrate(false)} />
      {photo.data?.data ? (
        <View style={{ borderRadius: 30, overflow: 'hidden', height: 190 }}>
          <Image source={{ uri: `data:image/jpeg;base64,${photo.data.data}` }} style={{ width: '100%', height: '100%' }} accessibilityLabel={`${g.name} fotoğrafı`} />
        </View>
      ) : null}
      <Row>
        <Button
          title={g.hasPhoto ? 'Fotoğrafı değiştir' : 'Hedefinin fotoğrafını ekle'}
          icon="image-outline"
          kind="secondary"
          small
          loading={upload.isPending}
          style={{ flex: 1 }}
          onPress={async () => {
            try {
              const data = await pickPhoto();
              if (data) upload.mutate(data);
            } catch (e) {
              setPhotoError(e);
            }
          }}
        />
        {g.hasPhoto && <Button title="Kaldır" kind="ghost" small onPress={() => removePhoto.mutate(undefined)} />}
      </Row>
      <ErrorText error={photoError ?? upload.error} />
      <View style={{ backgroundColor: g.color, borderRadius: 30, padding: 20, minHeight: 210, justifyContent: 'space-between', gap: 14 }}>
        <Text style={{ color: c.onPastel, fontWeight: '800', fontSize: 15 }}>{g.icon} {g.name}</Text>
        <Text style={{ color: '#00000066', fontSize: 30, fontFamily: FONT.display, letterSpacing: -1, lineHeight: 34 }}>
          <Text style={{ color: c.onPastel }}>{formatMoney(g.target, { cents: false })}</Text> içinden{' '}
          <Text style={{ color: c.onPastel }}>{formatMoney(g.saved, { cents: false })}</Text> birikti.
        </Text>
        <ProgressBar value={g.saved / g.target} color={c.onPastel} track="#00000022" height={8} />
      </View>
      <Card style={{ gap: 6 }}>
        {g.done ? (
          <T v="h2">🎉 Hedefe ulaştın!</T>
        ) : (
          <>
            <T>Kalan <T v="label">{formatMoney(g.remaining, { cents: false })}</T></T>
            {g.perPaycheck ? <T>Yetişmek için her ay <T v="label">{formatMoney(g.perPaycheck, { cents: false })}</T></T> : null}
            {g.deadline ? <T v="small" muted>Son tarih: {formatDay(g.deadline, true)}</T> : null}
            {g.projectedDate ? <T v="small" muted>Bu hızla tahmini bitiş: {formatDay(g.projectedDate, true)}</T> : null}
          </>
        )}
      </Card>
      <ErrorText error={contribute.error} />
      <Row>
        <Button title="Para koy" icon="add" style={{ flex: 1 }} loading={contribute.isPending} onPress={() => setSheet('in')} />
        <Button title="Çek" kind="secondary" disabled={g.saved <= 0} onPress={() => setSheet('out')} />
      </Row>
      {sheetEl}
    </Screen>
  );
}
