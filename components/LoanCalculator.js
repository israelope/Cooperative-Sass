'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import { naira } from '@/lib/format';
import { loanQuote } from '@/lib/loans';

/** Preview only: the admin's approval uses the same formula in decide_loan(). */
export default function LoanCalculator({ rate, limit }) {
  const [amount, setAmount] = useState(10000);
  const [months, setMonths] = useState(12);
  const quote = loanQuote(amount, rate, months);
  const overLimit = quote.principal > Number(limit || 0);

  return (
    <section className="panel mb-8 max-w-xl p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="chart" size={18} className="text-accent-500" /> Estimate your repayment</h2>
      <p className="mt-1 text-sm text-ink/75">Simple interest at {Number(rate || 0)}% a year. This is an estimate; the admin confirms the final rate.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="calcAmount" className="label">Amount (₦)</label>
          <input id="calcAmount" type="number" min="1" max={limit || undefined} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </div>
        <div>
          <label htmlFor="calcMonths" className="label">Months</label>
          <input id="calcMonths" type="number" min="1" max="120" value={months} onChange={(e) => setMonths(e.target.value)} className="input" />
        </div>
      </div>
      <dl className="mt-4 grid gap-2 rounded-xl bg-accent-50 p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-ink/70">Interest</dt><dd className="num font-semibold">{naira(quote.interest)}</dd></div>
        <div><dt className="text-ink/70">Total to repay</dt><dd className="num font-semibold text-accent-900">{naira(quote.total)}</dd></div>
        <div><dt className="text-ink/70">About per month</dt><dd className="num font-semibold">{naira(quote.monthly)}</dd></div>
      </dl>
      {overLimit && <p className="callout-bad mt-3"><span>That is above your current limit of {naira(limit)}.</span></p>}
    </section>
  );
}
