import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { requireStaff } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function MemberDetail({ params }) {
  const { supabase } = await requireStaff();
  const { data: member } = await supabase.from('members').select('*').eq('id', params.id).maybeSingle();
  if (!member) notFound();
  const [{ data: sum }, { data: entries }, { data: loans }] = await Promise.all([
    supabase.rpc('member_summary', { p_member_id: member.id }),
    supabase.from('passbook_entries').select('id, entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq', { ascending: false }).limit(200),
    supabase.from('loans').select('id, principal, total_repayable, amount_repaid, status, created_at').eq('member_id', member.id).order('created_at', { ascending: false }),
  ]);
  const s = sum?.[0] || {};

  return (
    <>
      <PageHeader title={member.full_name} intro={`Member ${member.member_no}${member.phone ? ' · ' + member.phone : ''}`}>
        <Link href="/admin/members" className="btn-quiet">Back to members</Link>
        <a href={`/api/statements/member/${member.id}`} className="btn-gold">PDF statement</a>
        <a href={`/api/export/statement/${member.id}`} className="btn-quiet">CSV</a>
      </PageHeader>

      <div className="panel grid grid-cols-2 sm:grid-cols-4">
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Status</p><p className="mt-1"><StatusBadge status={member.status} /></p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Savings</p><p className="num mt-1 font-display text-xl font-bold text-adire-900">{naira(s.savings)}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Loan outstanding</p><p className="num mt-1 font-display text-xl font-bold">{naira(s.outstanding)}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Eligible loan limit</p><p className="num mt-1 font-display text-xl font-bold text-ok-700">{naira(s.loan_limit)}</p></div>
      </div>
      {member.claim_code && <p className="mt-4 rounded-lg bg-adire-50 px-4 py-3 text-sm">Claim code (not yet used): <span className="font-mono font-semibold">{member.claim_code}</span></p>}

      <h2 className="mb-3 mt-8 text-lg font-bold text-adire-900">Passbook</h2>
      <div className="passbook-page p-2">
        <div className="table-wrap">
          <table className="tbl num">
            <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td>{e.note || e.entry_type}</td>
                  <td className="text-right">{e.entry_type === 'withdrawal' ? '−' : ''}{naira(e.amount)}</td>
                  <td className="text-right font-semibold">{naira(e.running_balance)}</td>
                </tr>
              ))}
              {(entries || []).length === 0 && <tr><td colSpan={4} className="py-8 text-center text-ink/60">No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(loans || []).length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold text-adire-900">Loans</h2>
          <div className="panel p-2"><div className="table-wrap">
            <table className="tbl num">
              <thead><tr><th>Date</th><th className="text-right">Principal</th><th className="text-right">Total to repay</th><th className="text-right">Repaid</th><th>Status</th></tr></thead>
              <tbody>{loans.map((l) => (
                <tr key={l.id}><td>{formatDate(l.created_at)}</td><td className="text-right">{naira(l.principal)}</td><td className="text-right">{l.total_repayable ? naira(l.total_repayable) : ''}</td><td className="text-right">{naira(l.amount_repaid)}</td><td><StatusBadge status={l.status} /></td></tr>
              ))}</tbody>
            </table>
          </div></div>
        </>
      )}
    </>
  );
}
