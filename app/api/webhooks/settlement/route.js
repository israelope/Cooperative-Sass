import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyPaystackSignature } from '@/lib/signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Settlement report: tells the platform what happened to the COOPERATIVE'S SHARE of a confirmed payment.
 * Body: { "reference": "CT-...", "share": 19950.00, "leg_ok": true }   (share in naira; leg_ok false = the leg failed)
 * Signed like a Paystack webhook (HMAC-SHA512 of the raw body, header x-paystack-signature).
 *
 * Paystack test mode produces no real settlements, so in this project the simulated gateway
 * (eval/) posts here. In production, a scheduled job that reads Paystack's settlement records
 * would post the same message.
 */
export async function POST(req) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get('x-paystack-signature'), process.env.PAYSTACK_SECRET_KEY)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }
  const { reference, share = null, leg_ok = true } = body || {};
  if (typeof reference !== 'string' || !reference || (share !== null && !Number.isFinite(Number(share))) || typeof leg_ok !== 'boolean') {
    return NextResponse.json({ error: 'reference, share and leg_ok are required' }, { status: 400 });
  }
  const { data, error } = await createServiceClient().rpc('record_settlement', {
    p_reference: reference, p_share: share === null ? null : Number(share), p_leg_ok: leg_ok,
  });
  if (error) return NextResponse.json({ error: 'Retry later' }, { status: 500 });
  return NextResponse.json({ received: true, result: data });
}
