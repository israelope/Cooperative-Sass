import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily savings-reminder sweep (Vercel Cron). Creates in-app notices only;
 * it never sends email or SMS and never moves money.
 * Call with: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const { data, error } = await createServiceClient().rpc('generate_contribution_notifications');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
