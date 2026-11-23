import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { roleHome } from '@/lib/roles';

// A role change cannot refresh a different users JWT. Until they sign in again
// the claim is stale, so the profile wins and they are sent back to log in.
function roleClaimIsStale(user, profile) {
  if (!user || !profile) return false;
  const claimRole = user.app_metadata?.role;
  const claimTenant = user.app_metadata?.tenant_id;
  return Boolean(claimRole && claimRole !== profile.role)
    || Boolean(claimTenant && profile.tenant_id && claimTenant !== profile.tenant_id);
}

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, full_name, tenants(name, slug)')
    .eq('id', user.id)
    .maybeSingle();
  if (roleClaimIsStale(user, profile)) redirect('/login?reason=role');

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
  const slug = s.profile.tenants?.slug;
  if (s.profile.role === 'member') redirect(roleHome(s.profile.role, slug));
  if (adminOnly && s.profile.role !== 'admin') redirect(roleHome('admin', slug));
  return s;
}

export async function requireMember() {
  const s = await getSession();
  if (!s.user) redirect('/login');
  if (!s.profile) redirect(s.user.app_metadata?.role === 'platform_admin' ? '/platform' : '/login');
  if (s.profile.role !== 'member') redirect(roleHome(s.profile.role, s.profile.tenants?.slug));
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
  if (user) return { user };
  // A signed-in member/admin belongs in their own dashboard, not at the login screen.
  const supabase = await createClient();
  const { data: { user: signedIn } } = await supabase.auth.getUser();
  if (!signedIn) redirect('/login');
  const { data: signedInProfile } = await supabase
    .from('profiles')
    .select('role, tenants(slug)')
    .eq('id', signedIn.id)
    .maybeSingle();
  redirect(roleHome(signedInProfile?.role || signedIn.app_metadata?.role, signedInProfile?.tenants?.slug));
}
