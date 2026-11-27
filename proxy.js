import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { APP_ROLES, roleHome, sectionFor, canAccess, slugFromPath } from '@/lib/roles';

// Route-level guard (level 1 of 3). Level 2 = server actions re-check role; level 3 = RLS in the database.
export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Help centre guides are public; the tenant patterns below must not catch /help/admin or /help/member.
  if (path === '/help' || path.startsWith('/help/')) return response;

  const go = (to) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    return NextResponse.redirect(url);
  };
  const goScoped = (to) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    return NextResponse.redirect(url);
  };

  // Links shared with the old /c/<co-op>/... format keep working.
  const oldPrefix = path.match(/^\/c\/([^/]+)(\/.*)?$/);
  if (oldPrefix) return goScoped(`/${oldPrefix[1]}${oldPrefix[2] || ''}`);

  if (!user) return go('/login');
  const role = user.app_metadata?.role;
  if (!APP_ROLES.includes(role)) return go('/login');

  // The profile is authoritative: a demoted admin must not keep staff access
  // through a token that still carries the old role claim.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id, tenants(slug)')
    .eq('id', user.id)
    .maybeSingle();
  if (profile && profile.role !== role) return go('/login?reason=role');
  const claimTenant = user.app_metadata?.tenant_id;
  if (claimTenant && profile?.tenant_id && claimTenant !== profile.tenant_id) return go('/login?reason=role');

  const tenantSlug = profile?.tenants?.slug;

  // Old bookmarks and links from the Help centre still resolve to the co-op's address.
  const legacy = path.match(/^\/(member|admin)(?:\/|$)/);
  if (legacy && tenantSlug) {
    const prefix = `/${legacy[1]}`;
    const rest = path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : '';
    return goScoped(`/${tenantSlug}/${legacy[1]}${rest}`);
  }

  // Never show one society's portal under another society's name.
  const pathSlug = slugFromPath(path);
  if (pathSlug && tenantSlug && pathSlug !== tenantSlug) {
    const rest = path.slice(`/${pathSlug}`.length);
    return goScoped(`/${tenantSlug}${rest}`);
  }

  const section = sectionFor(path);
  if (!canAccess(role, section)) return go(roleHome(role, tenantSlug));
  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/member/:path*',
    '/platform/:path*',
    '/c/:slug',
    '/c/:slug/:path*',
    '/:slug/member/:path*',
    '/:slug/admin/:path*',
  ],
};
