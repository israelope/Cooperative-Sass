import { describe, it, expect } from 'vitest';
import { nextBalance, eligibleLimit, totalRepayable, savingsDelta } from '@/lib/money';

describe('running balance (U1, U2)', () => {
  it('adds a contribution to the previous balance', () => expect(nextBalance(10000, 'contribution', 5000)).toBe(15000));
  it('starts from zero when there are no previous entries', () => expect(nextBalance(undefined, 'contribution', 5000)).toBe(5000));
  it('loan entries do not change savings', () => {
    expect(savingsDelta('loan_disbursed', 100)).toBe(0);
    expect(savingsDelta('repayment', 100)).toBe(0);
  });
  it('never goes negative', () => expect(() => nextBalance(1000, 'withdrawal', 5000)).toThrow());
});

describe('eligible loan limit, Equation 4.1 (U3, U4)', () => {
  it('multiplier 2, savings 50,000, loan 20,000 => 80,000', () =>
    expect(eligibleLimit({ multiplier: 2, savings: 50000, outstanding: 20000 })).toBe(80000));
  it('is never negative', () => expect(eligibleLimit({ multiplier: 2, savings: 10000, outstanding: 50000 })).toBe(0));
});

describe('loan total repayable (simple interest)', () => {
  it('100,000 at 12% a year for 6 months = 106,000', () => expect(totalRepayable(100000, 12, 6)).toBe(106000));
  it('0% interest returns the principal', () => expect(totalRepayable(50000, 0, 12)).toBe(50000));
});
