import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { requireMember } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function MemberHome() {
  const { supabase, member, profile } = await requireMember();
  const [{ data: sum }, { data: entries }] = await Promise.all([
    supabase.rpc('member_summary', { p_member_id: member.id }),
    supabase.from('passbook_entries').select('id, entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq', { ascending: false }).limit(5),
  ]);
  const s = sum?.[0] || {};
  const active = member.status === 'active';

  return (
    <>
      <PageHeader title={`Hello, ${member.full_name.split(' ')[0]}`} intro={`${profile.tenants?.name} · Member ${member.member_no}`}>
        {active && <Link href="/member/pay" className="btn-gold">Pay contribution</Link>}
        {active && <Link href="/member/loans" className="btn-quiet">Request a loan</Link>}
      </PageHeader>

      <div className="passbook-page p-6 pl-14">
        <p className="text-sm text-ink/60">Your savings</p>
        <p className="num font-display text-5xl font-extrabold text-adire-900">{naira(s.savings)}</p>
        <dl className="mt-5 grid max-w-xl grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <dt className="text-ink/60">You can borrow up to</dt><dd className="num text-right font-semibold text-ok-700">{naira(s.loan_limit)}</dd>
          <dt className="text-ink/60">Loan still owed</dt><dd className="num text-right font-semibold">{naira(s.outstanding)}</dd>
          <dt className="text-ink/60">Loan limit rule</dt><dd className="num text-right">{s.multiplier ?? 0} × savings</dd>
        </dl>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-adire-900">Latest entries</h2>
      <div className="panel p-2"><div className="table-wrap">
        <table className="tbl num">
          <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {(entries || []).map((e) => (
              <tr key={e.id}><td>{formatDate(e.entry_date)}</td><td>{e.note || e.entry_type}</td><td className="text-right">{naira(e.amount)}</td><td className="text-right font-semibold">{naira(e.running_balance)}</td></tr>
            ))}
            {(entries || []).length === 0 && <tr><td colSpan={4} className="py-8 text-center text-ink/60">No entries yet. Your first contribution will show up here.</td></tr>}
          </tbody>
        </table>
      </div></div>
      <p className="mt-3 text-sm"><Link href="/member/passbook" className="font-semibold text-adire-700 underline">See the full passbook</Link></p>
    </>
  );
}
