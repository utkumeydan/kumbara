import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db, t } from '../src/db/index.js';
import { oauthUser } from '../src/routes/auth.js';

let ipSeq = 0;
async function call(method: string, path: string, o: { token?: string; space?: string; body?: unknown; raw?: string } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.9.0.${++ipSeq % 250}`,
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
      ...(o.space ? { 'X-Space': o.space } : {}),
    },
    body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, headers: res.headers };
}

async function register(name: string, email = `${name}-${Date.now()}-${Math.random()}@test.dev`) {
  const r = await call('POST', '/auth/register', { body: { email, password: 'gizli-sifre-1', name } });
  expect(r.status).toBe(200);
  return r.json as { token: string; user: { id: string; email: string } };
}

describe('güvenlik', () => {
  it('sosyal giriş, sahipliği kanıtlanmamış hesaba bağlanırken şifreyi ve oturumları siler', async () => {
    const email = `kurban-${Date.now()}@test.dev`;
    const attacker = await register('saldirgan', email);
    const user = await oauthUser('google', { subject: `g-${Date.now()}`, email });
    expect(user.id).toBe(attacker.user.id);
    expect(user.emailVerified).toBe(true);
    // Saldırganın şifresi ve açık oturumu artık işe yaramaz
    expect((await call('POST', '/auth/login', { body: { email, password: 'gizli-sifre-1' } })).status).toBe(401);
    expect((await call('GET', '/auth/me', { token: attacker.token })).status).toBe(401);
  });

  it('sahipliği kanıtlanmış hesapta sosyal giriş şifreyi korur', async () => {
    const email = `dogrulanmis-${Date.now()}@test.dev`;
    const u = await register('dogru', email);
    await db.update(t.users).set({ emailVerified: true }).where(eq(t.users.id, u.user.id));
    expect((await oauthUser('google', { subject: `g2-${Date.now()}`, email })).id).toBe(u.user.id);
    expect((await call('POST', '/auth/login', { body: { email, password: 'gizli-sifre-1' } })).status).toBe(200);
  });

  it('alandan çıkarılan üye eski davet koduyla geri dönemez', async () => {
    const A = await register('sahip');
    await call('POST', '/billing/dev-toggle', { token: A.token });
    const B = await register('uye');
    const space = (await call('POST', '/spaces', { token: A.token, body: { name: 'Ev' } })).json;
    const { code } = (await call('POST', `/spaces/${space.id}/invites`, { token: A.token })).json;
    expect((await call('POST', '/spaces/join', { token: B.token, body: { code } })).status).toBe(200);
    expect((await call('DELETE', `/spaces/${space.id}/members/${B.user.id}`, { token: A.token })).status).toBe(200);
    expect((await call('POST', '/spaces/join', { token: B.token, body: { code } })).status).toBe(404);
  });

  it('ortak alanı yalnızca sahibi geri yükleyebilir', async () => {
    const A = await register('sahip2');
    await call('POST', '/billing/dev-toggle', { token: A.token });
    const B = await register('uye2');
    const space = (await call('POST', '/spaces', { token: A.token, body: { name: 'Ev' } })).json;
    const { code } = (await call('POST', `/spaces/${space.id}/invites`, { token: A.token })).json;
    await call('POST', '/spaces/join', { token: B.token, body: { code } });
    const backup = (await call('GET', '/backup', { token: A.token, space: space.id })).json;
    expect((await call('POST', '/restore', { token: B.token, space: space.id, body: { backup, confirm: true } })).status).toBe(403);
    expect((await call('POST', '/restore', { token: A.token, space: space.id, body: { backup, confirm: true } })).status).toBe(200);
  });

  it('başkasının push anahtarı kendi hesabına taşınamaz', async () => {
    const A = await register('pushA');
    const B = await register('pushB');
    const token = `ExponentPushToken[sec-${Date.now()}]`;
    await call('POST', '/push-tokens', { token: A.token, body: { token, platform: 'ios' } });
    await call('POST', '/push-tokens', { token: B.token, body: { token, platform: 'android' } });
    const [row] = await db.select().from(t.pushTokens).where(eq(t.pushTokens.token, token));
    expect(row.userId).toBe(A.user.id);
  });

  it('CSV dışa aktarımı formül olarak çalışacak notları etkisizleştirir', async () => {
    const A = await register('csv');
    const env = (await call('POST', '/envelopes', { token: A.token, body: { name: 'Market', color: '#A8E6A1' } })).json;
    await call('POST', '/transactions', { token: A.token, body: { envelopeId: env.id, amount: 100_00, note: '=HYPERLINK("http://kotu")' } });
    const csv = (await call('GET', '/export.csv', { token: A.token })).json as string;
    expect(csv).toContain(`"'=HYPERLINK`);
  });

  it('çok büyük istek gövdesi reddedilir ve güvenlik başlıkları gönderilir', async () => {
    const A = await register('buyuk');
    const r = await call('POST', '/transactions', { token: A.token, raw: JSON.stringify({ note: 'x'.repeat(2 * 1024 * 1024) }) });
    expect(r.status).toBe(413);
    const h = (await call('GET', '/auth/me', { token: A.token })).headers;
    expect(h.get('x-content-type-options')).toBe('nosniff');
  });
});
