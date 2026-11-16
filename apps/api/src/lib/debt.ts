import type { t } from '../db/index.js';
import { today } from './dates.js';

type Debt = typeof t.debts.$inferSelect;

// Aylık ödemeyle borcun ne zaman biteceğini ay ay simüle eder
export function debtPlan(d: Debt) {
  const yearly = d.ratePeriod === 'yearly';
  const r = d.interestRate ? d.interestRate / 10000 / (yearly ? 12 : 1) : 0;
  let balance = d.balance;
  let months = 0;
  let interest = 0;
  if (d.monthlyPayment <= 0 || d.monthlyPayment <= balance * r) {
    return { months: null, payoffDate: null, totalInterest: null, monthlyRate: r };
  }
  while (balance > 0 && months < 600) {
    const i = Math.round(balance * r);
    interest += i;
    balance = balance + i - d.monthlyPayment;
    months++;
  }
  const [y, m] = today().split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, 1));
  return {
    months,
    payoffDate: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`,
    totalInterest: interest,
    monthlyRate: r,
  };
}
