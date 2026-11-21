import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, full_name, tenants(name, slug)')
    .eq('id', user.id)
    .maybeSingle();

  // A suspended cooperative is locked out (the database also refuses all of its queries).
  if (profile?.tenant_id) {
    const { data: t } = await createServiceClient().from('tenants').select('status').eq('id', profile.tenant_id).maybeSingle();
    if (t?.status === 'suspended') redirect('/suspended');
  }
  return { supabase, user, profile };
}

/** Admin or bookkeeper. Pass { adminOnly: true } for admin-only screens. */
export async function requireStaff({ adminOnly = false } = {}) {
  const s = await getSession();
  if (!s.user) redirect('/login');
  if (!s.profile) redirect(s.user.app_metadata?.role === 'platform_admin' ? '/platform' : '/login');
  if (s.profile.role === 'member') redirect('/member');
  if (adminOnly && s.profile.role !== 'admin') redirect('/admin');
  return s;
}

export async function requireMember() {
  const s = await getSession();
  if (!s.user) redirect('/login');
  if (!s.profile) redirect(s.user.app_metadata?.role === 'platform_admin' ? '/platform' : '/login');
  if (s.profile.role !== 'member') redirect('/admin');
  const { data: member } = await s.supabase.from('members').select('*').eq('user_id', s.user.id).maybeSingle();
  if (!member) redirect('/login');
  return { ...s, member };
}

/** Returns the user if (and only if) they are the platform owner; never redirects (use in API routes). */
export async function getPlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'platform_admin') return null;
  const { data } = await createServiceClient().from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? user : null;
}

/**
 * Platform owner only. Two independent checks: the tamper-proof role claim in the token AND a row in
 * platform_admins (read with the service role). Platform data is only ever read after this passes.
 */
export async function requirePlatformAdmin() {
  const user = await getPlatformAdmin();
  if (!user) redirect('/login');
  return { user };
}
