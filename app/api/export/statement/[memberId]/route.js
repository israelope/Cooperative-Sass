import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Member statement. Staff may export any member of their cooperative; a member only their own (RLS decides). */
export async function GET(req, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: member } = await supabase.from('members').select('id, member_no, full_name').eq('id', params.memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: entries } = await supabase.from('passbook_entries')
    .select('entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq');

  const csv = toCsv([
    [`Statement for ${member.full_name} (${member.member_no})`],
    ['date', 'entry', 'amount', 'balance'],
    ...(entries || []).map((e) => [(e.entry_date || '').slice(0, 10), e.note || e.entry_type, e.entry_type === 'withdrawal' ? -e.amount : e.amount, e.running_balance]),
  ]);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="statement-${member.member_no}.csv"` } });
}
