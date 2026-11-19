import PageHeader from '@/components/PageHeader';
import { requireMember } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PassbookPage() {
  const { supabase, member } = await requireMember();
  const [{ data: entries }, { data: txns }] = await Promise.all([
    supabase.from('passbook_entries').select('id, transaction_id, entry_date, entry_type, amount, running_balance, note').eq('member_id', member.id).order('seq', { ascending: false }).limit(500),
    supabase.from('transactions').select('id, receipt_url').eq('member_id', member.id).not('receipt_url', 'is', null),
  ]);
  const receipts = Object.fromEntries((txns || []).map((t) => [t.id, t.receipt_url]));

  return (
    <>
      <PageHeader title="Passbook" intro="Every entry, newest first. Entries are never edited: corrections appear as new lines.">
        <a href={`/api/statements/member/${member.id}`} className="btn-gold">Download PDF statement</a>
        <a href={`/api/export/statement/${member.id}`} className="btn-quiet">CSV</a>
      </PageHeader>
      <form method="get" action={`/api/statements/member/${member.id}`} className="mb-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="from" className="label">Statement from</label><input id="from" name="from" type="date" className="input" /></div>
        <div><label htmlFor="to" className="label">to</label><input id="to" name="to" type="date" className="input" /></div>
        <button className="btn-quiet">Download PDF for these dates</button>
      </form>
      <div className="passbook-page p-2">
        <div className="table-wrap">
          <table className="tbl num">
            <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Receipt</th></tr></thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td>{e.note || e.entry_type}</td>
                  <td className="text-right">{e.entry_type === 'withdrawal' ? '−' : ''}{naira(e.amount)}</td>
                  <td className="text-right font-semibold">{naira(e.running_balance)}</td>
                  <td>{receipts[e.transaction_id] && <a className="font-semibold text-adire-700 underline" target="_blank" rel="noreferrer" href={`/api/receipt?path=${encodeURIComponent(receipts[e.transaction_id])}`}>View</a>}</td>
                </tr>
              ))}
              {(entries || []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ink/60">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
