import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { addDays, clampedDate, today } from '../src/lib/dates.js';

let ipSeq = 200;
async function call(method: string, path: string, o: { token?: string; body?: unknown } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.2.0.${++ipSeq % 250}`,
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

let token: string;

beforeAll(async () => {
  const r = await call('POST', '/auth/register', { body: { email: `banka-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name: 'Banka' } });
  token = r.json.token;
});

describe('banka durumu', () => {
  it('esnek hesap ve kart için kullanılabilir tutar ve borç hesaplanır', async () => {
    await call('POST', '/accounts', { token, body: { name: 'Vadesiz', kind: 'bank', balance: -105_156_37, creditLimit: 250_000_00 } });
    await call('POST', '/accounts', { token, body: { name: 'Kart', kind: 'card', balance: -60_229_56, creditLimit: 145_960_84, pending: 1_949_89 } });
    const m = (await call('GET', '/money', { token })).json;
    expect(m.accounts.map((a: any) => a.available)).toEqual([144_843_63, 83_781_39]);
    expect(m.totals.available).toBe(144_843_63);
    expect(m.totals.debt).toBe(105_156_37 + 60_229_56 + 1_949_89);
  });

  it('yapıştırılan ödemeler aylara gruplanır, tekrarlar atlanır, ödenince listeden düşer', async () => {
    const soon = addDays(today(), 5);
    const later = addDays(today(), 70);
    const items = [
      { source: 'İhtiyaç kredisi', name: 'İhtiyaç kredisi', amount: 12_500_00, dueDate: soon },
      { source: 'İhtiyaç kredisi', name: 'İhtiyaç kredisi', amount: 12_500_00, dueDate: later },
      { source: 'Kart taksitleri', name: 'Zara', amount: 1_495_00, dueDate: soon },
      { source: 'Kart taksitleri', name: 'Tod', amount: 399_00, dueDate: soon },
    ];
    expect((await call('POST', '/schedule', { token, body: { items } })).json).toEqual({ added: 4, skipped: 0 });
    expect((await call('POST', '/schedule', { token, body: { items } })).json).toEqual({ added: 0, skipped: 4 });
    const kart = (await call('GET', '/debts', { token })).json.find((d: any) => d.name === 'Kart taksitleri');
    expect(kart.monthlyPayment).toBe(1_894_00);

    const m = (await call('GET', '/money', { token })).json;
    expect(m.totals.scheduled).toBe(26_894_00);
    expect(m.months[0]).toMatchObject({ month: soon.slice(0, 7) });
    expect(m.months.at(-1).items).toHaveLength(1);

    const s = (await call('GET', '/summary', { token })).json;
    expect(s.scheduledDue).toMatchObject({ total: 14_394_00, count: 3 });

    const zara = m.months[0].items.find((i: any) => i.name === 'Zara');
    await call('PATCH', `/schedule/${zara.id}`, { token, body: { paid: true } });
    const after = (await call('GET', '/money', { token })).json;
    expect(after.totals.scheduled).toBe(25_399_00);
    expect(after.recentPaid).toHaveLength(1);
  });
});

describe('banka durumu bağlantıları', () => {
  let U: string;
  let env: string;
  beforeAll(async () => {
    const r = await call('POST', '/auth/register', { body: { email: `bag-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name: 'Bağ' } });
    U = r.json.token;
    // Bu grup elle dağıtımı sınar; otomatik dağıtım ayrı testte
    await call('PATCH', '/settings', { token: U, body: { autoAllocate: false } });
    env = (await call('POST', '/envelopes', { token: U, body: { name: 'Krediler', color: '#fff' } })).json.id;
    await call('POST', '/envelopes', { token: U, body: { name: 'Kira', color: '#fff', kind: 'fixed', plannedAmount: 67_500_00, dueDay: 1 } });
    await call('POST', '/payday', { token: U, body: { income: 135_000_00, allocations: [{ envelopeId: env, amount: 40_000_00 }] } });
  });

  it('eksi bakiye, kart ve takvim kaynakları Borçlarım’a otomatik düşer; ekstre takvime girer', async () => {
    await call('POST', '/accounts', { token: U, body: { name: 'Vadesiz', kind: 'bank', balance: -100_000_00, creditLimit: 250_000_00 } });
    // Ekstre tarihi her zaman açık dönemin içinde kalsın (ay sonuna yakın günlerde de)
    const due = today();
    const [yy, mm] = today().split('-').map(Number);
    await call('POST', '/accounts', { token: U, body: { name: 'Kart', kind: 'card', balance: -60_000_00, creditLimit: 200_000_00, pending: 2_000_00, dueDate: due, dueAmount: 20_000_00 } });
    await call('POST', '/schedule', {
      token: U,
      // Her taksit ayrı takvim ayına düşer; yılın hangi gününde çalışırsa çalışsın 3 ay sayılır
      body: { items: [1, 2, 3].map((i) => ({ source: 'İhtiyaç kredisi', name: 'İhtiyaç kredisi', amount: 12_500_00, dueDate: clampedDate(yy, mm + i, 15) })) },
    });
    const debts = (await call('GET', '/debts', { token: U })).json;
    const by = Object.fromEntries(debts.map((d: any) => [d.name, d]));
    expect(by['Vadesiz']).toMatchObject({ balance: 100_000_00, auto: true });
    expect(by['Kart']).toMatchObject({ balance: 62_000_00, monthlyPayment: 20_000_00, auto: true });
    expect(by['İhtiyaç kredisi']).toMatchObject({ balance: 37_500_00, monthlyPayment: 12_500_00, type: 'loan', months: 3 });
    expect(by['Kart ekstresi']).toBeUndefined();
    const m = (await call('GET', '/money', { token: U })).json;
    expect(m.months.flatMap((x: any) => x.items).find((i: any) => i.source === 'Kart ekstresi')).toMatchObject({ amount: 20_000_00, dueDate: due });
    // Otomatik borç Borçlarım'dan silinemez
    expect((await call('DELETE', `/debts/${by['Vadesiz'].id}`, { token: U })).status).toBe(400);
  });

  it('güvenli harcama maaşa kadarki ödemeleri düşer; zarftan ödenince harcama kaydedilir ve geri alınabilir', async () => {
    const s = (await call('GET', '/summary', { token: U })).json;
    expect(s.safeToSpend).toBe(s.left - s.scheduledDue.total);
    const m = (await call('GET', '/money', { token: U })).json;
    const item = m.months[0].items[0];
    await call('PATCH', `/schedule/${item.id}`, { token: U, body: { paid: true, envelopeId: env } });
    const after = (await call('GET', '/summary', { token: U })).json;
    expect(after.left).toBe(s.left - item.amount);
    expect(after.safeToSpend).toBe(s.safeToSpend);
    await call('PATCH', `/schedule/${item.id}`, { token: U, body: { paid: false } });
    expect((await call('GET', '/summary', { token: U })).json.left).toBe(s.left);
  });

  it('nakit akışı her maaş dönemi için gelir, ödemeler ve kalanı verir; kaynak adı değiştirilebilir', async () => {
    const m = (await call('GET', '/money', { token: U })).json;
    expect(m.cashflow).toHaveLength(12);
    for (const f of m.cashflow) expect(f.free).toBe(f.income - f.total);
    // Sabit zarf her dönem ödemelere girer
    for (const f of m.cashflow) expect(f.items.find((x: any) => x.label === 'Kira')?.amount).toBe(67_500_00);
    expect(m.cashflow.reduce((s: number, f: any) => s + f.total, 0)).toBeGreaterThanOrEqual(37_500_00);
    expect(m.history.at(-1).net).toBe(-100_000_00 - 60_000_00 - 2_000_00);

    await call('POST', '/schedule/rename', { token: U, body: { from: 'İhtiyaç kredisi', to: 'Banka kredisi' } });
    const debts = (await call('GET', '/debts', { token: U })).json;
    expect(debts.map((d: any) => d.name)).toContain('Banka kredisi');
    expect(debts.map((d: any) => d.name)).not.toContain('İhtiyaç kredisi');
  });

  it('takvim ayına göre plan: her ayın tarihli ödemeleri, borç/sabit ayrımı ve cebe kalan', async () => {
    const p = (await call('GET', '/plan?months=6', { token: U })).json;
    expect(p.months).toHaveLength(6);
    expect(p.months[0].month).toBe(today().slice(0, 7));
    for (const m of p.months) {
      expect(m.free).toBe(m.income.amount - m.total);
      expect(m.debtTotal + m.fixedTotal + m.spendingTotal).toBe(m.total);
      expect(m.items.find((x: any) => x.label === 'Kira')).toMatchObject({ amount: 67_500_00, kind: 'fixed', date: `${m.month}-01` });
    }
    const kredi = p.months.flatMap((m: any) => m.items).filter((x: any) => x.source === 'Banka kredisi');
    expect(kredi.length).toBe(3);
    expect(kredi.every((x: any) => x.kind === 'installment' || x.kind === 'loan')).toBe(true);
  });

  it('ay ay projeksiyon banka bakiyesinden başlar ve bir sonraki aya taşınır', async () => {
    const p = (await call('GET', '/plan?months=6', { token: U })).json;
    expect(p.bank).toBe(-100_000_00);
    expect(p.months[0].opening).toBe(-100_000_00);
    for (const [i, m] of p.months.entries()) {
      expect(m.closing).toBe(m.opening + m.incomeCounted - m.paymentsCounted);
      if (i > 0) expect(m.opening).toBe(p.months[i - 1].closing);
    }
    // Eksi bakiye maaşlarla kapanıyorsa ilk artı ay bulunur
    const firstPositive = p.months.find((m: any) => m.closing >= 0);
    expect(p.positiveMonth).toBe(firstPositive?.month ?? null);
  });
});

describe('erken ödenen sabit gider', () => {
  it('vadesinden önce ödenen sabit gider o ay ödendi sayılır ve projeksiyona tekrar girmez', async () => {
    const r = await call('POST', '/auth/register', { body: { email: `kira-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name: 'Kira' } });
    const tk = r.json.token;
    const env = (await call('POST', '/envelopes', { token: tk, body: { name: 'Kira', icon: '🏠', color: '#A7D3F2', kind: 'fixed', plannedAmount: 10_000_00, dueDay: 1 } })).json;
    const before = (await call('GET', '/plan?months=3', { token: tk })).json;
    expect((await call('POST', '/transactions', { token: tk, body: { envelopeId: env.id, amount: 10_000_00, note: 'Gelecek ayın kirası' } })).status).toBe(200);
    const p = (await call('GET', '/plan?months=3', { token: tk })).json;
    const kira = p.months.map((m: any) => m.items.find((x: any) => x.label === 'Kira'));
    // Bugünden sonraki ilk vade ödendi, sonrakiler ödenmedi
    const next = kira.findIndex((x: any) => x.date >= today());
    expect(kira[next].paid).toBe(true);
    expect(kira.slice(next + 1).every((x: any) => !x.paid)).toBe(true);
    expect(p.months[next].paymentsCounted).toBe(before.months[next].paymentsCounted - 10_000_00);
  });
});

describe('sabit gider başlangıcı', () => {
  it('başlangıç tarihinden önceki aylarda plana yazılmaz, sonrasında yazılır', async () => {
    const r = await call('POST', '/auth/register', { body: { email: `baslangic-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name: 'Baslangic' } });
    const tk = r.json.token;
    const [y, m] = today().split('-').map(Number);
    const plannedFrom = clampedDate(y, m + 2, 1);
    const env = (await call('POST', '/envelopes', { token: tk, body: { name: 'Kira', icon: '🏠', color: '#A7D3F2', kind: 'fixed', plannedAmount: 10_000_00, dueDay: 1, plannedFrom } })).json;
    expect(env.plannedFrom).toBe(plannedFrom);
    const kira = (p: any) => p.months.map((x: any) => x.items.some((i: any) => i.label === 'Kira'));
    expect(kira((await call('GET', '/plan?months=4', { token: tk })).json)).toEqual([false, false, true, true]);
    const flow = (await call('GET', '/money', { token: tk })).json.cashflow;
    expect(flow.at(-1).items.some((i: any) => i.label === 'Kira')).toBe(true);
    expect(flow[0].items.some((i: any) => i.label === 'Kira')).toBe(false);
    // Tarih kaldırılınca her ay yeniden yazılır
    await call('PATCH', `/envelopes/${env.id}`, { token: tk, body: { plannedFrom: null } });
    expect(kira((await call('GET', '/plan?months=4', { token: tk })).json)).toEqual([true, true, true, true]);
  });
});

describe('ödeme aracı', () => {
  it('kartla yapılan harcama provizyona, banka harcaması bakiyeye yansır; silinince geri alınır', async () => {
    const r = await call('POST', '/auth/register', { body: { email: `kart-${Date.now()}@test.dev`, password: 'gizli-sifre-1', name: 'Kart' } });
    const tk = r.json.token;
    await call('PATCH', '/settings', { token: tk, body: { autoAllocate: false } });
    const env = (await call('POST', '/envelopes', { token: tk, body: { name: 'Alışveriş', color: '#fff' } })).json.id;
    await call('POST', '/payday', { token: tk, body: { income: 10_000_00, allocations: [{ envelopeId: env, amount: 5_000_00 }] } });
    const card = (await call('POST', '/accounts', { token: tk, body: { name: 'Kart', kind: 'card', balance: -1_000_00, creditLimit: 10_000_00, pending: 0 } })).json;
    const bank = (await call('POST', '/accounts', { token: tk, body: { name: 'Banka', kind: 'bank', balance: 2_000_00 } })).json;

    const tx = (await call('POST', '/transactions', { token: tk, body: { envelopeId: env, amount: 224_00, note: 'Amazon', accountId: card.id } })).json;
    let m = (await call('GET', '/money', { token: tk })).json;
    expect(m.accounts.find((a: any) => a.id === card.id).pending).toBe(224_00);

    // Ödeme aracı bankaya çevrilince kart geri alınır, banka bakiyesi düşer
    await call('PATCH', `/transactions/${tx.id}`, { token: tk, body: { accountId: bank.id } });
    m = (await call('GET', '/money', { token: tk })).json;
    expect(m.accounts.find((a: any) => a.id === card.id).pending).toBe(0);
    expect(m.accounts.find((a: any) => a.id === bank.id).balance).toBe(2_000_00 - 224_00);

    await call('DELETE', `/transactions/${tx.id}`, { token: tk });
    m = (await call('GET', '/money', { token: tk })).json;
    expect(m.accounts.find((a: any) => a.id === bank.id).balance).toBe(2_000_00);
  });
});
