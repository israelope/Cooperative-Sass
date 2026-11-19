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
