import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Pressable, Switch, View } from 'react-native';
import { AmountSheet } from '@/components/AmountSheet';
import { AVATAR_COLORS, Avatar } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorText, Field, Header, Row, Screen, Segmented, T, type IconName } from '@/components/ui';
import { api, apiText, useApiMutation, useSummary, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { formatMoney, relativeDay } from '@/lib/money';
import { goBack } from '@/lib/nav';
import { registerPush } from '@/lib/push';
import { liveActivitySupported, setLiveActivityPref, useLiveActivityPref } from '@/lib/liveActivity';
import { enableNotifications, notificationsSupported, setPrefs, useNotifPrefs } from '@/lib/notifications';
import { useTheme, useThemePref, type ThemePref } from '@/lib/theme';

export default function Settings() {
  const c = useTheme();
  const toast = useToast();
  const { pref, setPref } = useThemePref();
  const { user, setUser, signOut } = useAuth();
  const { data: summary } = useSummary();
  const notif = useNotifPrefs();
  const live = useLiveActivityPref();
  const qc = useQueryClient();
  // Taslaklar: kullanıcı değiştirene kadar kayıtlı değer gösterilir
  const [nameDraft, setName] = useState<string | null>(null);
  const [paydayDraft, setPayday] = useState<string | null>(null);
  const [incomeSheet, setIncomeSheet] = useState(false);
  const [open, setOpen] = useState<'password' | 'delete' | 'claim' | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);


  const updateMe = useApiMutation(async (patch: Partial<User>) => setUser(await api<User>('PATCH', '/auth/me', patch)));
  const updateBudget = useApiMutation((patch: { paydayDay?: number; income?: number }) => api('PATCH', '/settings', patch));
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ id: string; userAgent: string; lastUsedAt: string; current: boolean }[]>('GET', '/auth/sessions') });
  const logoutAll = useApiMutation(() => api('POST', '/auth/logout-all'));

  if (!user) return null;
  const name = nameDraft ?? user.name;
  const payday = paydayDraft ?? String(summary?.user.paydayDay ?? '');
  const day = Number(payday);
  const space = summary?.space;

  async function saveFile(name: string, content: string, mime: string) {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([content], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // Telefonda dosya geçici klasöre yazılır ve paylaşım menüsüyle kaydedilir
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
  }

  async function downloadBackup() {
    setExportError(null);
    try {
      const json = await apiText('/backup');
      await saveFile(`kumbara-yedek-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    } catch (e) {
      setExportError(e);
    }
  }

  async function restoreBackup() {
    setExportError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
      const backup = JSON.parse(text);
      const ok = await confirm(
        'Yedekten geri yüklensin mi?',
        `${space ? space.name + ' alanının' : 'Kişisel bütçenin'} mevcut kategorileri, harcamaları ve hedefleri silinip yedektekilerle değiştirilecek.`,
        'Geri yükle',
      );
      if (!ok) return;
      const r = await api<{ restored: { transactions: number } }>('POST', '/restore', { backup, confirm: true });
      await qc.invalidateQueries();
      toast({ message: `Yedek geri yüklendi · ${r.restored.transactions} harcama` });
    } catch (e) {
      setExportError(e instanceof SyntaxError ? new Error('Dosya okunamadı; bir Kumbara yedeği seç') : e);
    }
  }

  async function exportCsv() {
    setExportError(null);
    try {
      await saveFile('kumbara.csv', await apiText('/export.csv'), 'text/csv');
    } catch (e) {
      setExportError(e);
    }
  }

  return (
    <Screen header={<Header caption="Profil ve tercihler" title="Ayarlar" onClose={goBack} back />}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Avatar index={user.avatar} size={96} />
        <T v="h2">{user.name}</T>
        <Row gap={10}>
          {AVATAR_COLORS.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => updateMe.mutate({ avatar: i })}
              accessibilityRole="radio"
              accessibilityLabel={`Avatar ${i + 1}`}
              accessibilityState={{ selected: user.avatar === i }}
              style={{ borderWidth: 2, borderColor: user.avatar === i ? c.text : 'transparent', borderRadius: 14, padding: 2 }}>
              <Avatar index={i} size={36} />
            </Pressable>
          ))}
        </Row>
      </View>

      {user.isDemo && (
        <Card style={{ gap: 10, backgroundColor: c.primary }}>
          <T v="label" color={c.primaryText}>Misafir hesabı</T>
          <T v="small" color={c.primaryText}>Verilerin 24 saat sonra silinir. Hesap oluşturursan her şey seninle kalır.</T>
          <Button title="Hesap oluştur" kind="inverse" small onPress={() => setOpen(open === 'claim' ? null : 'claim')} />
          {open === 'claim' && <Claim onDone={(u) => (setUser(u), setOpen(null), toast({ message: 'Hesabın oluşturuldu' }))} />}
        </Card>
      )}

      <Section title="Hesap">
        {!user.isDemo && (
          <Line icon="at" title="Giriş yapılan hesap" subtitle={user.email} />
        )}
        <Field label="Adın" value={name} onChangeText={setName} maxLength={60} />
        {name.trim() !== user.name && <Button title="Adı kaydet" small disabled={!name.trim()} loading={updateMe.isPending} onPress={() => updateMe.mutate({ name: name.trim() }, { onSuccess: () => setName(null) })} />}
        <Line icon="sparkles" title="Kumbara+" subtitle={user.plus ? 'Etkin' : 'Sınırsız kategori, gelişmiş analiz, Birlikte'} onPress={() => router.push('/plus')} />
        <Line icon="people-outline" title="Birlikte" subtitle={space ? `Şu an: ${space.name}` : 'Ortak bütçe alanları'} onPress={() => router.push('/together')} />
      </Section>
      <ErrorText error={updateMe.error} />

      <Section title="Görünüm">
        <Segmented<ThemePref>
          value={pref}
          onChange={setPref}
          options={[
            { key: 'system', label: 'Sistem', icon: 'phone-portrait-outline' },
            { key: 'light', label: 'Açık', icon: 'sunny-outline' },
            { key: 'dark', label: 'Koyu', icon: 'moon-outline' },
          ]}
        />
      </Section>

      <Section title={space ? `Gelir ve maaş dönemi · ${space.name}` : 'Gelir ve maaş dönemi'}>
        <Line icon="wallet-outline" title="Aylık gelir" value={formatMoney(summary?.user.income ?? 0, { cents: false })} onPress={() => setIncomeSheet(true)} />
        <Field
          label="Maaş günü (ayın kaçı)"
          value={payday}
          onChangeText={(s) => setPayday(s.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          hint="Değişiklik bir sonraki dönemden itibaren geçerli olur."
        />
        {summary && day !== summary.user.paydayDay && (
          <Button title="Maaş gününü kaydet" small disabled={day < 1 || day > 31} loading={updateBudget.isPending} onPress={() => updateBudget.mutate({ paydayDay: day }, { onSuccess: () => setPayday(null) })} />
        )}
        <Line icon="cash-outline" title="Para birimi" value="TRY · ₺" />
      </Section>
      <ErrorText error={updateBudget.error} />

      <Section title="Bildirimler">
        {!notificationsSupported ? (
          <T v="small" muted>Hatırlatmalar mobil uygulamada çalışır.</T>
        ) : (
          <>
            <Toggle
              title="Hatırlatmalar"
              subtitle={notif.enabled ? 'Açık' : 'Fatura günü, seri ve maaş günü için bildirim al'}
              value={notif.enabled}
              onChange={async (v) => {
                if (v) {
                  if (!(await enableNotifications())) toast({ message: 'Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.' });
                  else await registerPush();
                } else await setPrefs({ ...notif, enabled: false });
              }}
            />
            {notif.enabled && (
              <>
                <Toggle title="Ödeme hatırlatması" subtitle="Fatura ve sabit ödemelerden bir gün önce" value={notif.bills} onChange={(v) => setPrefs({ ...notif, bills: v })} />
                <Toggle title="Seriyi koru" subtitle="O gün kayıt yoksa akşam 20:30'da" value={notif.streak} onChange={(v) => setPrefs({ ...notif, streak: v })} />
                <Toggle title="Maaş günü" subtitle="Maaş yattığında ayın ödemelerini hatırlat" value={notif.payday} onChange={(v) => setPrefs({ ...notif, payday: v })} />
              </>
            )}
          </>
        )}
      </Section>

      {!user.isDemo && (
        <Section title="Güvenlik">
          <Line icon="key-outline" title={user.hasPassword ? 'Şifreyi değiştir' : 'Şifre belirle'} onPress={() => setOpen(open === 'password' ? null : 'password')} />
          {open === 'password' && <PasswordForm hasPassword={user.hasPassword} onDone={() => (setOpen(null), toast({ message: 'Şifre değişti; diğer cihazlardan çıkış yapıldı' }))} />}
          <Line icon="phone-portrait-outline" title="Açık oturumlar" subtitle={sessions.data ? `${sessions.data.length} cihazda açık` : undefined} />
          {sessions.data?.map((s) => (
            <T key={s.id} v="small" muted>
              • {s.current ? 'Bu cihaz' : shortAgent(s.userAgent)} · son kullanım {relativeDay(s.lastUsedAt.slice(0, 10)).toLowerCase()}
            </T>
          ))}
          <Button
            title="Tüm cihazlardan çık"
            kind="secondary"
            small
            loading={logoutAll.isPending}
            onPress={async () => {
              if (await confirm('Tüm cihazlardan çıkılsın mı?', 'Bu cihaz dahil her yerde yeniden giriş yapman gerekir.', 'Çık')) logoutAll.mutate(undefined, { onSuccess: () => signOut() });
            }}
          />
        </Section>
      )}

      <Section title="Kilit ekranı ve saat">
        {liveActivitySupported ? (
          <Toggle title="Günlük pay kilit ekranında" subtitle="Canlı Etkinlik: bugün harcayabileceğin tutar ve Dynamic Island" value={live} onChange={setLiveActivityPref} />
        ) : (
          <T v="small" muted>Canlı Etkinlik yalnızca iPhone’da çalışır. Android’de ana ekran widget’ını kullanabilirsin.</T>
        )}
        <Line icon="watch-outline" title="Saati bağla" subtitle="Apple Watch uygulamasındaki kodu onayla" onPress={() => router.push('/watch')} />
      </Section>

      <Section title="Verilerin">
        <Line icon="cloud-download-outline" title="Yedeği indir" subtitle="Tüm bütçe verilerin tek bir JSON dosyasında" onPress={downloadBackup} />
        <Line icon="cloud-upload-outline" title="Yedekten geri yükle" subtitle="Seçili bütçenin verileri yedektekilerle değiştirilir" onPress={restoreBackup} />
        <Line icon="download-outline" title="İşlemleri dışa aktar (CSV)" onPress={exportCsv} />
        <Line icon="cloud-upload-outline" title="CSV'den içe aktar" subtitle={summary?.plus ? undefined : 'Kumbara+'} onPress={() => router.push('/import')} />
        <Line icon="archive-outline" title="Arşivlenmiş kategoriler" onPress={() => router.push('/archived')} />
        <Line icon="sparkles-outline" title="Dönem özeti (Wrapped)" onPress={() => router.push('/wrapped')} />
      </Section>
      <ErrorText error={exportError} />

      <Button title="Çıkış yap" kind="secondary" icon="log-out-outline" onPress={() => signOut({ remote: true })} />
      <Button title="Hesabı ve tüm verileri sil" kind="ghost" onPress={() => setOpen(open === 'delete' ? null : 'delete')} />
      {open === 'delete' && <DeleteForm user={user} onDone={() => signOut()} />}
      <T v="tiny" muted style={{ textAlign: 'center' }}>Kumbara · v1.2</T>

      <AmountSheet
        open={incomeSheet}
        title="Aylık gelirin"
        initial={summary?.user.income ?? 0}
        onClose={() => setIncomeSheet(false)}
        onDone={(k) => {
          setIncomeSheet(false);
          updateBudget.mutate({ income: k });
        }}
      />
    </Screen>
  );
}

function shortAgent(ua: string) {
  if (/iphone|ipad|ios/i.test(ua)) return 'iPhone / iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/mac/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  return ua ? ua.slice(0, 30) : 'Bilinmeyen cihaz';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <T v="tiny" muted style={{ marginTop: 6 }}>{title}</T>
      <Card style={{ gap: 14 }}>{children}</Card>
    </>
  );
}

function Line({ icon, title, subtitle, value, onPress }: { icon: IconName; title: string; subtitle?: string; value?: string; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <Row gap={12}>
        <Ionicons name={icon} size={20} color={c.text} />
        <View style={{ flex: 1 }}>
          <T v="label">{title}</T>
          {subtitle ? <T v="small" muted>{subtitle}</T> : null}
        </View>
        {value ? <T v="small" muted>{value}</T> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null}
      </Row>
    </Pressable>
  );
}

function Toggle({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <T v="label">{title}</T>
        <T v="small" muted>{subtitle}</T>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary }} accessibilityLabel={title} />
    </Row>
  );
}

function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useApiMutation(() => api('POST', '/auth/me/password', { current: hasPassword ? current : undefined, next }));
  return (
    <View style={{ gap: 10 }}>
      {hasPassword && <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />}
      <Field label="Yeni şifre" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" placeholder="En az 8 karakter" />
      <ErrorText error={change.error} />
      <Button title="Şifreyi kaydet" small disabled={next.length < 8 || (hasPassword && !current)} loading={change.isPending} onPress={() => change.mutate(undefined, { onSuccess: onDone })} />
    </View>
  );
}

function DeleteForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [value, setValue] = useState('');
  const del = useApiMutation(() => api('DELETE', '/auth/me', user.hasPassword ? { password: value } : { confirm: value }));
  return (
    <Card style={{ gap: 10 }}>
      <T v="small" muted>Tüm kategoriler, harcamalar, hedefler ve borçlar kalıcı olarak silinir. Geri alınamaz.</T>
      {!user.isDemo && (
        <Field
          label={user.hasPassword ? 'Onaylamak için şifreni yaz' : 'Onaylamak için SİL yaz'}
          value={value}
          onChangeText={setValue}
          secureTextEntry={user.hasPassword}
          autoCapitalize="characters"
        />
      )}
      <ErrorText error={del.error} />
      <Button title="Hesabımı kalıcı olarak sil" kind="danger" disabled={!user.isDemo && !value} loading={del.isPending} onPress={() => del.mutate(undefined, { onSuccess: onDone })} />
    </Card>
  );
}

function Claim({ onDone }: { onDone: (u: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const claim = useApiMutation(() => api<User>('POST', '/auth/me/claim', { name, email, password }));
  return (
    <View style={{ gap: 10 }}>
      <Field label="Adın" value={name} onChangeText={setName} />
      <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry placeholder="En az 8 karakter" />
      <ErrorText error={claim.error} />
      <Button title="Hesabı oluştur" kind="inverse" small disabled={!name.trim() || !email.includes('@') || password.length < 8} loading={claim.isPending} onPress={() => claim.mutate(undefined, { onSuccess: onDone })} />
    </View>
  );
}
