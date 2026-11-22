'use server';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth';

export async function requestLoan(prev, fd) {
  const { supabase } = await requireMember();
  const amount = Number(String(fd.get('amount') ?? '').replace(/,/g, ''));
  const tenor = parseInt(String(fd.get('tenor') ?? ''), 10);
  if (!(amount > 0)) return { error: 'Enter the amount you want to borrow.' };
  if (!(tenor >= 1 && tenor <= 120)) return { error: 'Enter a duration between 1 and 120 months.' };
  const { error } = await supabase.rpc('request_loan', { p_amount: amount, p_tenor: tenor });
  if (error) return { error: error.message };
  revalidatePath('/member', 'layout');
  return { ok: true, message: 'Loan request sent. Your cooperative will review it.' };
}

/* ---------------- savings schedule ---------------- */

export async function saveContributionPlan(prev, fd) {
  const { supabase } = await requireMember();
  const amount = Number(String(fd.get('amount') ?? '').replace(/,/g, ''));
  const frequency = String(fd.get('frequency') ?? '');
  const dom = fd.get('dueDom') ? Number(fd.get('dueDom')) : null;
  const dow = fd.get('dueDow') ? Number(fd.get('dueDow')) : null;
  if (!(amount >= 100)) return { error: 'Enter an amount of at least ₦100.' };
  if (!['weekly', 'monthly'].includes(frequency)) return { error: 'Choose weekly or monthly.' };
  const { data, error } = await supabase.rpc('save_contribution_plan', {
    p_amount: amount, p_frequency: frequency, p_dom: dom, p_dow: dow,
  });
  if (error) return { error: error.message };
  revalidatePath('/member/contributions');
  return { ok: true, message: `Plan saved. Your next contribution is due ${new Date(data).toLocaleDateString('en-NG')}.` };
}

export async function setContributionPlanStatus(prev, fd) {
  const { supabase } = await requireMember();
  const status = String(fd.get('status') ?? '');
  if (!['active', 'paused'].includes(status)) return { error: 'Invalid status.' };
  const { error } = await supabase.rpc('set_contribution_plan_status', { p_status: status });
  if (error) return { error: error.message };
  revalidatePath('/member/contributions');
  return { ok: true, message: status === 'paused' ? 'Plan paused. No more reminders until you resume.' : 'Plan resumed.' };
}

/* ---------------- savings goal ---------------- */

export async function saveSavingsGoal(prev, fd) {
  const { supabase } = await requireMember();
  const target = Number(String(fd.get('targetAmount') ?? '').replace(/,/g, ''));
  const date = String(fd.get('targetDate') ?? '') || null;
  if (!(target > 0)) return { error: 'Enter a target greater than zero.' };
  const { error } = await supabase.rpc('save_savings_goal', {
    p_title: String(fd.get('title') ?? ''), p_target: target, p_target_date: date,
  });
  if (error) return { error: error.message };
  revalidatePath('/member/goals');
  revalidatePath('/member', 'layout');
  return { ok: true, message: 'Savings goal saved.' };
}

export async function deleteSavingsGoal() {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc('delete_savings_goal');
  if (error) return { error: error.message };
  revalidatePath('/member/goals');
  return { ok: true, message: 'Goal removed.' };
}
