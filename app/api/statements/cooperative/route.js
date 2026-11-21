import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePeriod, presetPeriods } from '@/lib/statement';
import { buildCooperativeStatement } from '@/lib/pdf/statements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PDF statement for the caller's whole cooperative. Admin / bookkeeper only. ?from=&to= (default: this month) */
export async function GET(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role;
  if (!user || !['admin', 'bookkeeper'].includes(role)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const period = parsePeriod(new URL(req.url).searchParams);
  if (period.error) return NextResponse.json({ error: period.error }, { status: 400 });
  const def = presetPeriods().thisMonth;
  const from = period.from || def.from;
  const to = period.to || def.to;

  const { data, error } = await supabase.rpc('cooperative_statement', { p_from: from, p_to: to });
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not build the statement' }, { status: 400 });

  const bytes = await buildCooperativeStatement(data);
  const safe = String(data.coop?.slug || 'cooperative').replace(/[^A-Za-z0-9_-]/g, '_');
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="statement-${safe}-${from}-to-${to}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
