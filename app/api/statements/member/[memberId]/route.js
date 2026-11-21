import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePeriod, splitStatement } from '@/lib/statement';
import { buildMemberStatement } from '@/lib/pdf/statements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF statement for one member. Row-Level Security decides who may call this:
 * a member gets only their own, staff get any member of their own cooperative.
 * Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req, props) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const period = parsePeriod(new URL(req.url).searchParams);
  if (period.error) return NextResponse.json({ error: period.error }, { status: 400 });

  const { data: member } = await supabase.from('members').select('id, tenant_id, member_no, full_name, status').eq('id', params.memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: tenant }, { data: sum }, { data: entries }, { data: loans }] = await Promise.all([
    supabase.from('tenants').select('name').eq('id', member.tenant_id).maybeSingle(),
    supabase.rpc('member_summary', { p_member_id: member.id }),
    supabase.from('passbook_entries').select('entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq').limit(20000),
    supabase.from('loans').select('created_at, principal, total_repayable, amount_repaid, status').eq('member_id', member.id).in('status', ['approved', 'active', 'repaid']).order('created_at', { ascending: false }).limit(50),
  ]);

  const split = splitStatement(entries || [], period.from, period.to);
  const bytes = await buildMemberStatement({
    coopName: tenant?.name || 'Cooperative', member, summary: sum?.[0] || {}, period, loans: loans || [], ...split,
  });
  const safe = String(member.member_no).replace(/[^A-Za-z0-9_-]/g, '_');
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="statement-${safe}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
