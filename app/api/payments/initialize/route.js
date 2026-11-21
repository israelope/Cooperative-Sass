import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { initializeTransaction, verifyTransaction } from '@/lib/paystack';
import { feeConfig, computePlatformFeeKobo } from '@/lib/fees';
import { getAppUrl } from '@/lib/appUrl';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const supabase = await createClient();                                // runs with the member's session, RLS applies
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const purpose = body.purpose === 'loan_repayment' ? 'loan_repayment' : 'contribution';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    return NextResponse.json({ error: 'Enter a valid amount (up to ₦10,000,000, at most 2 decimals).' }, { status: 400 });
  }

  // The member and tenant come from the database (RLS-filtered), never from the request body.
  const { data: member } = await supabase.from('members')
    .select('id, tenant_id, status, tenants(name, paystack_subaccount_code)')
    .eq('user_id', user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Member record not found.' }, { status: 404 });
  if (member.status !== 'active') return NextResponse.json({ error: 'Your membership is not active yet.' }, { status: 403 });

  // Loan repayment: the loan must be the member's own ACTIVE loan, and the amount cannot exceed what is still owed.
  let loanId = null;
  if (purpose === 'loan_repayment') {
    const { data: loan } = await supabase.from('loans').select('id, status, total_repayable, amount_repaid').eq('id', String(body.loanId || '')).maybeSingle();
    if (!loan || loan.status !== 'active') return NextResponse.json({ error: 'That loan is not active.' }, { status: 400 });
    const owed = Math.round((Number(loan.total_repayable) - Number(loan.amount_repaid)) * 100) / 100;
    // Pending checkouts reserve part of the balance: two full-amount checkouts must
    // not both pass and end up charging the member twice for one outstanding loan.
    const { data: pending } = await supabase.from('transactions')
      .select('amount').eq('loan_id', loan.id).eq('status', 'pending');
    const reserved = (pending || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const available = Math.round((owed - reserved) * 100) / 100;
    if (amount > available) {
      return NextResponse.json({ error: `Only ₦${available.toLocaleString('en-NG')} is available for this loan; another payment may still be processing.` }, { status: 400 });
    }
    if (amount < Math.min(100, available)) return NextResponse.json({ error: 'The minimum payment is ₦100.' }, { status: 400 });
    loanId = loan.id;
  } else if (amount < 100) {
    return NextResponse.json({ error: 'The minimum payment is ₦100.' }, { status: 400 });
  }

  const subaccount = member.tenants?.paystack_subaccount_code || null;
  if (!subaccount && process.env.PAYSTACK_ALLOW_NO_SUBACCOUNT !== 'true') {
    return NextResponse.json({ error: 'Your cooperative has not set up its payout account yet. Please tell your admin.' }, { status: 409 });
  }

  // Validate the callback origin before writing a transaction or a fee, so a
  // misconfigured deployment cannot leave an orphaned pending row.
  const processingUrl = `${getAppUrl()}/member/pay/processing?ref=`;
  const reference = 'CT-' + crypto.randomBytes(8).toString('hex');
  const { error: insErr } = await supabase.from('transactions').insert({
    tenant_id: member.tenant_id, member_id: member.id, reference, amount, channel: 'online', status: 'pending',
    purpose, loan_id: loanId,
  });
  if (insErr) return NextResponse.json({ error: 'Could not start the payment.' }, { status: 500 });

  // Record the platform's fee on the transaction (server side only; members cannot write fee columns).
  const amountKobo = Math.round(amount * 100);
  const cfg = feeConfig();
  const feeKobo = subaccount ? computePlatformFeeKobo(amountKobo, cfg) : 0;
  const service = createServiceClient();
  const failTransaction = () => service.from('transactions').update({ status: 'failed' }).eq('reference', reference);

  if (subaccount) {
    const { error: feeErr } = await service.from('transactions')
      .update({ platform_fee: feeKobo / 100, fee_bearer: cfg.bearer })
      .eq('reference', reference);
    if (feeErr) {
      // Revenue reporting would be wrong, and no charge has been attempted yet.
      await failTransaction();
      return NextResponse.json({ error: 'Could not record the platform fee. Please try again.' }, { status: 500 });
    }
  }

  try {
    const data = await initializeTransaction({
      email: user.email,
      amountKobo,
      reference,
      subaccount,
      feeKobo,
      bearer: cfg.bearer,
      callbackUrl: `${processingUrl}${reference}`,
    });
    return NextResponse.json({ url: data.authorization_url, reference });
  } catch (e) {
    // A failed initialize must not leave a pending row behind: retries would open multiple
    // checkouts for the same intent. Verify first so a lost Paystack response (where the
    // charge may have succeeded) is never marked failed - the webhook still needs that row.
    let ps = null;
    try {
      ps = await verifyTransaction(reference);
    } catch {
      // Verification unavailable - treat as inconclusive, never as a confirmed failure.
    }
    if (ps?.status === 'success') {
      // Charge went through despite the error response; the status page will credit it.
      return NextResponse.json({ url: `${processingUrl}${reference}`, reference });
    }
    const failed = ps?.status === 'failed' || ps?.status === 'abandoned';
    if (failed) await failTransaction();
    // Inconclusive or still pending: leave the row for the webhook / reconciliation sweep.
    const hint = failed ? '' : ` Check reference ${reference} in your passbook before paying again.`;
    return NextResponse.json({ error: `Paystack: ${e.message}.${hint}` }, { status: 502 });
  }
}
