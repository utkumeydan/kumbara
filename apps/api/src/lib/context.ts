import { AsyncLocalStorage } from 'node:async_hooks';

// İsteğe özgü bilgiler; şimdilik kullanıcının saat dilimi
export const requestContext = new AsyncLocalStorage<{ tz: string }>();

export function validTimezone(tz: string | undefined | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}
