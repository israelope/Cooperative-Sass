import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import Stat, { StatGrid } from '@/components/Stat';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import PayForm from '@/components/PayForm';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import LoanCalculator from '@/components/LoanCalculator';
import { requireMember } from '@/lib/auth';
import { must, mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';
import { requestLoan } from '@/app/member/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Loans' };

export default async function MemberLoans(props) {
  const searchParams = await props.searchParams;
  const { supabase, member, profile } = await requireMember();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const [sum, { rows: loans, count: total }, activeLoans, tenant] = await Promise.all([
    await must(supabase.rpc('member_summary', { p_member_id: member.id }), 'member summary'),
    await mustWithCount(
      supabase
        .from('loans')
        .select('id, principal, interest_rate, tenor_months, total_repayable, amount_repaid, status, created_at', { count: 'exact' })
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .range(range.from, range.to),
      'loans',
    ),
    // The pay forms stay visible even when an active loan is on another page.
    await must(
      supabase.from('loans').select('id, total_repayable, amount_repaid')
        .eq('member_id', member.id).eq('status', 'active'),
      'active loans',
    ),
    await must(
      supabase.from('tenants').select('default_interest_rate').eq('id', profile.tenant_id).single(),
      'loan settings',
    ),
  ]);
  const s = sum?.[0] || {};
  const active = member.status === 'active';

  return (
    <>
      <PageHeader title="Loans" intro="Your limit is your savings times your cooperative's multiplier, minus any loan you still owe." icon="bank" />

      <StatGrid cols="grid-cols-1 sm:grid-cols-3" className="mb-6">
        <Stat label="Savings" value={naira(s.savings)} icon="wallet" />
        <Stat label="Still owed" value={naira(s.outstanding)} icon="receipt" />
        <Stat label="You can borrow" value={naira(s.loan_limit)} tone="text-ok-700" icon="trendingUp" />
      </StatGrid>

      <LoanCalculator rate={tenant?.default_interest_rate} limit={s.loan_limit} />

      <section className="panel mb-8 max-w-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="bank" size={18} className="text-accent-500" /> Request a loan</h2>
        <p className="mt-1 text-sm text-ink/75">The cooperative&apos;s admin reviews every request. If approved, the admin pays you directly; the platform does not send money.</p>
        <ActionForm action={requestLoan} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="amount" className="label">Amount (₦)</label><input id="amount" name="amount" type="number" step="0.01" min="1" max={s.loan_limit || undefined} required disabled={!active} className="input" /></div>
          <div><label htmlFor="tenor" className="label">Repay over (months)</label><input id="tenor" name="tenor" type="number" min="1" max="120" required disabled={!active} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton pendingText="Sending…"><Icon name="plusCircle" size={16} /> Send request</SubmitButton></div>
        </ActionForm>
      </section>

      {(activeLoans || []).map((l) => {
        const owed = Math.round((Number(l.total_repayable) - Number(l.amount_repaid)) * 100) / 100;
        return (
          <section key={l.id} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="card" size={18} className="text-accent-500" /> Repay your loan online</h2>
            <PayForm disabled={!active} purpose="loan_repayment" loanId={l.id} maxAmount={owed} defaultAmount={owed} quick={false} buttonLabel="Pay loan with Paystack" />
          </section>
        );
      })}

      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="receipt" size={18} className="text-accent-500" /> My loans</h2>
      <div className="panel p-2">
        {(loans || []).length === 0 ? (
          <EmptyState compact icon="receipt" title="You have no loans yet" description="When you request a loan, its status and repayments will appear here." />
        ) : (
          <DataTable caption="Your loan requests and repayments" scroll>
            <thead><tr><th scope="col">Date</th><th scope="col" className="text-right">Amount</th><th scope="col">Months</th><th scope="col" className="text-right">Total to repay</th><th scope="col" className="text-right">Repaid</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {(loans || []).map((l) => (
                <tr key={l.id}><td>{formatDate(l.created_at)}</td><td className="text-right">{naira(l.principal)}</td><td>{l.tenor_months}</td>
                  <td className="text-right">{l.total_repayable ? naira(l.total_repayable) : ''}</td><td className="text-right">{naira(l.amount_repaid)}</td><td><StatusBadge status={l.status} /></td></tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination page={page} total={total} basePath="/member/loans" />
      </div>
    </>
  );
}
