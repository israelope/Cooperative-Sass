import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { WEEKDAYS } from '@/lib/schedule';
import { requireMember } from '@/lib/auth';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';
import { saveContributionPlan, setContributionPlanStatus } from '@/app/member/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Savings plan' };

export default async function MemberContributions() {
  const { supabase, member } = await requireMember();
  const plan = await must(
    supabase.from('contribution_plans').select('*').eq('member_id', member.id).maybeSingle(),
    'savings plan',
  );

  return (
    <>
      <PageHeader title="Savings plan" intro="Choose a schedule and we'll remind you in the app when it's time to pay. You still make each payment yourself." icon="calendar" helpKey="memberContributions">
        <Link href="/member/pay" className="btn-gold"><Icon name="wallet" size={16} /> Pay now</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="panel p-6 lg:col-span-3">
          <h2 className="text-lg font-bold text-accent-900">{plan ? 'Edit your plan' : 'Start a savings plan'}</h2>
          <p className="mt-1 text-sm text-ink/75">Minimum ₦100. Reminders arrive in your in-app inbox; there is no automatic debit.</p>
          <ActionForm action={saveContributionPlan} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₦)" name="amount" type="number" min="100" step="0.01" defaultValue={plan?.amount || ''} />
            <div>
              <label htmlFor="frequency" className="label">Frequency *</label>
              <select id="frequency" name="frequency" defaultValue={plan?.frequency || 'monthly'} className="input">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <Field label="Monthly date (1–28)" name="dueDom" type="number" min="1" max="28" required={false} defaultValue={plan?.due_dom || 1} hint="Used when frequency is monthly." />
            <div>
              <label htmlFor="dueDow" className="label">Weekly day</label>
              <select id="dueDow" name="dueDow" defaultValue={plan?.due_dow ?? 1} className="input">
                {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <p className="hint">Used when frequency is weekly.</p>
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingText="Saving…"><Icon name="check" size={16} /> Save plan</SubmitButton></div>
          </ActionForm>
        </section>

        <aside className="panel p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-accent-900">Your schedule</h2>
          {!plan ? (
            <p className="mt-2 text-sm text-ink/75">No plan yet. Save one to start getting reminders.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink/75">Amount</dt><dd className="num font-semibold">{naira(plan.amount)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/75">Frequency</dt><dd className="capitalize">{plan.frequency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/75">Next reminder</dt><dd>{formatDate(plan.next_due_on)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/75">Status</dt><dd className="font-semibold capitalize">{plan.status}</dd></div>
              {plan.missed_count > 0 && <div className="callout-warn mt-3"><span>{plan.missed_count} missed due date(s) recorded.</span></div>}
            </dl>
          )}
          {plan && (
            <ActionForm action={setContributionPlanStatus} className="mt-5">
              <input type="hidden" name="status" value={plan.status === 'active' ? 'paused' : 'active'} />
              <SubmitButton className="btn-quiet">{plan.status === 'active' ? 'Pause reminders' : 'Resume reminders'}</SubmitButton>
            </ActionForm>
          )}
        </aside>
      </div>
    </>
  );
}
