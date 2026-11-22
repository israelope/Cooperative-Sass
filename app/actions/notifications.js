'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

async function markAll() {
  const { supabase, user } = await getSession();
  if (!user) return { error: 'Please sign in again.' };
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) return { error: error.message };
  revalidatePath('/member', 'layout');
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function markNotificationRead(prev, fd) {
  const { supabase, user } = await getSession();
  if (!user) return { error: 'Please sign in again.' };
  const id = String(fd.get('id') || '');
  if (!id) return { error: 'Invalid notification.' };
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) return { error: error.message };
  revalidatePath('/member', 'layout');
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function markAllNotificationsRead() {
  return markAll();
}
