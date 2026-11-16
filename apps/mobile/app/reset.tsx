import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Card, ErrorText, Field, Header, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// E-postadaki bağlantıdan açılır: kumbara.../reset?token=...
export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api('POST', '/auth/reset', { token, password });
      setDone(true);
      // Tüm oturumlar sunucuda kapandı; bu cihazdaki de kapatılır
      if (user) await signOut();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen header={<Header title="Yeni şifre" />}>
      {!token ? (
        <T muted>Bağlantı eksik. E-postadaki bağlantıyı yeniden aç.</T>
      ) : done ? (
        <Card style={{ gap: 12 }}>
          <T v="h2">Şifren değişti</T>
          <T muted>Tüm cihazlardaki oturumlar kapatıldı. Yeni şifrenle giriş yapabilirsin.</T>
          <Button title="Giriş yap" onPress={() => router.replace('/login')} />
        </Card>
      ) : (
        <>
          <Field label="Yeni şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="En az 8 karakter" />
          <Field label="Yeni şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
          {again.length > 0 && again !== password && <T v="small" muted>Şifreler aynı değil.</T>}
          <ErrorText error={error} />
          <Button title="Şifreyi değiştir" loading={loading} disabled={password.length < 8 || password !== again} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
