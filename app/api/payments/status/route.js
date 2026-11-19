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

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const read = () => supabase.from('transactions').select('status, amount, purpose').eq('reference', ref).maybeSingle();
  let { data: txn } = await read();                               // RLS: a member sees only their own
  if (!txn) return NextResponse.json({ status: 'unknown' }, { status: 404 });

  if (txn.status === 'pending' && verify) {
    try {
      const ps = await verifyTransaction(ref);
      if (ps.status === 'success') {
        await createServiceClient().rpc('process_successful_payment', {
          p_reference: ref, p_amount: Number(ps.amount) / 100, p_currency: ps.currency, p_payload: { source: 'verify-fallback', data: ps },
        });
      } else if (ps.status === 'failed' || ps.status === 'abandoned') {
        return NextResponse.json({ status: ps.status });
      }
      ({ data: txn } = await read());
    } catch {
      // Paystack unreachable or reference unknown to Paystack yet: keep waiting for the webhook.
    }
  }
  return NextResponse.json({ status: txn.status, purpose: txn.purpose });
}
