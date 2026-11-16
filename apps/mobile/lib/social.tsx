import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Platform } from 'react-native';
import { api, deviceTimezone, type User } from './api';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

// Bu platformda Google için istemci kimliği tanımlı mı?
export const googleConfigured = !!(Platform.select({ ios: GOOGLE.iosClientId, android: GOOGLE.androidClientId, default: GOOGLE.webClientId }));

type Session = { token: string; user: User };

// Sunucunun hangi sağlayıcıları doğrulayabildiğini öğrenir
export function useProviders() {
  const [p, setP] = useState({ google: false, apple: false });
  useEffect(() => {
    api<{ google: boolean; apple: boolean }>('GET', '/auth/providers')
      .then(setP)
      .catch(() => {});
  }, []);
  return p;
}

// Google kimlik anahtarını alır ve sunucuya doğrulatır.
// Yalnızca googleConfigured iken çağrılmalı: istemci kimliği yoksa kanca hata fırlatır.
function useGoogleSignIn(onSession: (s: Session) => void, onError: (e: unknown) => void) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE.webClientId,
    iosClientId: GOOGLE.iosClientId,
    androidClientId: GOOGLE.androidClientId,
  });
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    api<Session>('POST', '/auth/oauth', { provider: 'google', idToken, timezone: deviceTimezone() })
      .then(onSession)
      .catch(onError);
  }, [response, onSession, onError]);
  return { ready: !!request, start: () => prompt() };
}

export async function appleAvailable() {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple(): Promise<Session | null> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) return null;
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    return api<Session>('POST', '/auth/oauth', { provider: 'apple', idToken: cred.identityToken, name: name || undefined, timezone: deviceTimezone() });
  } catch (e) {
    // Kullanıcı vazgeçtiyse hata gösterilmez
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}

export function GoogleButton({ onSession, onError }: { onSession: (s: Session) => void; onError: (e: unknown) => void }) {
  const google = useGoogleSignIn(onSession, onError);
  return <Button title="Google ile devam et" icon="logo-google" kind="secondary" disabled={!google.ready} onPress={google.start} />;
}
