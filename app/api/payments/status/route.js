import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyTransaction } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

/**
 * The member's browser polls this after returning from Paystack.
 * The webhook is the primary way a payment is credited. If it has not arrived yet and
 * ?verify=1 is sent, we ask Paystack directly (server-to-server, with our secret key) and run the
 * SAME idempotent database function, so the passbook is never credited twice.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const ref = url.searchParams.get('ref') || '';
  const verify = url.searchParams.get('verify') === '1';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const read = () => supabase.from('transactions').select('status, amount, purpose').eq('reference', ref).maybeSingle();
  let { data: txn } = await read();                               // RLS: a member sees only their own
  // A terminal state - the polling page must not keep waiting for a reference that does not exist.
  if (!txn) return NextResponse.json({ status: 'not_found' }, { status: 404 });

  if (txn.status === 'pending' && verify) {
    const service = createServiceClient();
    let ps;
    try {
      ps = await verifyTransaction(ref);
    } catch {
      // Paystack unreachable or the reference is not known to it yet: keep polling.
      return NextResponse.json({ status: txn.status, retry: true }, { status: 503 });
    }
    if (ps.status === 'success') {
      const amount = Number(ps.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Payment confirmation is incomplete' }, { status: 503 });
      }
      const { error } = await service.rpc('process_successful_payment', {
        p_reference: ref, p_amount: amount / 100, p_currency: ps.currency, p_payload: { source: 'verify-fallback', data: ps },
      });
      if (error) return NextResponse.json({ error: 'Payment could not be recorded yet' }, { status: 503 });
    } else if (ps.status === 'failed' || ps.status === 'abandoned') {
      const { error } = await service.rpc('mark_transaction_failed', { p_reference: ref });
      if (error) return NextResponse.json({ error: 'Payment status could not be saved yet' }, { status: 503 });
      return NextResponse.json({ status: ps.status });
    }
    ({ data: txn } = await read());
  }
  return NextResponse.json({ status: txn.status, purpose: txn.purpose });
}
