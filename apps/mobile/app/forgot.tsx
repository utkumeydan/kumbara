import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Card, ErrorText, Field, Header, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';

// Şifre sıfırlama bağlantısı ister; hesap var mı yok mu belli edilmez
export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send() {
    setLoading(true);
    setError(null);
    try {
      await api('POST', '/auth/forgot', { email });
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen header={<Header title="Şifremi unuttum" onClose={goBack} back />}>
      {sent ? (
        <Card style={{ gap: 8 }}>
          <T v="h2">E-postanı kontrol et</T>
          <T muted>Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderdik. Bağlantı 1 saat geçerli.</T>
        </Card>
      ) : (
        <>
          <T muted>Hesabının e-posta adresini yaz, şifreni sıfırlaman için bir bağlantı gönderelim.</T>
          <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={send} />
          <ErrorText error={error} />
          <Button title="Bağlantı gönder" loading={loading} disabled={!email.includes('@')} onPress={send} />
        </>
      )}
    </Screen>
  );
}
