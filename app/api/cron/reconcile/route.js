import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Periodic reconciliation sweep (Vercel Cron or any scheduler): retries events that arrived early,
 * flags settlements that are late, and marks cases that missed their deadline UNRESOLVED.
 * Call with:  Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const { data, error } = await createServiceClient().rpc('reconcile_sweep', {
    p_settle_window: `${num(process.env.RECON_SETTLE_HOURS, 48)} hours`,
    p_final_window: `${num(process.env.RECON_FINAL_DAYS, 7)} days`,
    p_review_window: `${num(process.env.RECON_REVIEW_DAYS, 14)} days`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
