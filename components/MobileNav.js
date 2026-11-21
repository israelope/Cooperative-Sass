'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import NavLinks from '@/components/NavLinks';
import { logout } from '@/app/actions/auth';

export default function MobileNav({ nav, title, subtitle }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
      >
        <Icon name={open ? 'close' : 'menu'} size={18} />
        Menu
      </button>

      {open && (
        <div id="mobile-navigation" className="animate-rise absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-rule bg-white p-4 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-accent-600">{title}</p>
          {subtitle && <p className="mb-3 mt-0.5 truncate text-sm text-ink/75" title={subtitle}>{subtitle}</p>}
          <nav aria-label="All pages">
            <NavLinks nav={nav} variant="menu" onNavigate={() => setOpen(false)} />
          </nav>
          <form action={logout} className="mt-3 border-t border-rule pt-3">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/75 transition-colors hover:bg-accent-50 hover:text-accent-800">
              <Icon name="logout" size={17} /> Log out
            </button>
          </form>
        </div>
      )}
    </>
  );
}
