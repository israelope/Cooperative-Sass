import { describe, it, expect } from 'vitest';
import { loanQuote } from '@/lib/loans';

describe('loan repayment preview', () => {
  it('matches the decide_loan formula', () => {
    const q = loanQuote(100000, 12, 6);
    expect(q.total).toBe(106000);
    expect(q.interest).toBe(6000);
    expect(q.monthly).toBe(17666.67);
  });

  it('clamps silly month values', () => {
    expect(loanQuote(1000, 0, 0).months).toBe(1);
    expect(loanQuote(1000, 0, 500).months).toBe(120);
    expect(loanQuote(1000, 0, 12).total).toBe(1000);
  });
});
