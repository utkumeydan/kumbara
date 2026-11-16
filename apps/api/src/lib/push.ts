import { eq, inArray } from 'drizzle-orm';
import { db, t } from '../db/index.js';

export type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

// Testlerde gerçek gönderim yapılmaz; mesajlar buraya düşer
export const pushOutbox: { userId: string; message: PushMessage }[] = [];

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Kişilerin kayıtlı tüm cihazlarına Expo push gönderir. Hata olursa sessizce geçer;
// "DeviceNotRegistered" dönen anahtarlar silinir.
export async function sendPush(userIds: string[], message: PushMessage) {
  if (!userIds.length) return;
  if (process.env.NODE_ENV === 'test') {
    for (const userId of userIds) pushOutbox.push({ userId, message });
    return;
  }
  const tokens = await db.select().from(t.pushTokens).where(inArray(t.pushTokens.userId, userIds));
  if (!tokens.length) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk.map((x) => ({ to: x.token, title: message.title, body: message.body, data: message.data ?? {}, sound: 'default' }))),
      });
      const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
      const dead = (json?.data ?? []).map((r, idx) => (r.details?.error === 'DeviceNotRegistered' ? chunk[idx].token : null)).filter(Boolean) as string[];
      for (const token of dead) await db.delete(t.pushTokens).where(eq(t.pushTokens.token, token));
    } catch (e) {
      console.error('Push gönderilemedi', e);
    }
  }
}
