import Link from 'next/link';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import NavLinks from '@/components/NavLinks';
import MobileNav from '@/components/MobileNav';
import { logout } from '@/app/actions/auth';

export default function AppShell({ nav, title, subtitle, tone = 'cooperative', helpHref = '/help', children }) {
  // Three primary destinations on mobile; the More tab opens the full list.
  const primaryNav = nav.slice(0, 3);

  return (
    <div data-tone={tone} className="min-h-dvh overflow-x-clip bg-chalk">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-800 focus:ring-2 focus:ring-accent-500">
        Skip to content
      </a>

      {/* Mobile: compact sticky header with an all-pages menu. */}
      <div className="sticky top-0 z-40 flex w-full max-w-full items-center justify-between gap-3 border-b border-rule bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="min-w-0"><Logo /></div>
        <MobileNav nav={nav} title={title} subtitle={subtitle} helpHref={helpHref} />
      </div>

      <div className="md:flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-accent-800 text-white md:flex">
          <div className="shrink-0 px-5 py-5">
            <Logo href="/" light />
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-accent-200">{title}</p>
            {subtitle && <p className="mt-1 truncate text-sm font-semibold text-white" title={subtitle}>{subtitle}</p>}
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main">
            <NavLinks nav={nav} />
          </nav>
          <div className="shrink-0 border-t border-white/10 p-3">
            <Link href={helpHref} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-accent-700 hover:text-white">
              <Icon name="info" size={17} /> Help &amp; guides
            </Link>
          </div>
          <form action={logout} className="shrink-0 border-t border-white/10 p-3">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-accent-700 hover:text-white">
              <Icon name="logout" size={17} /> Log out
            </button>
          </form>
        </aside>

        <main id="main-content" className="min-w-0 max-w-full flex-1 animate-rise px-4 pb-28 pt-6 sm:px-8 sm:py-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile: three primary destinations plus a More tab for everything else. */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 w-full max-w-full border-t border-rule bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid max-w-full grid-cols-4">
          <div className="col-span-3"><NavLinks nav={primaryNav} variant="tabs" columns={3} /></div>
          <MobileNav nav={nav} title={title} subtitle={subtitle} variant="tab" />
        </div>
      </nav>
    </div>
  );
}
