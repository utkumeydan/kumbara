import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

// EXPO_PUBLIC_SENTRY_DSN tanımlıysa uygulama hataları Sentry'ye gönderilir
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryEnabled = !!dsn && Platform.OS !== 'web';

if (sentryEnabled) {
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false, environment: __DEV__ ? 'development' : 'production' });
}

// Kök bileşen Sentry hata sınırıyla sarılır (props almayan kök düzen için)
export function wrapRoot(Component: React.ComponentType<Record<string, unknown>>) {
  return sentryEnabled ? Sentry.wrap(Component) : Component;
}

export function captureError(e: unknown) {
  if (sentryEnabled) Sentry.captureException(e);
}
