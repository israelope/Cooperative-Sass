import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import NavLinks from '@/components/NavLinks';
import MobileNav from '@/components/MobileNav';
import { logout } from '@/app/actions/auth';

export default function AppShell({ nav, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-chalk">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-adire-800 focus:ring-2 focus:ring-adire-500">
        Skip to content
      </a>

      {/* Mobile: compact sticky header with an all-pages menu. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-rule bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <MobileNav nav={nav} title={title} subtitle={subtitle} />
      </div>

      <div className="md:flex">
        <aside className="hidden bg-adire-800 text-adire-100 md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col">
          <div className="px-5 py-5">
            <Logo href="/" light />
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-adire-200">{title}</p>
            {subtitle && <p className="mt-1 truncate text-sm font-semibold text-white" title={subtitle}>{subtitle}</p>}
          </div>
          <nav className="flex-1 px-3 pb-4" aria-label="Main">
            <NavLinks nav={nav} />
          </nav>
          <form action={logout} className="border-t border-white/10 p-3">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-adire-100 hover:bg-adire-700 hover:text-white">
              <Icon name="logout" size={17} /> Log out
            </button>
          </form>
        </aside>

        <main id="main-content" className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 sm:py-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile: quick tab bar. All items are reachable via the Menu button above. */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-white/95 backdrop-blur md:hidden">
        <NavLinks nav={nav} variant="tabs" />
      </nav>
    </div>
  );
}
