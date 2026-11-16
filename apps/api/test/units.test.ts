import { describe, expect, it } from 'vitest';
import { addDays, clampedDate, cycleRange, dueDateInRange } from '../src/lib/dates.js';
import { debtPlan } from '../src/lib/debt.js';

describe('tarih hesapları', () => {
  it('maaş gününe göre dönem aralığı', () => {
    expect(cycleRange('2026-10-23', 15)).toEqual({ start: '2026-10-15', end: '2026-11-14' });
    expect(cycleRange('2026-10-10', 15)).toEqual({ start: '2026-09-15', end: '2026-10-14' });
    expect(cycleRange('2026-10-15', 15)).toEqual({ start: '2026-10-15', end: '2026-11-14' });
  });

  it('kısa aylarda gün ayın sonuna sabitlenir', () => {
    expect(clampedDate(2026, 2, 31)).toBe('2026-02-28');
    expect(clampedDate(2028, 2, 30)).toBe('2028-02-29');
    expect(cycleRange('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-30' });
    expect(cycleRange('2026-12-31', 31)).toEqual({ start: '2026-12-31', end: '2027-01-30' });
  });

  it('yıl geçişi', () => {
    expect(cycleRange('2027-01-03', 15)).toEqual({ start: '2026-12-15', end: '2027-01-14' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('dönem içindeki ödeme günü', () => {
    expect(dueDateInRange(5, '2026-10-15', '2026-11-14')).toBe('2026-11-05');
    expect(dueDateInRange(20, '2026-10-15', '2026-11-14')).toBe('2026-10-20');
    expect(dueDateInRange(31, '2026-02-01', '2026-02-28')).toBe('2026-02-28');
  });
});

describe('borç planı', () => {
  const base = { id: 'x', userId: 'u', envelopeId: null, name: 'Kart', type: 'card' as const, dueDay: null, createdAt: new Date() };

  it('faizsiz borç ödeme sayısı', () => {
    const p = debtPlan({ ...base, balance: 10_000_00, monthlyPayment: 1_000_00, interestRate: null, ratePeriod: 'monthly' });
    expect(p.months).toBe(10);
    expect(p.totalInterest).toBe(0);
  });

  it('faizli borç daha uzun sürer', () => {
    const p = debtPlan({ ...base, balance: 100_000_00, monthlyPayment: 10_000_00, interestRate: 350, ratePeriod: 'monthly' });
    expect(p.months).toBe(13);
    expect(p.totalInterest).toBeGreaterThan(0);
  });

  it('ödeme faizi karşılamıyorsa bitiş yok', () => {
    const p = debtPlan({ ...base, balance: 100_000_00, monthlyPayment: 1_000_00, interestRate: 500, ratePeriod: 'monthly' });
    expect(p.payoffDate).toBeNull();
  });

  it('yıllık oran aylığa bölünür', () => {
    const y = debtPlan({ ...base, balance: 50_000_00, monthlyPayment: 5_000_00, interestRate: 1200, ratePeriod: 'yearly' });
    const m = debtPlan({ ...base, balance: 50_000_00, monthlyPayment: 5_000_00, interestRate: 100, ratePeriod: 'monthly' });
    expect(y.months).toBe(m.months);
  });
});

