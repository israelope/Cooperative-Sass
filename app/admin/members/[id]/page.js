import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Stat, { StatGrid } from '@/components/Stat';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { requireStaff } from '@/lib/auth';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Member details' };

export default async function MemberDetail({ params }) {
  const { supabase } = await requireStaff();
  const member = must(await supabase.from('members').select('*').eq('id', params.id).maybeSingle(), 'member');
  if (!member) notFound();
  const [sum, entries, loans] = await Promise.all([
    must(supabase.rpc('member_summary', { p_member_id: member.id }), 'member summary'),
    must(supabase.from('passbook_entries').select('id, entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq', { ascending: false }).limit(200), 'passbook entries'),
    must(supabase.from('loans').select('id, principal, total_repayable, amount_repaid, status, created_at').eq('member_id', member.id).order('created_at', { ascending: false }), 'member loans'),
  ]);
  const s = sum?.[0] || {};

  return (
    <>
      <PageHeader title={member.full_name} intro={`Member ${member.member_no}${member.phone ? ` · ${member.phone}` : ''}`}>
        <Link href="/admin/members" className="btn-quiet"><Icon name="arrowRight" size={16} className="rotate-180" /> Back</Link>
        <a href={`/api/statements/member/${member.id}`} className="btn-gold"><Icon name="download" size={16} /> PDF statement</a>
        <a href={`/api/export/statement/${member.id}`} className="btn-quiet"><Icon name="download" size={16} /> CSV</a>
      </PageHeader>

      <StatGrid cols="grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={<StatusBadge status={member.status} />} icon="info" />
        <Stat label="Savings" value={naira(s.savings)} icon="wallet" />
        <Stat label="Loan outstanding" value={naira(s.outstanding)} icon="bank" />
        <Stat label="Eligible loan limit" value={naira(s.loan_limit)} tone="text-ok-700" icon="checkCircle" />
      </StatGrid>

      {member.claim_code && (
        <div className="callout-info mt-5">
          <Icon name="ticket" size={17} className="mt-0.5" />
          <span>Claim code (not yet used): <span className="font-mono font-semibold">{member.claim_code}</span></span>
        </div>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="book" size={18} className="text-adire-500" /> Passbook</h2>
      <div className="passbook-page p-2">
        {(entries || []).length === 0 ? (
          <EmptyState compact icon="book" title="No entries yet" />
        ) : (
          <DataTable caption={`Passbook entries for ${member.full_name}`}>
            <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Balance</th></tr></thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td>{e.note || e.entry_type}</td>
                  <td className="text-right">{e.entry_type === 'withdrawal' ? '−' : ''}{naira(e.amount)}</td>
                  <td className="text-right font-semibold">{naira(e.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      {(loans || []).length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="bank" size={18} className="text-adire-500" /> Loans</h2>
          <div className="panel p-2">
            <DataTable caption={`Loans for ${member.full_name}`}>
              <thead><tr><th scope="col">Date</th><th scope="col" className="text-right">Principal</th><th scope="col" className="text-right">Total to repay</th><th scope="col" className="text-right">Repaid</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.created_at)}</td>
                    <td className="text-right">{naira(l.principal)}</td>
                    <td className="text-right">{l.total_repayable ? naira(l.total_repayable) : ''}</td>
                    <td className="text-right">{naira(l.amount_repaid)}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </>
      )}
    </>
  );
}
