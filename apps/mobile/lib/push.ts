import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

let currentToken: string | null = null;

// Expo push anahtarını alıp sunucuya kaydeder (bildirim izni verilmişse).
// EAS proje kimliği yoksa (yerel geliştirme) push devre dışı kalır; yerel bildirimler çalışmaya devam eder.
export async function registerPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = data;
    await api('POST', '/push-tokens', { token: data, platform: Platform.OS });
    return true;
  } catch {
    return false;
  }
}

// Çıkış yaparken bu cihazın anahtarı silinir, böylece bildirimler eski hesaba gitmez
export async function unregisterPush() {
  if (!currentToken) return;
  await api('DELETE', '/push-tokens', { token: currentToken }).catch(() => {});
  currentToken = null;
}

// Bildirime dokununca ilgili ekrana gider (data.url)
export function usePushNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
