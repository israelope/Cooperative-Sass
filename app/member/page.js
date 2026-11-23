import Link from '@/components/TenantLink';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { requireMember } from '@/lib/auth';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function MemberHome() {
  const { supabase, member, profile } = await requireMember();
  const [sum, entries] = await Promise.all([
    await must(supabase.rpc('member_summary', { p_member_id: member.id }), 'member summary'),
    await must(
      supabase
        .from('passbook_entries')
        .select('id, entry_date, entry_type, amount, running_balance, note')
        .eq('member_id', member.id)
        .order('seq', { ascending: false })
        .limit(5),
      'passbook entries',
    ),
  ]);

  const s = sum?.[0] || {};
  const active = member.status === 'active';
  const limit = Number(s.loan_limit || 0);
  const owed = Number(s.outstanding || 0);
  const used = limit > 0 ? Math.min(100, Math.round((owed / limit) * 100)) : 0;

  return (
    <>
      <PageHeader title={`Hello, ${member.full_name.split(' ')[0]}`} intro={`${profile.tenants?.name} · Member ${member.member_no}`} helpKey="memberHome">
        {active && <Link href="/member/pay" className="btn-gold"><Icon name="wallet" size={16} /> Pay contribution</Link>}
        {active && <Link href="/member/loans" className="btn-quiet"><Icon name="bank" size={16} /> Request a loan</Link>}
      </PageHeader>

      {(entries || []).length === 0 && (
        <div className="callout-info mb-5 flex-wrap">
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{active ? 'Welcome to your passbook.' : 'Your account is waiting for approval.'}</p>
            <p className="mt-0.5">
              {active
                ? <>Make your first contribution and it will appear here automatically. <Link href="/help/member#start" className="link">See how it works</Link></>
                : <>An officer needs to approve your membership before you can pay or borrow. <Link href="/help/member#start" className="link">Read the member guide</Link></>}
            </p>
          </div>
        </div>
      )}

      <div className="passbook-page p-6 pl-14">
        <p className="flex items-center gap-2 text-sm font-medium text-ink/75">
          <Icon name="wallet" size={16} className="text-accent-500" /> Your savings
        </p>
        <p className="num mt-1 font-display text-4xl font-extrabold text-accent-900 sm:text-5xl">{naira(s.savings)}</p>
        <dl className="mt-5 grid max-w-xl grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <dt className="text-ink/75">You can borrow up to</dt><dd className="num text-right font-semibold text-ok-700 sm:text-right">{naira(s.loan_limit)}</dd>
          <dt className="text-ink/75">Loan still owed</dt><dd className="num font-semibold sm:text-right">{naira(s.outstanding)}</dd>
          <dt className="text-ink/75">Loan limit rule</dt><dd className="num sm:text-right">{s.multiplier ?? 0} × savings</dd>
        </dl>
        {limit > 0 && (
          <div className="mt-5 max-w-xl">
            <div className="mb-1 flex items-center justify-between text-xs text-ink/75">
              <span>Loan used</span><span className="num font-semibold">{used}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-accent-100"
              role="progressbar"
              aria-label="Loan balance used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={used}
            >
              <div className="h-full rounded-full bg-accent-600" style={{ width: `${used}%` }} />
            </div>
          </div>
        )}
      </div>

      {active && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Link href="/member/pay" className="panel flex items-center gap-4 p-5 transition-colors hover:bg-accent-50">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-marigold-100 text-marigold-700"><Icon name="wallet" size={20} /></span>
            <span><span className="block font-display font-semibold text-accent-900">Pay a contribution</span><span className="text-sm text-ink/75">Online or with a receipt from your bookkeeper.</span></span>
            <Icon name="arrowRight" size={18} className="ml-auto text-accent-500" />
          </Link>
          <Link href="/member/loans" className="panel flex items-center gap-4 p-5 transition-colors hover:bg-accent-50">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name="bank" size={20} /></span>
            <span><span className="block font-display font-semibold text-accent-900">Loans & repayments</span><span className="text-sm text-ink/75">Request a loan or repay what you owe.</span></span>
            <Icon name="arrowRight" size={18} className="ml-auto text-accent-500" />
          </Link>
        </div>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-bold text-accent-900">
        <Icon name="book" size={18} className="text-accent-500" /> Latest entries
      </h2>
      <div className="panel p-2">
        {(entries || []).length === 0 ? (
          <EmptyState compact icon="book" title="No entries yet" description="Your first contribution will show up here." />
        ) : (
          <DataTable caption="Your five most recent passbook entries">
            <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Balance</th></tr></thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td>{e.note || e.entry_type}</td>
                  <td className="text-right">{naira(e.amount)}</td>
                  <td className="text-right font-semibold">{naira(e.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      <p className="mt-3 text-sm"><Link href="/member/passbook" className="link inline-flex items-center gap-1">See the full passbook <Icon name="arrowRight" size={14} /></Link></p>
    </>
  );
}
