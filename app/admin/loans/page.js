import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { requireStaff } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';
import { decideLoan, activateLoan, recordRepayment } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';

function Section({ title, hint, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-adire-900">{title}</h2>
      {hint && <p className="mb-2 text-sm text-ink/70">{hint}</p>}
      <div className="panel mt-2 p-2"><div className="table-wrap">{children}</div></div>
    </section>
  );
}
const who = (l) => (<>{l.members?.full_name}<span className="block text-xs text-ink/50">{l.members?.member_no}</span></>);

export default async function LoansPage() {
  const { supabase, profile } = await requireStaff();
  const isAdmin = profile.role === 'admin';
  const [{ data: loans }, { data: tenant }] = await Promise.all([
    supabase.from('loans').select('id, principal, interest_rate, tenor_months, total_repayable, amount_repaid, status, created_at, members(full_name, member_no)').order('created_at', { ascending: false }).limit(300),
    supabase.from('tenants').select('default_interest_rate').eq('id', profile.tenant_id).single(),
  ]);
  const by = (st) => (loans || []).filter((l) => l.status === st);
  const requested = by('requested'), approved = by('approved'), active = by('active');
  const history = (loans || []).filter((l) => ['repaid', 'rejected'].includes(l.status));

  return (
    <>
      <PageHeader title="Loans" intro="The platform tracks loans but never moves money. After approving, transfer the funds yourself, then mark the loan as paid out." />

      <Section title="Waiting for a decision" hint={isAdmin ? 'Set the yearly interest rate, then approve or reject.' : 'Only the cooperative admin can approve loans.'}>
        <table className="tbl num">
          <thead><tr><th>Member</th><th className="text-right">Amount</th><th>Months</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            {requested.map((l) => (
              <tr key={l.id}>
                <td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td>{l.tenor_months}</td><td>{formatDate(l.created_at)}</td>
                <td>{isAdmin && (
                  <ActionForm action={decideLoan} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="loanId" value={l.id} />
                    <label className="sr-only" htmlFor={`i-${l.id}`}>Interest % per year</label>
                    <input id={`i-${l.id}`} name="interest" type="number" step="0.01" min="0" max="100" defaultValue={tenant?.default_interest_rate ?? 5} className="input w-24" />
                    <span className="text-xs text-ink/60">% a year</span>
                    <SubmitButton name="decision" value="approve" className="btn-primary btn-sm">Approve</SubmitButton>
                    <SubmitButton name="decision" value="reject" className="btn-danger btn-sm">Reject</SubmitButton>
                  </ActionForm>
                )}</td>
              </tr>
            ))}
            {requested.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-ink/60">No requests waiting.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="Approved, not yet paid out" hint="Transfer the money to the member's bank account, then confirm here.">
        <table className="tbl num">
          <thead><tr><th>Member</th><th className="text-right">Amount</th><th className="text-right">Total to repay</th><th></th></tr></thead>
          <tbody>
            {approved.map((l) => (
              <tr key={l.id}><td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td className="text-right">{naira(l.total_repayable)}</td>
                <td>{isAdmin && <ActionForm action={activateLoan}><input type="hidden" name="loanId" value={l.id} /><SubmitButton className="btn-gold btn-sm">I have paid this out</SubmitButton></ActionForm>}</td></tr>
            ))}
            {approved.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink/60">Nothing to pay out.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="Active loans" hint="Record each repayment when you receive it.">
        <table className="tbl num">
          <thead><tr><th>Member</th><th className="text-right">Total to repay</th><th className="text-right">Repaid</th><th className="text-right">Outstanding</th><th>Record repayment</th></tr></thead>
          <tbody>
            {active.map((l) => (
              <tr key={l.id}>
                <td>{who(l)}</td><td className="text-right">{naira(l.total_repayable)}</td><td className="text-right">{naira(l.amount_repaid)}</td>
                <td className="text-right font-semibold">{naira(Number(l.total_repayable) - Number(l.amount_repaid))}</td>
                <td>
                  <ActionForm action={recordRepayment} resetOnSuccess className="flex items-center gap-2">
                    <input type="hidden" name="loanId" value={l.id} />
                    <label className="sr-only" htmlFor={`r-${l.id}`}>Repayment amount</label>
                    <input id={`r-${l.id}`} name="amount" type="number" step="0.01" min="1" required className="input w-32" placeholder="₦" />
                    <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {active.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-ink/60">No active loans.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="History">
        <table className="tbl num">
          <thead><tr><th>Member</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {history.map((l) => (<tr key={l.id}><td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td><StatusBadge status={l.status} /></td><td>{formatDate(l.created_at)}</td></tr>))}
            {history.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink/60">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </Section>
    </>
  );
}
