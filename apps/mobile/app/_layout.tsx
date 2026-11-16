import NetInfo from '@react-native-community/netinfo';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import 'react-native-reanimated';

import { ToastProvider, useToast } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { flushPending } from '@/lib/offline';
import { persister } from '@/lib/persist';
import { wrapRoot } from '@/lib/sentry';
import { ThemeProvider, useTheme } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const DAY = 86_400_000;
// Sunucu yanıtlarının biçimi değişince artırılır; eski önbellek atılır
const CACHE_VERSION = '2';

function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, gcTime: DAY } } }));
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: 7 * DAY, buster: CACHE_VERSION }}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <RootNav />
            <OfflineSync />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

export default wrapRoot(RootLayout);

// Bağlantı geri geldiğinde ya da uygulama öne geldiğinde bekleyen harcamaları gönderir
function OfflineSync() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const flush = async () => {
      const { sent, failed } = await flushPending(qc);
      if (sent) toast({ message: `Çevrimdışı eklenen ${sent} harcama gönderildi` });
      if (failed.length) toast({ message: `${failed.length} harcama gönderilemedi: ${failed[0]}` });
    };
    flush();
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected) flush();
    });
    const sub = AppState.addEventListener('change', (st) => st === 'active' && flush());
    // NetInfo bağlantı değişimini her zaman bildirmeyebilir: web'de tarayıcı olayı da dinlenir,
    // ayrıca bekleyen kayıt varsa düzenli aralıklarla yeniden denenir
    const onOnline = () => flush();
    if (Platform.OS === 'web') window.addEventListener('online', onOnline);
    const timer = setInterval(flush, 20_000);
    return () => {
      unsubNet();
      sub.remove();
      clearInterval(timer);
      if (Platform.OS === 'web') window.removeEventListener('online', onOnline);
    };
  }, [user, qc, toast]);
  return null;
}

function RootNav() {
  const c = useTheme();
  const { ready, user } = useAuth();

  // Yazı tipi yüklenemezse de açılış beklemez (sistem yazı tipine düşer)
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready && fontsReady) SplashScreen.hideAsync();
  }, [ready, fontsReady]);
  if (!ready || !fontsReady) return null;

  const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.primary } };
  const modal = { presentation: 'modal' as const };

  // Ekranlar kendi başlıklarını çizer
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="add" options={modal} />
          <Stack.Screen name="envelope/[id]" />
          <Stack.Screen name="envelope/new" options={modal} />
          <Stack.Screen name="goal/[id]" options={modal} />
          <Stack.Screen name="goals" />
          <Stack.Screen name="bill/[id]" options={modal} />
          <Stack.Screen name="bills" />
          <Stack.Screen name="debts" />
          <Stack.Screen name="debt/[id]" options={modal} />
          <Stack.Screen name="money" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="account" options={modal} />
          <Stack.Screen name="schedule-import" options={modal} />
          <Stack.Screen name="schedule-item" options={modal} />
          <Stack.Screen name="level" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="together" />
          <Stack.Screen name="plus" options={modal} />
          <Stack.Screen name="import" />
          <Stack.Screen name="wrapped" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="archived" />
          <Stack.Screen name="challenges" />
          <Stack.Screen name="settle" />
          <Stack.Screen name="subscriptions" />
          <Stack.Screen name="tags" />
          <Stack.Screen name="watch" options={modal} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
          <Stack.Screen name="forgot" />
        </Stack.Protected>
        <Stack.Screen name="reset" />
      </Stack>
    </NavThemeProvider>
  );
}
