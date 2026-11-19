import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { requireStaff } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
const CHANNELS = ['all', 'online', 'cash', 'transfer'];
const STATUSES = ['all', 'success', 'pending', 'failed'];

export default async function PaymentsPage({ searchParams }) {
  const { supabase } = await requireStaff();
  const channel = CHANNELS.includes(searchParams.channel) ? searchParams.channel : 'all';
  const status = STATUSES.includes(searchParams.status) ? searchParams.status : 'all';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from || '') ? searchParams.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to || '') ? searchParams.to : '';

  let q = supabase.from('transactions')
    .select('id, reference, amount, channel, purpose, status, receipt_url, note, created_at, paid_at, members(full_name, member_no)')
    .order('created_at', { ascending: false }).limit(200);
  if (channel !== 'all') q = q.eq('channel', channel);
  if (status !== 'all') q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10));
  const { data: txns } = await q;
  const params = new URLSearchParams({ channel, status, from, to }).toString();

  return (
    <>
      <PageHeader title="Payments" intro="Online payments appear here automatically once Paystack confirms them.">
        <a href={`/api/export/payments?${params}`} className="btn-quiet">Export CSV</a>
        <a href="/admin/statements" className="btn-quiet">PDF statements</a>
        <Link href="/admin/payments/record" className="btn-gold">Record a payment</Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="channel" className="label">Channel</label>
          <select id="channel" name="channel" defaultValue={channel} className="input">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">{STATUSES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-quiet">Filter</button>
      </form>

      <div className="panel p-2"><div className="table-wrap">
        <table className="tbl num">
          <thead><tr><th>Date</th><th>Member</th><th className="text-right">Amount</th><th>For</th><th>Channel</th><th>Status</th><th>Reference</th><th>Receipt</th></tr></thead>
          <tbody>
            {(txns || []).map((t) => (
              <tr key={t.id}>
                <td>{formatDate(t.paid_at || t.created_at)}</td>
                <td>{t.members?.full_name}<span className="block text-xs text-ink/50">{t.members?.member_no}</span></td>
                <td className="text-right">{naira(t.amount)}</td>
                <td>{t.purpose === 'loan_repayment' ? 'Loan repayment' : 'Contribution'}</td>
                <td className="capitalize">{t.channel}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="font-mono text-xs">{t.reference}</td>
                <td>{t.receipt_url ? <a className="font-semibold text-adire-700 underline" href={`/api/receipt?path=${encodeURIComponent(t.receipt_url)}`} target="_blank" rel="noreferrer">View</a> : ''}</td>
              </tr>
            ))}
            {(txns || []).length === 0 && <tr><td colSpan={8} className="py-8 text-center text-ink/60">No payments match these filters.</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
