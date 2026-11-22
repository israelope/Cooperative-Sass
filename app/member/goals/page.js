import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import EmptyState from '@/components/EmptyState';
import { requireMember } from '@/lib/auth';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';
import { saveSavingsGoal, deleteSavingsGoal } from '@/app/member/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Savings goal' };

export default async function MemberGoals() {
  const { supabase, member } = await requireMember();
  const [goal, streak, summary] = await Promise.all([
    await must(supabase.from('savings_goals').select('*').eq('member_id', member.id).maybeSingle(), 'savings goal'),
    await must(supabase.rpc('member_savings_streak', { p_member_id: member.id }), 'savings streak'),
    await must(supabase.rpc('member_summary', { p_member_id: member.id }), 'member summary'),
  ]);
  const savings = Number(summary?.[0]?.savings || 0);
  const target = Number(goal?.target_amount || 0);
  const percent = target > 0 ? Math.min(100, Math.round((savings / target) * 100)) : 0;
  const months = Number(streak || 0);

  return (
    <>
      <PageHeader title="My savings goal" intro="Pick a target and watch your passbook balance carry you there. Progress is calculated from your real savings." icon="trendingUp" helpKey="memberGoals" />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="panel p-6 lg:col-span-3">
          {!goal ? (
            <EmptyState icon="trendingUp" title="No goal yet" description="Set a target below to give your savings a purpose." />
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-accent-900">{goal.title}</h2>
              <p className="num mt-2 text-3xl font-extrabold text-accent-900">{naira(savings)} <span className="text-base font-semibold text-ink/60">of {naira(goal.target_amount)}</span></p>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-accent-100" role="progressbar" aria-label="Savings goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <div className="h-full rounded-full bg-marigold-500" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink/75">{percent}% complete · {naira(Math.max(0, target - savings))} to go{goal.target_date ? ` · target date ${formatDate(goal.target_date)}` : ''}</p>
            </>
          )}

          <h3 className="mt-8 font-semibold text-accent-900">{goal ? 'Change your goal' : 'Set a goal'}</h3>
          <ActionForm action={saveSavingsGoal} resetOnSuccess={!goal} className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Goal name" name="title" defaultValue={goal?.title || ''} placeholder="e.g. New laptop" />
            <Field label="Target amount (₦)" name="targetAmount" type="number" min="1" step="0.01" defaultValue={goal?.target_amount || ''} />
            <Field label="Target date" name="targetDate" type="date" required={false} defaultValue={goal?.target_date || ''} />
            <div className="flex items-end"><SubmitButton pendingText="Saving…"><Icon name="check" size={16} /> Save goal</SubmitButton></div>
          </ActionForm>
          {goal && (
            <form action={deleteSavingsGoal} className="mt-3">
              <SubmitButton className="btn-quiet btn-sm">Remove goal</SubmitButton>
            </form>
          )}
        </section>

        <aside className="panel h-fit p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="calendar" size={18} className="text-accent-500" /> Consistency streak</h2>
          <p className="num mt-3 font-display text-4xl font-extrabold text-accent-900">{months} <span className="text-base font-semibold text-ink/70">{months === 1 ? 'month' : 'months'}</span></p>
          <p className="mt-2 text-sm text-ink/75">Consecutive months with a contribution. Keep it going with a savings plan and in-app reminders.</p>
        </aside>
      </div>
    </>
  );
}
