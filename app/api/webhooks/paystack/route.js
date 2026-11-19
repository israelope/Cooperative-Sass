import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyPaystackSignature } from '@/lib/signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Paystack webhook: the AUTHORITATIVE signal that a payment succeeded.
 * 1) verify the HMAC-SHA512 signature over the RAW body  2) hand over to the database function,
 * which reconciles the payment (idempotent, checks amount and split, records the decision)
 * 3) answer 200 quickly.
 */
export async function POST(req) {
  const raw = await req.text();                                   // raw body is required for the HMAC
  const signature = req.headers.get('x-paystack-signature');

  if (!verifyPaystackSignature(raw, signature, process.env.PAYSTACK_SECRET_KEY)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }
  const reference = event?.data?.reference;
  if (!reference) return NextResponse.json({ received: true });

  const supabase = createServiceClient();

  // A failure notice that arrives after a success must never undo it (out-of-order rule).
  if (event.event === 'charge.failed') {
    const { data, error } = await supabase.rpc('process_failed_notice', { p_reference: reference });
    if (error) return NextResponse.json({ error: 'Retry later' }, { status: 500 });
    return NextResponse.json({ received: true, result: data });
  }
  if (event.event !== 'charge.success') return NextResponse.json({ received: true });   // other events: acknowledge

  const { data, error } = await supabase.rpc('process_successful_payment', {
    p_reference: reference,
    p_amount: Number(event.data.amount) / 100,                    // kobo -> naira
    p_currency: event.data.currency,
    p_payload: event,
  });
  if (error) {
    console.error('Reconciliation error', error.message);
    return NextResponse.json({ error: 'Retry later' }, { status: 500 });   // Paystack will retry
  }
  return NextResponse.json({ received: true, result: data });
}
