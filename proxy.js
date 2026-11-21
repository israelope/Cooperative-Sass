import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

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
  if (!['platform_admin', 'admin', 'bookkeeper', 'member'].includes(role)) return go('/login');

  const home = role === 'platform_admin' ? '/platform' : role === 'member' ? '/member' : '/admin';
  const section = path.startsWith('/platform') ? 'platform' : path.startsWith('/admin') ? 'staff' : 'member';
  const allowed =
    section === 'platform' ? role === 'platform_admin'
    : section === 'staff' ? role === 'admin' || role === 'bookkeeper'
    : role === 'member';
  if (!allowed) return go(home);
  return response;
}

export const config = { matcher: ['/admin/:path*', '/member/:path*', '/platform/:path*'] };
