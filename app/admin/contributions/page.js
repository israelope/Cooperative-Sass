import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { SubmitButton } from '@/components/ActionForm';
import { requireStaff } from '@/lib/auth';
import { mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';
import { nudgeMember } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Savings plans' };

export default async function AdminContributions(props) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireStaff();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const { rows, count } = await mustWithCount(
    supabase
      .from('contribution_plans')
      .select('id, amount, frequency, next_due_on, missed_count, status, members(id, full_name, member_no)', { count: 'exact' })
      .order('missed_count', { ascending: false })
      .order('next_due_on', { ascending: true })
      .range(range.from, range.to),
    'savings plans',
  );
  const behind = rows.filter((p) => p.missed_count > 0).length;

  return (
    <>
      <PageHeader title="Savings plans" intro="See who has a recurring contribution plan, who is behind, and send a gentle in-app nudge." icon="calendar" />

      <section className="panel mb-6 flex flex-wrap items-center gap-6 p-5">
        <p className="text-sm text-ink/75"><span className="block font-display text-2xl font-bold text-accent-900">{count}</span> active plans</p>
        <p className="text-sm text-ink/75"><span className="block font-display text-2xl font-bold text-accent-900">{behind}</span> behind on this page</p>
        <p className="ml-auto max-w-sm text-xs text-ink/60">Plans and reminders are managed by members. Officers can encourage, but never change a member&apos;s amount.</p>
      </section>

      <div className="panel p-2">
        {!rows?.length ? (
          <EmptyState compact icon="calendar" title="No savings plans yet" description="Members can create one from their Member > Savings plan page." />
        ) : (
          <DataTable caption="Member contribution schedules" scroll>
            <thead><tr><th scope="col">Member</th><th scope="col">Amount</th><th scope="col">Frequency</th><th scope="col">Next due</th><th scope="col">Missed</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-semibold">{p.members?.full_name}<span className="block text-xs text-ink/70">{p.members?.member_no}</span></td>
                  <td className="num">{naira(p.amount)}</td>
                  <td className="capitalize">{p.frequency}</td>
                  <td>{formatDate(p.next_due_on)}</td>
                  <td className="num">{p.missed_count || 0}</td>
                  <td className="capitalize">{p.status}</td>
                  <td>
                    {p.members?.id && (
                      <form action={nudgeMember}>
                        <input type="hidden" name="memberId" value={p.members.id} />
                        <SubmitButton className="btn-quiet btn-sm">Nudge</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination page={page} total={count} basePath="/admin/contributions" />
      </div>
    </>
  );
}
