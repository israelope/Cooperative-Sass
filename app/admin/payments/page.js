import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { requireStaff } from '@/lib/auth';
import { mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payments' };

const CHANNELS = ['all', 'online', 'cash', 'transfer'];
const STATUSES = ['all', 'success', 'pending', 'failed'];

export default async function PaymentsPage(props) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireStaff();
  const channel = CHANNELS.includes(searchParams.channel) ? searchParams.channel : 'all';
  const status = STATUSES.includes(searchParams.status) ? searchParams.status : 'all';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from || '') ? searchParams.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to || '') ? searchParams.to : '';
  const page = pageOf(searchParams.page);
  const range = pageRange(page);

  let q = supabase.from('transactions')
    .select('id, reference, amount, channel, purpose, status, receipt_url, note, created_at, paid_at, members(full_name, member_no)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (channel !== 'all') q = q.eq('channel', channel);
  if (status !== 'all') q = q.eq('status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10));
  const { rows: txns, count: total } = mustWithCount(await q.range(range.from, range.to), 'payments');
  const params = new URLSearchParams({ channel, status, from, to }).toString();

  return (
    <>
      <PageHeader title="Payments" intro="Online payments appear here automatically once Paystack confirms them." icon="receipt">
        <a href={`/api/export/payments?${params}`} className="btn-quiet"><Icon name="download" size={16} /> Export CSV</a>
        <a href="/admin/statements" className="btn-quiet"><Icon name="fileText" size={16} /> PDF statements</a>
        <Link href="/admin/payments/record" className="btn-gold"><Icon name="plusCircle" size={16} /> Record a payment</Link>
      </PageHeader>

      <form method="get" className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="page" value="1" />
        <div><label htmlFor="channel" className="label">Channel</label>
          <select id="channel" name="channel" defaultValue={channel} className="input">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">{STATUSES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-quiet"><Icon name="filter" size={16} /> Filter</button>
        {(channel !== 'all' || status !== 'all' || from || to) && (
          <Link href="/admin/payments" className="btn-quiet"><Icon name="close" size={16} /> Clear</Link>
        )}
      </form>

      <div className="panel p-2">
        {txns.length === 0 ? (
          <EmptyState
            compact
            icon="receipt"
            title="No payments match"
            description="Try changing your filters, or record a payment manually."
            action={<Link href="/admin/payments/record" className="btn-primary btn-sm"><Icon name="plusCircle" size={16} /> Record a payment</Link>}
          />
        ) : (
          <>
            <DataTable caption="Payments, newest first" scroll>
              <thead><tr>
                <th scope="col">Date</th><th scope="col">Member</th><th scope="col" className="text-right">Amount</th>
                <th scope="col">For</th><th scope="col">Channel</th><th scope="col">Status</th><th scope="col">Reference</th><th scope="col">Receipt</th>
              </tr></thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.paid_at || t.created_at)}</td>
                    <td>{t.members?.full_name}<span className="block text-xs text-ink/75">{t.members?.member_no}</span></td>
                    <td className="text-right">{naira(t.amount)}</td>
                    <td>{t.purpose === 'loan_repayment' ? 'Loan repayment' : 'Contribution'}</td>
                    <td className="capitalize">{t.channel}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="font-mono text-xs">{t.reference}</td>
                    <td>{t.receipt_url ? (
                      <a className="link whitespace-nowrap" href={`/api/receipt?path=${encodeURIComponent(t.receipt_url)}`} target="_blank" rel="noreferrer">
                        <Icon name="eye" size={14} /> View
                      </a>
                    ) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={page} total={total} basePath="/admin/payments" params={{ channel, status, from, to }} />
          </>
        )}
      </div>
    </>
  );
}
