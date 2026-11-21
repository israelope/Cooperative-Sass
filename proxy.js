import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { APP_ROLES, roleHome, sectionFor, canAccess } from '@/lib/roles';

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
  const go = (to) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    return NextResponse.redirect(url);
  };

  if (!user) return go('/login');
  const role = user.app_metadata?.role;
  if (!APP_ROLES.includes(role)) return go('/login');

  const section = sectionFor(path);
  if (!canAccess(role, section)) return go(roleHome(role));
  return response;
}

export const config = { matcher: ['/admin/:path*', '/member/:path*', '/platform/:path*'] };
