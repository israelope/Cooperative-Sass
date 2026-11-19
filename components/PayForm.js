'use client';
import { useState } from 'react';

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

  return (
    <form onSubmit={pay} className="panel max-w-md space-y-4 p-6">
      {purpose === 'loan_repayment' && maxAmount != null && <p className="text-sm text-ink/70">You still owe <span className="num font-semibold">₦{Number(maxAmount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span> on this loan. Pay all or part of it.</p>}
      <div>
        <label htmlFor={`amount-${loanId || 'c'}`} className="label">Amount (₦)</label>
        <input id={`amount-${loanId || 'c'}`} type="number" inputMode="decimal" min="1" step="0.01" max={maxAmount || undefined} required value={amount} onChange={(e) => setAmount(e.target.value)} className="input num text-lg" disabled={disabled} />
        {quick && <div className="mt-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" disabled={disabled} onClick={() => setAmount(String(q))} className="btn-quiet btn-sm num">₦{q.toLocaleString('en-NG')}</button>
          ))}
        </div>}
      </div>
      <button className="btn-gold w-full" disabled={disabled || state.busy}>{state.busy ? 'Opening Paystack…' : buttonLabel}</button>
      {state.error && <p role="alert" className="rounded-lg bg-bad-100 px-3 py-2 text-sm text-bad-700">{state.error}</p>}
      <p className="hint">Your money is paid by Paystack into your cooperative's bank account, usually the next working day. Your passbook updates as soon as Paystack confirms the payment.</p>
    </form>
  );
}
