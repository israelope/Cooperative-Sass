import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { requireStaff } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';
import { resolveReconciliation } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';

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

export default async function ReconciliationPage() {
  const { supabase } = await requireStaff();
  const [{ data: sum }, { data: open }, { data: recent }] = await Promise.all([
    supabase.rpc('reconciliation_summary'),
    supabase.from('reconciliation_results').select(SELECT).in('status', ['NEEDS_REVIEW', 'UNRESOLVED']).order('received_at', { ascending: true }).limit(100),
    supabase.from('reconciliation_results').select(SELECT).order('received_at', { ascending: false }).limit(30),
  ]);
  const s = sum || {};
  const by = s.by_status || {};

  return (
    <>
      <PageHeader title="Reconciliation" intro="Every online payment is checked against what Paystack reports. Anything that needs a human decision appears here." />

      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[['Checked', s.total ?? 0], ['Matched', by.AUTO_MATCHED ?? 0], ['Auto-resolved', by.AUTO_RESOLVED ?? 0], ['Awaiting settlement', by.AWAITING_SETTLEMENT ?? 0], ['Needs review', by.NEEDS_REVIEW ?? 0], ['Unresolved', by.UNRESOLVED ?? 0]].map(([l, v]) => (
          <div key={l} className="px-5 py-4"><p className="text-sm text-ink/60">{l}</p><p className="num mt-1 font-display text-2xl font-bold text-adire-900">{v}</p></div>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink/70">Automation rate: <span className="num font-semibold">{s.automation_rate == null ? 'n/a' : `${s.automation_rate}%`}</span> of payments needed no human action.</p>

      <h2 className="mb-3 mt-8 text-lg font-bold text-adire-900">Needs your decision</h2>
      {(open || []).length === 0 ? (
        <p className="panel p-5 text-sm text-ink/70">Nothing needs review right now.</p>
      ) : (
        <div className="space-y-4">
          {open.map((r) => (
            <div key={r.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.transactions?.members?.full_name} <span className="text-ink/50">({r.transactions?.members?.member_no})</span></p>
                  <p className="font-mono text-xs text-ink/60">{r.transactions?.reference} · {r.transactions?.purpose === 'loan_repayment' ? 'Loan repayment' : 'Contribution'}</p>
                </div>
                <div className="text-right"><Status s={r.status} /><p className="mt-1 text-sm">{r.detected_fault ? FAULT[r.detected_fault] : 'Amount or currency differs'}</p></div>
              </div>
              <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-ink/60">Expected</dt><dd>{naira(r.expected_amount)}</dd></div>
                <div><dt className="text-ink/60">Received</dt><dd>{r.received_amount == null ? '—' : naira(r.received_amount)}</dd></div>
                <div><dt className="text-ink/60">Expected share</dt><dd>{r.expected_share == null ? '—' : naira(r.expected_share)}</dd></div>
                <div><dt className="text-ink/60">Reported share</dt><dd>{r.received_share == null ? '—' : naira(r.received_share)}</dd></div>
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
                <SubmitButton className="btn-primary btn-sm">Record decision</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold text-adire-900">Recent reconciliations</h2>
      <div className="panel p-2"><div className="table-wrap">
        <table className="tbl num">
          <thead><tr><th>Received</th><th>Member</th><th className="text-right">Amount</th><th>Status</th><th>Finding</th><th>Final</th></tr></thead>
          <tbody>
            {(recent || []).map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.received_at)}</td>
                <td>{r.transactions?.members?.full_name}</td>
                <td className="text-right">{naira(r.expected_amount)}</td>
                <td><Status s={r.status} /></td>
                <td>{r.detected_fault ? FAULT[r.detected_fault] : r.flagged_mismatch ? 'Amount or currency' : ''}</td>
                <td>{r.reconciled_at ? formatDate(r.reconciled_at) : ''}</td>
              </tr>
            ))}
            {(recent || []).length === 0 && <tr><td colSpan={6} className="py-8 text-center text-ink/60">No online payments have been reconciled yet.</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
