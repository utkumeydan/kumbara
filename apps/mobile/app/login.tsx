import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { TurtleFace } from '@/components/Turtle';
import { Button, ErrorText, Field, Row, Screen, Segmented, T } from '@/components/ui';
import { api, deviceTimezone, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { appleAvailable, GoogleButton, googleConfigured, signInWithApple, useProviders } from '@/lib/social';
import { FONT, useTheme } from '@/lib/theme';

export default function Login() {
  const c = useTheme();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'form' | 'demo' | 'apple' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [apple, setApple] = useState(false);
  const providers = useProviders();

  const onSession = useCallback((s: { token: string; user: User }) => void signIn(s.token, s.user), [signIn]);
  useEffect(() => {
    appleAvailable().then(setApple);
  }, []);

  async function run(kind: 'form' | 'demo' | 'apple', fn: () => Promise<{ token: string; user: User } | null>) {
    setError(null);
    setLoading(kind);
    try {
      const res = await fn();
      if (res) await signIn(res.token, res.user);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(null);
    }
  }

  const submit = () =>
    run('form', () =>
      api('POST', `/auth/${mode}`, mode === 'login' ? { email, password } : { email, password, name, timezone: deviceTimezone() }),
    );

  const showGoogle = providers.google && googleConfigured;
  const showApple = providers.apple && apple;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ gap: 10, marginTop: 40, marginBottom: 12 }}>
          <View style={{ width: 96, height: 96, borderRadius: 30, backgroundColor: '#7FD3F7', alignItems: 'center', justifyContent: 'center' }}>
            <TurtleFace size={88} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 40, fontFamily: FONT.display, letterSpacing: -1.5, color: c.text, lineHeight: 44, marginTop: 10 }}>
            Maaşa kadar{'\n'}
            <Text style={{ color: c.muted }}>ne kadar kaldı?</Text>
          </Text>
          <T muted>Kumbara tek bir sayı gösterir: maaş gününe kadar harcayabileceğin tutar.</T>
        </View>

        {(showApple || showGoogle) && (
          <View style={{ gap: 10 }}>
            {showApple && <Button title="Apple ile devam et" icon="logo-apple" kind="inverse" loading={loading === 'apple'} onPress={() => run('apple', signInWithApple)} />}
            {showGoogle && <GoogleButton onSession={onSession} onError={setError} />}
            <Row style={{ marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: c.cardAlt }} />
              <T v="tiny" muted>ya da e-postayla</T>
              <View style={{ flex: 1, height: 1, backgroundColor: c.cardAlt }} />
            </Row>
          </View>
        )}

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'login', label: 'Giriş yap' },
            { key: 'register', label: 'Kayıt ol' },
          ]}
        />
        {mode === 'register' && <Field label="Adın" value={name} onChangeText={setName} placeholder="Ör. Deniz" autoComplete="name" />}
        <Field label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@mail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'register' ? 'En az 8 karakter' : 'Şifren'}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onSubmitEditing={submit}
        />
        {mode === 'login' && (
          <Pressable onPress={() => router.push(`/forgot?email=${encodeURIComponent(email)}`)} accessibilityRole="link" style={{ alignSelf: 'flex-end' }} hitSlop={8}>
            <T v="small" muted>Şifremi unuttum</T>
          </Pressable>
        )}
        <ErrorText error={error} />
        <Button title={mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'} icon="arrow-forward" onPress={submit} loading={loading === 'form'} />

        <Pressable
          onPress={() => run('demo', () => api('POST', '/auth/demo', { timezone: deviceTimezone() }))}
          accessibilityRole="button"
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
          <Ionicons name="sparkles-outline" size={16} color={c.accent} />
          <T v="label" color={c.accent}>{loading === 'demo' ? 'Hazırlanıyor…' : 'Kayıt olmadan örnek verilerle dene'}</T>
        </Pressable>
        <T v="small" muted style={{ textAlign: 'center' }}>Banka bağlantısı yok. Verilerin yalnızca senin sunucunda tutulur.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
