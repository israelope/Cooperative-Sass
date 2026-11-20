'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';

/** Polls the payment status. The passbook is credited by the verified webhook, not by this page. */
export default function PaymentProcessing({ reference }) {
  const [status, setStatus] = useState('pending');
  const [purpose, setPurpose] = useState('contribution');
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (status !== 'pending' || tries > 40) return;
    const t = setTimeout(async () => {
      try {
        // After a few seconds without the webhook, also ask Paystack directly (verify fallback).
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(reference)}${tries >= 3 ? '&verify=1' : ''}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.purpose) setPurpose(json.purpose);
        if (json.status) setStatus(json.status === 'abandoned' ? 'failed' : json.status);
      } catch { /* try again */ }
      setTries((n) => n + 1);
    }, tries === 0 ? 800 : 2000);
    return () => clearTimeout(t);
  }, [status, tries, reference]);

  if (status === 'success') {
    return (
      <div className="panel max-w-md p-6" role="status">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok-100 text-ok-700"><Icon name="checkCircle" size={24} /></span>
        <h2 className="mt-4 font-display text-2xl font-bold text-ok-700">{purpose === 'loan_repayment' ? 'Repayment received' : 'Payment received'}</h2>
        <p className="mt-2 text-sm text-ink/75">{purpose === 'loan_repayment' ? 'Your loan balance and passbook have been updated.' : 'Your passbook has been updated.'}</p>
        <Link href={purpose === 'loan_repayment' ? '/member/loans' : '/member/passbook'} className="btn-primary mt-4">
          <Icon name={purpose === 'loan_repayment' ? 'bank' : 'book'} size={16} />
          {purpose === 'loan_repayment' ? 'View my loans' : 'View my passbook'}
        </Link>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="panel max-w-md p-6" role="alert">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-bad-100 text-bad-700"><Icon name="xCircle" size={24} /></span>
        <h2 className="mt-4 font-display text-2xl font-bold text-bad-700">Payment did not go through</h2>
        <p className="mt-2 text-sm text-ink/75">No money was added to your passbook. If your bank debited you, contact your cooperative and quote this reference: <span className="font-mono">{reference}</span>.</p>
        <Link href="/member/pay" className="btn-primary mt-4"><Icon name="refresh" size={16} /> Try again</Link>
      </div>
    );
  }
  if (tries > 40) {
    return (
      <div className="panel max-w-md p-6">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-marigold-100 text-marigold-700"><Icon name="clock" size={24} /></span>
        <h2 className="mt-4 font-display text-xl font-bold text-adire-900">Still waiting for confirmation</h2>
        <p className="mt-2 text-sm text-ink/75">This can take a few minutes. Check your passbook shortly. If your account was debited and nothing appears, quote reference <span className="font-mono">{reference}</span> to your admin.</p>
        <Link href="/member/passbook" className="btn-primary mt-4"><Icon name="book" size={16} /> Open passbook</Link>
      </div>
    );
  }
  return (
    <div className="panel max-w-md p-6" role="status" aria-live="polite">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-adire-50 text-adire-600">
        <Icon name="refresh" size={24} className="animate-spin" />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-adire-900">Confirming your payment…</h2>
      <p className="mt-2 text-sm text-ink/75">Please keep this page open. Reference: <span className="font-mono">{reference}</span></p>
    </div>
  );
}
