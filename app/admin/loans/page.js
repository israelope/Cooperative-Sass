import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { requireStaff } from '@/lib/auth';
import { must, mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';
import { decideLoan, activateLoan, recordRepayment } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Loans' };

function Section({ title, icon, hint, rows, emptyTitle, emptyDescription, caption, note, scroll = false, pagination, children }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 mt-8 flex items-center gap-2 text-lg font-bold text-accent-900">
        <Icon name={icon} size={18} className="text-accent-500" /> {title}
      </h2>
      {hint && <p className="mb-2 text-sm text-ink/75">{hint}</p>}
      <div className="panel p-2">
        {rows.length === 0 ? (
          <EmptyState compact icon={icon} title={emptyTitle} description={emptyDescription} />
        ) : (
          <DataTable caption={caption} scroll={scroll}>{children}</DataTable>
        )}
        {note && <p className="px-3 py-2 text-xs text-ink/75">{note}</p>}
        {pagination}
      </div>
    </section>
  );
}

const who = (l) => (<>{l.members?.full_name}<span className="block text-xs text-ink/75">{l.members?.member_no}</span></>);

const LOAN_SELECT = 'id, principal, interest_rate, tenor_months, total_repayable, amount_repaid, status, created_at, members(full_name, member_no)';

export default async function LoansPage(props) {
  const searchParams = await props.searchParams;
  const { supabase, profile } = await requireStaff();
  const isAdmin = profile.role === 'admin';
  // Each queue has its own page number so acting on one list does not reset another.
  const requestedPage = pageOf(searchParams.requestedPage);
  const approvedPage = pageOf(searchParams.approvedPage);
  const activePage = pageOf(searchParams.activePage);
  const page = pageOf(searchParams.page);
  const req = pageRange(requestedPage), appr = pageRange(approvedPage);
  const act = pageRange(activePage), hist = pageRange(page);
  const [tenant, requestedRes, approvedRes, activeRes, historyRes] = await Promise.all([
    await must(supabase.from('tenants').select('default_interest_rate').eq('id', profile.tenant_id).single(), 'loan settings'),
    await mustWithCount(supabase.from('loans').select(LOAN_SELECT, { count: 'exact' })
      .eq('status', 'requested').order('created_at', { ascending: false })
      .range(req.from, req.to), 'loan requests'),
    await mustWithCount(supabase.from('loans').select(LOAN_SELECT, { count: 'exact' })
      .eq('status', 'approved').order('created_at', { ascending: false })
      .range(appr.from, appr.to), 'approved loans'),
    await mustWithCount(supabase.from('loans').select(LOAN_SELECT, { count: 'exact' })
      .eq('status', 'active').order('created_at', { ascending: false })
      .range(act.from, act.to), 'active loans'),
    await mustWithCount(supabase.from('loans').select(LOAN_SELECT, { count: 'exact' })
      .in('status', ['repaid', 'rejected']).order('created_at', { ascending: false })
      .range(hist.from, hist.to), 'loan history'),
  ]);
  const requested = requestedRes.rows, approved = approvedRes.rows, active = activeRes.rows;
  const { rows: history, count: total } = historyRes;

  return (
    <>
      <PageHeader title="Loans" intro="The platform tracks loans but never moves money. After approving, transfer the funds yourself, then mark the loan as paid out." icon="bank" />

      <Section
        title="Waiting for a decision"
        icon="clock"
        hint={isAdmin ? 'Set the yearly interest rate, then approve or reject.' : 'Only the cooperative admin can approve loans.'}
        rows={requested}
        emptyTitle="No requests waiting"
        emptyDescription="New loan requests will appear here."
        caption="Loan requests awaiting a decision"
        pagination={<Pagination page={requestedPage} total={requestedRes.count} basePath="/admin/loans" paramName="requestedPage" />}
      >
        <thead><tr>
          <th scope="col">Member</th><th scope="col" className="text-right">Amount</th><th scope="col">Months</th>
          <th scope="col">Requested</th><th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {requested.map((l) => (
            <tr key={l.id}>
              <td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td>{l.tenor_months}</td><td>{formatDate(l.created_at)}</td>
              <td>{isAdmin && (
                <ActionForm action={decideLoan} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="loanId" value={l.id} />
                  {/* ActionForm's submit buttons overwrite this value on click; an Enter-key
                      submit leaves it empty and the server action returns a validation error. */}
                  <input type="hidden" name="decision" defaultValue="" data-submitter="decision" />
                  <label className="sr-only" htmlFor={`i-${l.id}`}>Interest % per year</label>
                  <input id={`i-${l.id}`} name="interest" type="number" step="0.01" min="0" max="100" defaultValue={tenant?.default_interest_rate ?? 5} className="input w-24" />
                  <span className="text-xs text-ink/75">% a year</span>
                  <SubmitButton name="decision" value="approve" className="btn-primary btn-sm"><Icon name="check" size={14} /> Approve</SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn-danger btn-sm"><Icon name="xCircle" size={14} /> Reject</SubmitButton>
                </ActionForm>
              )}</td>
            </tr>
          ))}
        </tbody>
      </Section>

      <Section
        title="Approved, not yet paid out"
        icon="wallet"
        hint="Transfer the money to the member's bank account, then confirm here."
        rows={approved}
        emptyTitle="Nothing to pay out"
        emptyDescription="Approved loans will appear here until you confirm payment."
        caption="Approved loans awaiting payout"
        pagination={<Pagination page={approvedPage} total={approvedRes.count} basePath="/admin/loans" paramName="approvedPage" />}
      >
        <thead><tr>
          <th scope="col">Member</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Total to repay</th><th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {approved.map((l) => (
            <tr key={l.id}><td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td className="text-right">{naira(l.total_repayable)}</td>
              <td>{isAdmin && (
                <ActionForm action={activateLoan}>
                  <input type="hidden" name="loanId" value={l.id} />
                  <SubmitButton className="btn-gold btn-sm"><Icon name="checkCircle" size={14} /> I have paid this out</SubmitButton>
                </ActionForm>
              )}</td></tr>
          ))}
        </tbody>
      </Section>

      <Section
        title="Active loans"
        icon="bank"
        hint="Record each repayment when you receive it."
        rows={active}
        emptyTitle="No active loans"
        emptyDescription="Loans you mark as paid out will appear here."
        caption="Active loans and repayments"
        pagination={<Pagination page={activePage} total={activeRes.count} basePath="/admin/loans" paramName="activePage" />}
      >
        <thead><tr>
          <th scope="col">Member</th><th scope="col" className="text-right">Total to repay</th><th scope="col" className="text-right">Repaid</th>
          <th scope="col" className="text-right">Outstanding</th><th scope="col">Record repayment</th>
        </tr></thead>
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
                  <SubmitButton className="btn-primary btn-sm"><Icon name="check" size={14} /> Save</SubmitButton>
                </ActionForm>
              </td>
            </tr>
          ))}
        </tbody>
      </Section>

      <Section
        title="History"
        icon="book"
        rows={history}
        emptyTitle="Nothing yet"
        emptyDescription="Repaid and rejected loans will appear here."
        caption="Loan history"
        scroll
        pagination={<Pagination page={page} total={total} basePath="/admin/loans" />}
      >
        <thead><tr>
          <th scope="col">Member</th><th scope="col" className="text-right">Amount</th><th scope="col">Status</th><th scope="col">Date</th>
        </tr></thead>
        <tbody>
          {history.map((l) => (<tr key={l.id}><td>{who(l)}</td><td className="text-right">{naira(l.principal)}</td><td><StatusBadge status={l.status} /></td><td>{formatDate(l.created_at)}</td></tr>))}
        </tbody>
      </Section>
    </>
  );
}
