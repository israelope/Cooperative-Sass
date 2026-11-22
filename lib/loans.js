import { totalRepayable } from '@/lib/money';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Reuses the project's tested simple-interest helper (same formula as decide_loan). */
export function loanQuote(principal, rate, months) {
  const p = Math.max(0, Number(principal) || 0);
  const r = Math.max(0, Number(rate) || 0);
  const m = Math.min(120, Math.max(1, Math.round(Number(months) || 1)));
  const total = totalRepayable(p, r, m);
  return { principal: p, rate: r, months: m, interest: round2(total - p), total, monthly: round2(total / m) };
}
