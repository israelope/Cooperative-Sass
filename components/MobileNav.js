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
        className="inline-flex items-center gap-2 rounded-lg bg-adire-800 px-3 py-2 text-sm font-semibold text-white"
      >
        <Icon name={open ? 'close' : 'menu'} size={18} />
        Menu
      </button>

      {open && (
        <div id="mobile-navigation" className="absolute inset-x-0 top-full z-40 border-b border-rule bg-white p-4 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-adire-500">{title}</p>
          {subtitle && <p className="mb-3 mt-0.5 truncate text-sm text-ink/75">{subtitle}</p>}
          <nav aria-label="All pages">
            <NavLinks nav={nav} variant="menu" onNavigate={() => setOpen(false)} />
          </nav>
          <form action={logout} className="mt-3 border-t border-rule pt-3">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/75 hover:bg-adire-50 hover:text-adire-800">
              <Icon name="logout" size={17} /> Log out
            </button>
          </form>
        </div>
      )}
    </>
  );
}
