import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pushOutbox } from '../src/lib/push.js';
import { addDays, today } from '../src/lib/dates.js';
import { detectSubscriptions, extractTags, normalizeNote } from '../src/routes/habits.js';

let ipSeq = 100;
async function call(method: string, path: string, o: { token?: string; space?: string; body?: unknown } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.1.0.${++ipSeq % 250}`,
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
      ...(o.space ? { 'X-Space': o.space } : {}),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function register(name: string) {
  const r = await call('POST', '/auth/register', { body: { email: `${name}-${Date.now()}-${Math.random()}@test.dev`, password: 'gizli-sifre-1', name } });
  return r.json as { token: string; user: { id: string } };
}

async function setup(name: string) {
  const u = await register(name);
  const market = (await call('POST', '/envelopes', { token: u.token, body: { name: 'Market', color: '#A8E6A1' } })).json.id as string;
  await call('POST', '/payday', { token: u.token, body: { income: 20_000_00, allocations: [{ envelopeId: market, amount: 1_000_00 }] } });
  return { ...u, market };
}

describe('yardımcılar', () => {
  it('not sadeleştirme ve etiketler', () => {
    expect(normalizeNote('Netflix 12/2026 #eğlence')).toBe('netflix');
    expect(extractTags('Otel #Tatil #yaz-2026')).toEqual(['tatil', 'yaz-2026']);
  });

  it('abonelik tespiti: aylık ve sabit tutarlı olanlar bulunur, market gibi sık olanlar bulunmaz', () => {
    const now = '2026-10-23';
    const rows = [
      ...['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'].map((d, i) => ({ id: `n${i}`, amount: 230_00, note: 'Netflix', spentOn: d, envelopeId: 'e1', cycleId: 'c', billId: null })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, amount: 500_00 + i * 37_00, note: 'Migros', spentOn: `2026-${String(8 + (i % 3)).padStart(2, '0')}-${String(3 + i).padStart(2, '0')}`, envelopeId: 'e2', cycleId: 'c', billId: null })),
      ...['2026-01-10', '2026-02-10', '2026-03-10'].map((d, i) => ({ id: `o${i}`, amount: 99_00, note: 'Eski abonelik', spentOn: d, envelopeId: 'e1', cycleId: 'c', billId: null })),
    ];
    const found = detectSubscriptions(rows, now);
    expect(found.map((f) => f.key)).toEqual(['netflix']);
    expect(found[0].yearly).toBe(230_00 * 12);
    expect(found[0].dueDay).toBe(5);
  });
});

describe('favoriler ve uyarılar', () => {
  let U: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    U = await setup('fav');
  });

  it('üç kez girilen harcama favori önerisi olur; elle sabitlenebilir', async () => {
    for (let i = 0; i < 3; i++) await call('POST', '/transactions', { token: U.token, body: { envelopeId: U.market, amount: 95_00, note: 'Kahve' } });
    const favs = (await call('GET', '/favorites', { token: U.token })).json;
    expect(favs[0]).toMatchObject({ note: 'Kahve', amount: 95_00, pinned: false, uses: 3 });
    await call('POST', '/favorites', { token: U.token, body: { envelopeId: U.market, amount: 40_00, note: 'Simit' } });
    const after = (await call('GET', '/favorites', { token: U.token })).json;
    expect(after[0]).toMatchObject({ note: 'Simit', pinned: true });
  });

  it('zarfın %80 i aşılınca ve eksiye düşünce uyarı döner', async () => {
    // 285 harcandı; 600 daha → 885/1000
    const a = (await call('POST', '/transactions', { token: U.token, body: { envelopeId: U.market, amount: 600_00 } })).json;
    expect(a.alerts.join(' ')).toContain('%89');
    const b = (await call('POST', '/transactions', { token: U.token, body: { envelopeId: U.market, amount: 200_00 } })).json;
    expect(b.alerts.join(' ')).toContain('eksiye düştü');
  });

  it('etiketler toplanır', async () => {
    await call('POST', '/transactions', { token: U.token, body: { envelopeId: U.market, amount: 1_250_00, note: 'Otel #tatil' } });
    await call('POST', '/transactions', { token: U.token, body: { envelopeId: U.market, amount: 300_00, note: 'Yemek #Tatil #yaz' } });
    const tags = (await call('GET', '/tags', { token: U.token })).json;
    expect(tags.find((x: any) => x.tag === 'tatil')).toMatchObject({ total: 1_550_00, count: 2 });
    expect(tags.find((x: any) => x.tag === 'yaz').total).toBe(300_00);
  });

  it('meydan okumalar, rozetler, abonelik ve enflasyon uçları çalışır', async () => {
    const ch = (await call('GET', '/challenges', { token: U.token })).json;
    expect(ch.current.length).toBeGreaterThanOrEqual(2);
    expect(ch.current.find((x: any) => x.code === 'log7').current).toBe(1);
    const badges = (await call('GET', '/badges', { token: U.token })).json;
    expect(badges.find((b: any) => b.code === 'first').earned).toBe(true);
    expect(badges.find((b: any) => b.code === 'tx100').earned).toBe(false);
    expect((await call('GET', '/subscriptions', { token: U.token })).json.detected).toEqual([]);
    expect((await call('GET', '/inflation', { token: U.token })).status).toBe(200);
  });

  it('hedef fotoğrafı yüklenir ve listede görünür', async () => {
    const g = (await call('POST', '/goals', { token: U.token, body: { name: 'Tatil', target: 10_000_00, color: '#8FD9CF' } })).json;
    const data = '/9j/' + 'A'.repeat(400);
    expect((await call('PUT', `/goals/${g.id}/photo`, { token: U.token, body: { data } })).status).toBe(200);
    expect((await call('GET', `/goals/${g.id}/photo`, { token: U.token })).json.data).toBe(data);
    expect((await call('GET', '/goals', { token: U.token })).json[0].hasPhoto).toBe(true);
  });
});

describe('hesaplaşma ve ortak alan bildirimi', () => {
  it('kim kime borçlu hesaplanır, ödeme işaretlenince sıfırlanır', async () => {
    const A = await register('ali');
    const B = await register('ayse');
    await call('POST', '/billing/dev-toggle', { token: A.token });
    const space = (await call('POST', '/spaces', { token: A.token, body: { name: 'Ev' } })).json;
    const { code } = (await call('POST', `/spaces/${space.id}/invites`, { token: A.token })).json;
    await call('POST', '/spaces/join', { token: B.token, body: { code } });
    await call('POST', '/push-tokens', { token: A.token, body: { token: 'ExponentPushToken[test-ali]', platform: 'ios' } });
    const env = (await call('POST', '/envelopes', { token: A.token, space: space.id, body: { name: 'Ortak', color: '#A8E6A1' } })).json;
    await call('POST', '/payday', { token: A.token, space: space.id, body: { income: 10_000_00, allocations: [{ envelopeId: env.id, amount: 5_000_00 }] } });
    pushOutbox.length = 0;
    await call('POST', '/transactions', { token: A.token, space: space.id, body: { envelopeId: env.id, amount: 300_00 } });
    await call('POST', '/transactions', { token: B.token, space: space.id, body: { envelopeId: env.id, amount: 100_00 } });
    // Bildirim arka planda gönderilir; A harcayınca B'ye, B harcayınca A'ya gider
    await new Promise((r) => setTimeout(r, 100));
    expect(pushOutbox.map((p) => p.userId).sort()).toEqual([A.user.id, B.user.id].sort());
    expect(pushOutbox.find((p) => p.userId === A.user.id)!.message.body).toContain('ayse');
    let bal = (await call('GET', `/spaces/${space.id}/balances`, { token: A.token })).json;
    expect(bal.total).toBe(400_00);
    expect(bal.transfers).toEqual([expect.objectContaining({ fromUserId: B.user.id, toUserId: A.user.id, amount: 100_00 })]);
    await call('POST', `/spaces/${space.id}/settlements`, { token: B.token, body: { toUserId: A.user.id, amount: 100_00 } });
    bal = (await call('GET', `/spaces/${space.id}/balances`, { token: A.token })).json;
    expect(bal.transfers).toEqual([]);
    // Özel paylar: A %75, B %25 → B'nin payı 100, ödediği 100 + verdiği 100
    bal = (await call('PATCH', `/spaces/${space.id}/shares`, { token: A.token, body: { shares: [{ userId: A.user.id, share: 75 }, { userId: B.user.id, share: 25 }] } })).json;
    expect(bal.members.find((m: any) => m.userId === B.user.id).net).toBe(100_00);
  });
});

describe('saat eşleştirme', () => {
  it('kod onaylanınca saat oturum anahtarını bir kez alır', async () => {
    const U = await setup('saat');
    const pair = (await call('POST', '/watch/pair')).json;
    expect((await call('POST', '/watch/claim', { body: { code: pair.code, deviceSecret: pair.deviceSecret } })).json.pending).toBe(true);
    expect((await call('POST', '/watch/claim', { body: { code: pair.code, deviceSecret: 'yanlis' } })).status).toBe(404);
    await call('POST', '/watch/confirm', { token: U.token, body: { code: pair.code.toLowerCase() } });
    const { token } = (await call('POST', '/watch/claim', { body: { code: pair.code, deviceSecret: pair.deviceSecret } })).json;
    expect(token).toBeTruthy();
    expect((await call('POST', '/watch/claim', { body: { code: pair.code, deviceSecret: pair.deviceSecret } })).status).toBe(404);
    const s = (await call('GET', '/watch/summary', { token })).json;
    expect(s.left).toBe(1_000_00);
  });
});

describe('yedek', () => {
  it('yedek başka bir hesaba geri yüklenince aynı bütçe oluşur', async () => {
    const A = await setup('yedek');
    await call('POST', '/transactions', { token: A.token, body: { envelopeId: A.market, amount: 123_45, note: 'Pazar #ev' } });
    await call('POST', '/bills', { token: A.token, body: { name: 'İnternet', amount: 400_00, dueDay: 3, envelopeId: A.market } });
    const backup = (await call('GET', '/backup', { token: A.token })).json;
    expect(backup.app).toBe('kumbara');
    const B = await register('geri');
    expect((await call('POST', '/restore', { token: B.token, body: { backup: { app: 'baska' }, confirm: true } })).status).toBe(400);
    const r = (await call('POST', '/restore', { token: B.token, body: { backup, confirm: true } })).json;
    expect(r.restored).toMatchObject({ envelopes: 1, cycles: 1, transactions: 1, bills: 1 });
    const [a, b] = await Promise.all([call('GET', '/summary', { token: A.token }), call('GET', '/summary', { token: B.token })]);
    expect(b.json.left).toBe(a.json.left);
    expect(b.json.envelopes[0].name).toBe('Market');
    expect((await call('GET', '/bills', { token: B.token })).json[0].envelopeId).toBe(b.json.envelopes[0].id);
  });
});

// Kullanılmayan içe aktarma uyarısı olmasın
void addDays;
void today;
