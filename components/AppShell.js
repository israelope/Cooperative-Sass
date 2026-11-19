import Link from 'next/link';
import Logo from '@/components/Logo';
import { logout } from '@/app/actions/auth';

export default function AppShell({ nav, title, subtitle, children }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-adire-800 text-adire-100 md:min-h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 md:block">
          <Logo href="/" light />
          <p className="mt-0 text-xs text-adire-200 md:mt-3">{title}</p>
          {subtitle && <p className="hidden text-sm font-semibold text-white md:block">{subtitle}</p>}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-adire-100 hover:bg-adire-700 hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="hidden px-3 py-4 md:block">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-adire-200 hover:bg-adire-700 hover:text-white">Log out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {children}
        <form action={logout} className="mt-10 md:hidden">
          <button className="btn-quiet btn-sm">Log out</button>
        </form>
      </main>
    </div>
  );
}
