'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';

const QUICK = [5000, 10000, 20000, 50000];

export default function PayForm({ disabled, purpose = 'contribution', loanId = null, maxAmount = null, defaultAmount = '', buttonLabel = 'Pay securely with Paystack', quick = true }) {
  const [amount, setAmount] = useState(defaultAmount === '' ? '' : String(defaultAmount));
  const [state, setState] = useState({ busy: false, error: '' });

  async function pay(e) {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), purpose, loanId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Could not start the payment.');
      window.location.href = json.url;      // Paystack hosted checkout
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  const hintId = `pay-hint-${loanId || 'c'}`;

  return (
    <form onSubmit={pay} className="panel max-w-md space-y-4 p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900">
        <Icon name="wallet" size={18} className="text-accent-500" />
        {purpose === 'loan_repayment' ? 'Repay your loan' : 'Pay a contribution'}
      </h2>
      {purpose === 'loan_repayment' && maxAmount != null && (
        <div className="callout-info">
          <Icon name="info" size={17} className="mt-0.5" />
          <span>You still owe <span className="num font-semibold">₦{Number(maxAmount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span> on this loan. Pay all or part of it.</span>
        </div>
      )}
      <div>
        <label htmlFor={`amount-${loanId || 'c'}`} className="label">Amount (₦)</label>
        <input
          id={`amount-${loanId || 'c'}`}
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          max={maxAmount || undefined}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-describedby={hintId}
          className="input num text-lg"
          disabled={disabled}
        />
        {quick && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={disabled}
                aria-pressed={String(amount) === String(q)}
                onClick={() => setAmount(String(q))}
                className={`btn btn-sm num ${String(amount) === String(q) ? 'bg-accent-700 text-white' : 'bg-accent-50 text-accent-800 hover:bg-accent-100'}`}
              >
                ₦{q.toLocaleString('en-NG')}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="btn-gold w-full" disabled={disabled || state.busy}>
        <Icon name={state.busy ? 'refresh' : 'lock'} size={16} />
        {state.busy ? 'Opening Paystack…' : buttonLabel}
      </button>
      {state.error && (
        <div role="alert" className="callout-bad">
          <Icon name="xCircle" size={18} className="mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}
      <p id={hintId} className="hint">Your money is paid by Paystack into your cooperative&apos;s bank account, usually the next working day. Your passbook updates as soon as Paystack confirms the payment.</p>
    </form>
  );
}
