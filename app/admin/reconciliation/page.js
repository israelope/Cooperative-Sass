import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import Stat, { StatGrid } from '@/components/Stat';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { requireStaff } from '@/lib/auth';
import { must, mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';
import { resolveReconciliation } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reconciliation' };

const FAULT = {
  partial_payment: 'Partial payment', duplicate_webhook: 'Duplicate webhook', delayed_settlement: 'Delayed settlement',
  failed_leg: 'Failed leg', rounding_diff: 'Rounding difference', out_of_order: 'Out-of-order notification',
};
const STATUS_CLASS = {
  AUTO_MATCHED: 'badge-ok', AUTO_RESOLVED: 'badge-ok', RESOLVED_MANUALLY: 'badge-ok',
  AWAITING_SETTLEMENT: 'badge-warn', NEEDS_REVIEW: 'badge-bad', UNRESOLVED: 'badge-bad',
};
const Status = ({ s }) => <span className={STATUS_CLASS[s] || 'badge-info'}>{s}</span>;
const SELECT = 'id, status, detected_fault, flagged_mismatch, expected_amount, received_amount, expected_share, received_share, received_at, reconciled_at, resolution_note, transactions(reference, purpose, members(full_name, member_no))';

export default async function ReconciliationPage(props) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireStaff();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const [sum, open, { rows: recent, count: total }] = await Promise.all([
    must(supabase.rpc('reconciliation_summary'), 'reconciliation summary'),
    must(supabase.from('reconciliation_results').select(SELECT).in('status', ['NEEDS_REVIEW', 'UNRESOLVED']).order('received_at', { ascending: true }).limit(100), 'cases needing review'),
    mustWithCount(supabase.from('reconciliation_results').select(SELECT, { count: 'exact' }).order('received_at', { ascending: false }).range(range.from, range.to), 'recent reconciliations'),
  ]);
  const s = sum || {};
  const by = s.by_status || {};

  return (
    <>
      <PageHeader title="Reconciliation" intro="Every online payment is checked against what Paystack reports. Anything that needs a human decision appears here." icon="refresh" />

      <StatGrid cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Checked" value={s.total ?? 0} icon="dashboard" />
        <Stat label="Matched" value={by.AUTO_MATCHED ?? 0} icon="check" tone="text-ok-700" />
        <Stat label="Auto-resolved" value={by.AUTO_RESOLVED ?? 0} icon="checkCircle" tone="text-ok-700" />
        <Stat label="Awaiting settlement" value={by.AWAITING_SETTLEMENT ?? 0} icon="clock" tone="text-marigold-700" />
        <Stat label="Needs review" value={by.NEEDS_REVIEW ?? 0} icon="alertTriangle" tone="text-bad-700" />
        <Stat label="Unresolved" value={by.UNRESOLVED ?? 0} icon="xCircle" tone="text-bad-700" />
      </StatGrid>
      <p className="mt-2 text-sm text-ink/75">Automation rate: <span className="num font-semibold">{s.automation_rate == null ? 'n/a' : `${s.automation_rate}%`}</span> of payments needed no human action.</p>

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="alertTriangle" size={18} className="text-accent-500" /> Needs your decision</h2>
      {(open || []).length === 0 ? (
        <div className="panel p-2">
          <EmptyState compact icon="checkCircle" title="All caught up" description="Nothing needs review right now." />
        </div>
      ) : (
        <div className="space-y-4">
          {open.map((r) => (
            <div key={r.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.transactions?.members?.full_name} <span className="text-ink/75">({r.transactions?.members?.member_no})</span></p>
                  <p className="font-mono text-xs text-ink/75">{r.transactions?.reference} · {r.transactions?.purpose === 'loan_repayment' ? 'Loan repayment' : 'Contribution'}</p>
                </div>
                <div className="text-right"><Status s={r.status} /><p className="mt-1 text-sm">{r.detected_fault ? FAULT[r.detected_fault] : 'Amount or currency differs'}</p></div>
              </div>
              <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-ink/75">Expected</dt><dd>{naira(r.expected_amount)}</dd></div>
                <div><dt className="text-ink/75">Received</dt><dd>{r.received_amount == null ? '—' : naira(r.received_amount)}</dd></div>
                <div><dt className="text-ink/75">Expected share</dt><dd>{r.expected_share == null ? '—' : naira(r.expected_share)}</dd></div>
                <div><dt className="text-ink/75">Reported share</dt><dd>{r.received_share == null ? '—' : naira(r.received_share)}</dd></div>
              </dl>
              <ActionForm action={resolveReconciliation} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-[14rem_1fr_auto]">
                <input type="hidden" name="id" value={r.id} />
                <div>
                  <label htmlFor={`a-${r.id}`} className="sr-only">Decision</label>
                  <select id={`a-${r.id}`} name="action" className="input" defaultValue="acknowledge">
                    <option value="acknowledge">Acknowledge (already dealt with)</option>
                    <option value="accept_received">Accept the amount received</option>
                    <option value="mark_failed">Mark the payment failed</option>
                  </select>
                </div>
                <div><label htmlFor={`n-${r.id}`} className="sr-only">Note</label><input id={`n-${r.id}`} name="note" required minLength={3} className="input" placeholder="Short note explaining your decision" /></div>
                <SubmitButton className="btn-primary btn-sm"><Icon name="check" size={14} /> Record decision</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="refresh" size={18} className="text-accent-500" /> Recent reconciliations</h2>
      <div className="panel p-2">
        {(recent || []).length === 0 ? (
          <EmptyState compact icon="refresh" title="No reconciliations yet" description="Online payments will appear here once they have been checked." />
        ) : (
          <>
            <DataTable caption="The most recent payment reconciliations" scroll>
              <thead><tr>
                <th scope="col">Received</th><th scope="col">Member</th><th scope="col" className="text-right">Amount</th>
                <th scope="col">Status</th><th scope="col">Finding</th><th scope="col">Final</th>
              </tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.received_at)}</td>
                    <td>{r.transactions?.members?.full_name}</td>
                    <td className="text-right">{naira(r.expected_amount)}</td>
                    <td><Status s={r.status} /></td>
                    <td>{r.detected_fault ? FAULT[r.detected_fault] : r.flagged_mismatch ? 'Amount or currency' : ''}</td>
                    <td>{r.reconciled_at ? formatDate(r.reconciled_at) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={page} total={total} basePath="/admin/reconciliation" />
          </>
        )}
      </div>
    </>
  );
}
