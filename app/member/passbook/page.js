import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { requireMember } from '@/lib/auth';
import { must, mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Passbook' };

export default async function PassbookPage(props) {
  const searchParams = await props.searchParams;
  const { supabase, member } = await requireMember();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const [{ rows: entries, count: total }, txns] = await Promise.all([
    await mustWithCount(
      supabase
        .from('passbook_entries')
        .select('id, transaction_id, entry_date, entry_type, amount, running_balance, note', { count: 'exact' })
        .eq('member_id', member.id)
        .order('seq', { ascending: false })
        .range(range.from, range.to),
      'passbook entries',
    ),
    await must(
      supabase
        .from('transactions')
        .select('id, receipt_url')
        .eq('member_id', member.id)
        .not('receipt_url', 'is', null),
      'receipts',
    ),
  ]);
  const receipts = Object.fromEntries((txns || []).map((t) => [t.id, t.receipt_url]));

  return (
    <>
      <PageHeader title="Passbook" intro="Every entry, newest first. Entries are never edited: corrections appear as new lines." icon="book" helpKey="memberPassbook">
        <a href={`/api/statements/member/${member.id}`} className="btn-gold"><Icon name="download" size={16} /> Download PDF statement</a>
        <a href={`/api/export/statement/${member.id}`} className="btn-quiet"><Icon name="fileText" size={16} /> CSV</a>
      </PageHeader>
      <form method="get" action={`/api/statements/member/${member.id}`} className="mb-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="from" className="label">Statement from</label><input id="from" name="from" type="date" className="input" /></div>
        <div><label htmlFor="to" className="label">to</label><input id="to" name="to" type="date" className="input" /></div>
        <button className="btn-quiet"><Icon name="download" size={16} /> Download PDF for these dates</button>
      </form>
      <div className="passbook-page p-2">
        {(entries || []).length === 0 ? (
          <EmptyState compact icon="book" title="Nothing here yet" description="Your first contribution will appear here." />
        ) : (
          <DataTable caption="All passbook entries, newest first" scroll>
            <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Balance</th><th scope="col">Receipt</th></tr></thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td>{e.note || e.entry_type}</td>
                  <td className="text-right">{e.entry_type === 'withdrawal' ? '−' : ''}{naira(e.amount)}</td>
                  <td className="text-right font-semibold">{naira(e.running_balance)}</td>
                  <td>{receipts[e.transaction_id] && <a className="link inline-flex items-center gap-1 whitespace-nowrap" target="_blank" rel="noreferrer" href={`/api/receipt?path=${encodeURIComponent(receipts[e.transaction_id])}`}>View <Icon name="externalLink" size={13} /></a>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      <Pagination page={page} total={total} basePath="/member/passbook" />
    </>
  );
}
