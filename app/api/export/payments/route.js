import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/format';
import { isValidDate } from '@/lib/statement';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  // The profile is authoritative; a stale JWT must not keep staff powers.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = profile?.role || user.app_metadata?.role;
  if (!['admin', 'bookkeeper'].includes(role)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  let q = supabase.from('transactions')
    .select('reference, amount, channel, purpose, status, note, created_at, paid_at, members(member_no, full_name)')
    .order('created_at', { ascending: false }).limit(5000);
  const channel = sp.get('channel'), status = sp.get('status'), from = sp.get('from'), to = sp.get('to');
  if (['online', 'cash', 'transfer'].includes(channel)) q = q.eq('channel', channel);
  if (['success', 'pending', 'failed'].includes(status)) q = q.eq('status', status);
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    return NextResponse.json({ error: 'Dates must be real dates like 2026-01-31.' }, { status: 400 });
  }
  if (from && to && to < from) return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 });
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10));
  const { data } = await q;

  const csv = toCsv([
    ['date', 'member_no', 'member', 'amount', 'for', 'channel', 'status', 'reference', 'note'],
    ...(data || []).map((t) => [(t.paid_at || t.created_at || '').slice(0, 10), t.members?.member_no, t.members?.full_name, t.amount, t.purpose, t.channel, t.status, t.reference, t.note]),
  ]);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="payments.csv"' } });
}
