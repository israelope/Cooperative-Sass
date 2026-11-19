import { NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { toCsv } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Fee ledger export (CSV): one row per successful online payment. Platform owner only. */
export async function GET(req) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const days = [30, 90, 365].includes(Number(new URL(req.url).searchParams.get('days'))) ? Number(new URL(req.url).searchParams.get('days')) : 30;
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const { data } = await createServiceClient().from('transactions')
    .select('reference, amount, platform_fee, paystack_fee, fee_bearer, paid_at, created_at, tenants(name)')
    .eq('status', 'success').eq('channel', 'online').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(20000);

  const csv = toCsv([
    ['date', 'cooperative', 'reference', 'amount', 'platform_fee', 'paystack_fee', 'fee_bearer', 'net_revenue'],
    ...(data || []).map((t) => {
      const borne = t.fee_bearer === 'account' ? Number(t.paystack_fee) : 0;
      return [(t.paid_at || t.created_at || '').slice(0, 10), t.tenants?.name, t.reference, t.amount, t.platform_fee, t.paystack_fee, t.fee_bearer || '', (Number(t.platform_fee) - borne).toFixed(2)];
    }),
  ]);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="fee-ledger-${days}d.csv"` } });
}
