import { beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { addDays, today } from '../src/lib/dates.js';

type Opts = { token?: string; space?: string; body?: unknown; ip?: string };
let ipSeq = 0;

async function call(method: string, path: string, o: Opts = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': o.ip ?? `10.0.0.${++ipSeq % 250}`,
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
  const r = await call('POST', '/auth/register', { body: { email: `${name}-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name } });
  expect(r.status).toBe(200);
  return r.json as { token: string; user: { id: string; email: string } };
}

let A: { token: string; user: { id: string; email: string } };
let market: string;
let fun: string;

beforeAll(async () => {
  A = await register('ayse');
  market = (await call('POST', '/envelopes', { token: A.token, body: { name: 'Market', color: '#A8E6A1' } })).json.id;
  fun = (await call('POST', '/envelopes', { token: A.token, body: { name: 'Eğlence', color: '#F4A7C4' } })).json.id;
  const p = await call('POST', '/payday', {
    token: A.token,
    body: { income: 30_000_00, allocations: [{ envelopeId: market, amount: 10_000_00 }, { envelopeId: fun, amount: 5_000_00 }] },
  });
  expect(p.status).toBe(200);
});

describe('oturum', () => {
  it('yanlış şifre reddedilir, doğru şifreyle giriş yapılır', async () => {
    expect((await call('POST', '/auth/login', { body: { email: A.user.email, password: 'yanlis' } })).status).toBe(401);
    expect((await call('POST', '/auth/login', { body: { email: A.user.email, password: 'gizli-sifre-1' } })).status).toBe(200);
  });

  it('çok fazla deneme sınırlanır', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await call('POST', '/auth/login', { ip: '9.9.9.9', body: { email: 'yok@test.dev', password: 'x' } })).status);
    expect(statuses).toContain(429);
  });

  it('tüm cihazlardan çıkış oturumları kapatır', async () => {
    const B = await register('gecici');
    const second = (await call('POST', '/auth/login', { body: { email: B.user.email, password: 'gizli-sifre-1' } })).json.token;
    expect((await call('GET', '/auth/sessions', { token: B.token })).json).toHaveLength(2);
    await call('POST', '/auth/logout-all', { token: second });
    expect((await call('GET', '/auth/me', { token: B.token })).status).toBe(401);
  });

  it('şifre sıfırlama bağlantısı çalışır ve tek kullanımlıktır', async () => {
    const C = await register('unutkan');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await call('POST', '/auth/forgot', { body: { email: C.user.email } });
    const mail = spy.mock.calls.map((x) => String(x[0])).find((x) => x.includes('token='))!;
    spy.mockRestore();
    const token = mail.match(/token=([\w-]+)/)![1];
    expect((await call('POST', '/auth/reset', { body: { token, password: 'yeni-sifre-12' } })).status).toBe(200);
    expect((await call('POST', '/auth/reset', { body: { token, password: 'baska-sifre-12' } })).status).toBe(400);
    expect((await call('GET', '/auth/me', { token: C.token })).status).toBe(401);
    expect((await call('POST', '/auth/login', { body: { email: C.user.email, password: 'yeni-sifre-12' } })).status).toBe(200);
  });

  it('hesap silme şifre ister', async () => {
    const D = await register('silinen');
    expect((await call('DELETE', '/auth/me', { token: D.token, body: {} })).status).toBe(400);
    expect((await call('DELETE', '/auth/me', { token: D.token, body: { password: 'gizli-sifre-1' } })).status).toBe(200);
  });

  it('demo hesabı örnek verilerle açılır', async () => {
    const r = await call('POST', '/auth/demo', { body: {} });
    expect(r.status).toBe(200);
    const s = (await call('GET', '/summary', { token: r.json.token })).json;
    expect(s.envelopes.length).toBe(4);
    expect(s.cycle).not.toBeNull();
    expect(s.debt.total).toBeGreaterThan(0);
  });
});

describe('harcamalar', () => {
  it('ileri tarih reddedilir; geçmiş tarihli harcama için dönem kendiliğinden açılır', async () => {
    expect((await call('POST', '/transactions', { token: A.token, body: { envelopeId: market, amount: 100, spentOn: addDays(today(), 1) } })).status).toBe(400);
    const old = await call('POST', '/transactions', { token: A.token, body: { envelopeId: market, amount: 100, spentOn: addDays(today(), -400) } });
    expect(old.status).toBe(200);
    await call('DELETE', `/transactions/${old.json.id}`, { token: A.token });
  });

  it('hiç dönemi olmayan yeni kullanıcı doğrudan harcama girebilir', async () => {
    const U = await register('yeni');
    const env = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Market', color: '#fff' } })).json.id;
    expect((await call('POST', '/transactions', { token: U.token, body: { envelopeId: env, amount: 150_00, note: 'Getir' } })).status).toBe(200);
    const s = (await call('GET', '/spending', { token: U.token })).json;
    expect(s).toMatchObject({ total: 150_00, count: 1 });
    expect(s.categories[0]).toMatchObject({ name: 'Market', total: 150_00 });
  });

  it('aynı istemci kimliğiyle gelen kayıt tekrar yazılmaz', async () => {
    const body = { envelopeId: market, amount: 250_00, note: 'Çevrimdışı', clientId: 'abc-123' };
    const a = await call('POST', '/transactions', { token: A.token, body });
    const b = await call('POST', '/transactions', { token: A.token, body });
    expect(a.json.id).toBe(b.json.id);
  });

  it('tek kayıt getirilir ve arama % karakterine dayanıklıdır', async () => {
    const tx = (await call('POST', '/transactions', { token: A.token, body: { envelopeId: fun, amount: 120_00, note: '%50 indirim' } })).json;
    expect((await call('GET', `/transactions/${tx.id}`, { token: A.token })).json.note).toBe('%50 indirim');
    const found = (await call('GET', `/transactions?q=${encodeURIComponent('%50')}`, { token: A.token })).json;
    expect(found).toHaveLength(1);
  });
});

describe('gelir, dağıtım ve hedefler', () => {
  it('birikim hedefine kaynak seçmeden para konabilir', async () => {
    const goal = (await call('POST', '/goals', { token: A.token, body: { name: 'Tatil', target: 20_000_00, color: '#8FD9CF' } })).json;
    expect((await call('POST', `/goals/${goal.id}/contribute`, { token: A.token, body: { amount: 4_000_00 } })).status).toBe(200);
    expect((await call('GET', '/goals', { token: A.token })).json.find((g: any) => g.id === goal.id).saved).toBe(4_000_00);
  });

  it('zarftan hedefe aktarım zarfın kalanını azaltır', async () => {
    const goal = (await call('GET', '/goals', { token: A.token })).json[0];
    const left = (await call('GET', '/summary', { token: A.token })).json.envelopes.find((e: any) => e.id === fun).remaining;
    await call('POST', `/goals/${goal.id}/contribute`, { token: A.token, body: { amount: 1_000_00, envelopeId: fun } });
    const after = (await call('GET', '/summary', { token: A.token })).json.envelopes.find((e: any) => e.id === fun).remaining;
    expect(left - after).toBe(1_000_00);
  });

  it('ek gelir dönem gelirine eklenir, dağıtım gelirden fazla olamaz', async () => {
    const before = (await call('GET', '/summary', { token: A.token })).json.unassigned;
    await call('POST', '/incomes', { token: A.token, body: { amount: 2_000_00, note: 'Prim' } });
    expect((await call('GET', '/summary', { token: A.token })).json.unassigned).toBe(before + 2_000_00);
    expect((await call('PUT', '/allocations', { token: A.token, body: { allocations: [{ envelopeId: market, amount: 99_000_00 }] } })).status).toBe(400);
  });

  it('aynı gün ikinci kez maaş başlatılamaz', async () => {
    expect((await call('POST', '/payday', { token: A.token, body: { allocations: [] } })).status).toBe(409);
  });
});

describe('fatura ve borç', () => {
  it('fatura bir dönemde iki kez ödenemez', async () => {
    const bill = (await call('POST', '/bills', { token: A.token, body: { name: 'İnternet', amount: 400_00, dueDay: 1, envelopeId: market } })).json;
    expect((await call('POST', `/bills/${bill.id}/pay`, { token: A.token, body: {} })).status).toBe(200);
    expect((await call('POST', `/bills/${bill.id}/pay`, { token: A.token, body: {} })).status).toBe(409);
  });

  it('borç ödemesi bakiyeyi düşürür, silinince geri yükler', async () => {
    const debt = (await call('POST', '/debts', { token: A.token, body: { name: 'Kart', type: 'card', balance: 5_000_00, monthlyPayment: 1_000_00, envelopeId: market } })).json;
    await call('POST', `/debts/${debt.id}/pay`, { token: A.token, body: { amount: 1_500_00 } });
    let d = (await call('GET', '/debts', { token: A.token })).json.find((x: any) => x.id === debt.id);
    expect(d.balance).toBe(3_500_00);
    await call('DELETE', `/transactions/${d.payments[0].id}`, { token: A.token });
    d = (await call('GET', '/debts', { token: A.token })).json.find((x: any) => x.id === debt.id);
    expect(d.balance).toBe(5_000_00);
  });
});

describe('plan ve ortak alan', () => {
  it('ücretsiz planda 4 zarftan fazlası açılamaz', async () => {
    await call('POST', '/envelopes', { token: A.token, body: { name: 'Ulaşım', color: '#A7D3F2' } });
    await call('POST', '/envelopes', { token: A.token, body: { name: 'Sağlık', color: '#8FD9CF' } });
    expect((await call('POST', '/envelopes', { token: A.token, body: { name: 'Fazla', color: '#E3C9A8' } })).status).toBe(402);
    expect((await call('GET', '/stats', { token: A.token })).json.locked).toBe(true);
    await call('POST', '/billing/dev-toggle', { token: A.token });
    expect((await call('POST', '/envelopes', { token: A.token, body: { name: 'Fazla', color: '#E3C9A8' } })).status).toBe(200);
    expect((await call('GET', '/stats', { token: A.token })).json.locked).toBe(false);
  });

  it('ortak alan: davet, katılım ve erişim', async () => {
    const B = await register('mehmet');
    expect((await call('POST', '/spaces', { token: B.token, body: { name: 'Ev' } })).status).toBe(402);
    const space = (await call('POST', '/spaces', { token: A.token, body: { name: 'Ev' } })).json;
    const { code } = (await call('POST', `/spaces/${space.id}/invites`, { token: A.token })).json;
    expect((await call('GET', '/summary', { token: B.token, space: space.id })).status).toBe(403);
    expect((await call('POST', '/spaces/join', { token: B.token, body: { code: code.toLowerCase() } })).status).toBe(200);

    const env = (await call('POST', '/envelopes', { token: B.token, space: space.id, body: { name: 'Ortak market', color: '#A8E6A1' } })).json;
    await call('POST', '/payday', { token: A.token, space: space.id, body: { income: 10_000_00, allocations: [{ envelopeId: env.id, amount: 5_000_00 }] } });
    await call('POST', '/transactions', { token: B.token, space: space.id, body: { envelopeId: env.id, amount: 300_00 } });
    const s = (await call('GET', '/summary', { token: A.token, space: space.id })).json;
    expect(s.space.name).toBe('Ev');
    expect(s.left).toBe(4_700_00);
    const txs = (await call('GET', '/transactions', { token: A.token, space: space.id })).json;
    expect(txs[0].createdByName).toBe('mehmet');
    // Kişisel bütçeler birbirine karışmaz
    expect((await call('GET', '/summary', { token: B.token })).json.envelopes).toHaveLength(0);
  });
});

describe('içe aktarma ve Wrapped', () => {
  it('CSV satırları eklenir, tekrarlar ve dönem dışı satırlar atlanır', async () => {
    const rows = [
      { date: today(), amount: 75_00, note: 'Simit', envelopeId: market },
      { date: today(), amount: 75_00, note: 'Simit', envelopeId: market },
      { date: addDays(today(), -500), amount: 10_00, note: 'Eski', envelopeId: market },
    ];
    const r = (await call('POST', '/import/transactions', { token: A.token, body: { rows } })).json;
    expect(r.imported).toBe(1);
    expect(r.skipped.duplicate).toBe(1);
    expect(r.skipped.noCycle).toBe(1);
  });

  it('Wrapped dönem özetini döner', async () => {
    const w = (await call('GET', '/wrapped', { token: A.token })).json;
    expect(w.total).toBeGreaterThan(0);
    expect(w.topEnvelopes.length).toBeGreaterThan(0);
    expect(w.longestStreak).toBeGreaterThanOrEqual(1);
  });
});

describe('misafir hesabı', () => {
  it('demo hesabı verileriyle gerçek hesaba çevrilir', async () => {
    const d = (await call('POST', '/auth/demo', { body: {} })).json;
    const email = `claim-${Date.now()}@test.dev`;
    const r = await call('POST', '/auth/me/claim', { token: d.token, body: { email, password: 'kalici-sifre-1', name: 'Zeynep' } });
    expect(r.status).toBe(200);
    expect(r.json.isDemo).toBe(false);
    const login = await call('POST', '/auth/login', { body: { email, password: 'kalici-sifre-1' } });
    expect((await call('GET', '/summary', { token: login.json.token })).json.envelopes).toHaveLength(4);
  });
});

describe('gelir ve yeni zarf', () => {
  it('ayarlardan gelir değişince açık dönemin dağıtılmamış tutarı güncellenir', async () => {
    const U = await register('gelir');
    const env = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Kira', color: '#fff' } })).json.id;
    await call('POST', '/payday', { token: U.token, body: { income: 30_000_00, allocations: [{ envelopeId: env, amount: 20_000_00 }] } });
    expect((await call('PATCH', '/settings', { token: U.token, body: { income: 40_000_00 } })).status).toBe(200);
    const s = (await call('GET', '/summary', { token: U.token })).json;
    expect(s.cycle.income).toBe(40_000_00);
    expect(s.unassigned).toBe(20_000_00);
  });

  it('aynı geliri yeniden kaydetmek eski kalmış dönemi düzeltir, ek gelirler korunur', async () => {
    const U = await register('eskigelir');
    const env = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Kira', color: '#fff' } })).json.id;
    await call('POST', '/payday', { token: U.token, body: { income: 121_000_00, allocations: [{ envelopeId: env, amount: 0 }] } });
    await call('POST', '/incomes', { token: U.token, body: { amount: 1_000_00 } });
    // Eski sürümde dönem güncellenmeden yalnızca profil geliri değişmiş olabilir
    const { db, t } = await import('../src/db/index.js');
    const { eq } = await import('drizzle-orm');
    await db.update(t.users).set({ income: 135_000_00 }).where(eq(t.users.id, U.user.id));
    await call('PATCH', '/settings', { token: U.token, body: { income: 135_000_00 } });
    const s = (await call('GET', '/summary', { token: U.token })).json;
    expect(s.cycle.income).toBe(136_000_00);
    expect(s.unassigned).toBe(136_000_00);
  });

  it('planlanan tutar dağıtılmamış gelirden yeni zarfa konur, fazlası konmaz', async () => {
    const U = await register('yenizarf');
    const env = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Kira', color: '#fff' } })).json.id;
    await call('POST', '/payday', { token: U.token, body: { income: 10_000_00, allocations: [{ envelopeId: env, amount: 7_000_00 }] } });
    const a = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Spor', color: '#fff', plannedAmount: 2_000_00 } })).json;
    expect(a.funded).toBe(2_000_00);
    const b = (await call('POST', '/envelopes', { token: U.token, body: { name: 'Tatil', color: '#fff', plannedAmount: 5_000_00 } })).json;
    expect(b.funded).toBe(1_000_00);
    const s = (await call('GET', '/summary', { token: U.token })).json;
    expect(s.unassigned).toBe(0);
    expect(s.left).toBe(10_000_00);
  });
});
