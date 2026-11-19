import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import PayForm from '@/components/PayForm';
import { requireMember } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';
import { requestLoan } from '@/app/member/actions';

export const dynamic = 'force-dynamic';

export default async function MemberLoans() {
  const { supabase, member } = await requireMember();
  const [{ data: sum }, { data: loans }] = await Promise.all([
    supabase.rpc('member_summary', { p_member_id: member.id }),
    supabase.from('loans').select('id, principal, interest_rate, tenor_months, total_repayable, amount_repaid, status, created_at').eq('member_id', member.id).order('created_at', { ascending: false }),
  ]);
  const s = sum?.[0] || {};
  const active = member.status === 'active';

  return (
    <>
      <PageHeader title="Loans" intro="Your limit is your savings times your cooperative's multiplier, minus any loan you still owe." />
      <div className="panel mb-6 grid max-w-xl grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <div><p className="text-sm text-ink/60">Savings</p><p className="num font-display text-xl font-bold">{naira(s.savings)}</p></div>
        <div><p className="text-sm text-ink/60">Still owed</p><p className="num font-display text-xl font-bold">{naira(s.outstanding)}</p></div>
        <div><p className="text-sm text-ink/60">You can borrow</p><p className="num font-display text-xl font-bold text-ok-700">{naira(s.loan_limit)}</p></div>
      </div>

      <section className="panel mb-8 max-w-xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Request a loan</h2>
        <p className="mt-1 text-sm text-ink/70">The cooperative's admin reviews every request. If approved, the admin pays you directly; the platform does not send money.</p>
        <ActionForm action={requestLoan} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="amount" className="label">Amount (₦)</label><input id="amount" name="amount" type="number" step="0.01" min="1" max={s.loan_limit || undefined} required disabled={!active} className="input" /></div>
          <div><label htmlFor="tenor" className="label">Repay over (months)</label><input id="tenor" name="tenor" type="number" min="1" max="120" required disabled={!active} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton pendingText="Sending…">Send request</SubmitButton></div>
        </ActionForm>
      </section>

      {(loans || []).filter((l) => l.status === 'active').map((l) => {
        const owed = Math.round((Number(l.total_repayable) - Number(l.amount_repaid)) * 100) / 100;
        return (
          <section key={l.id} className="mb-8">
            <h2 className="mb-3 text-lg font-bold text-adire-900">Repay your loan online</h2>
            <PayForm disabled={!active} purpose="loan_repayment" loanId={l.id} maxAmount={owed} defaultAmount={owed} quick={false} buttonLabel="Pay loan with Paystack" />
          </section>
        );
      })}

      <h2 className="mb-3 text-lg font-bold text-adire-900">My loans</h2>
      <div className="panel p-2"><div className="table-wrap">
        <table className="tbl num">
          <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Months</th><th className="text-right">Total to repay</th><th className="text-right">Repaid</th><th>Status</th></tr></thead>
          <tbody>
            {(loans || []).map((l) => (
              <tr key={l.id}><td>{formatDate(l.created_at)}</td><td className="text-right">{naira(l.principal)}</td><td>{l.tenor_months}</td>
                <td className="text-right">{l.total_repayable ? naira(l.total_repayable) : ''}</td><td className="text-right">{naira(l.amount_repaid)}</td><td><StatusBadge status={l.status} /></td></tr>
            ))}
            {(loans || []).length === 0 && <tr><td colSpan={6} className="py-8 text-center text-ink/60">You have no loans yet.</td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
