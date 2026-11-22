'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import NavLinks from '@/components/NavLinks';
import { logout } from '@/app/actions/auth';

export default function MobileNav({ nav, title, subtitle, variant = 'header', helpHref = '/help' }) {
  const [open, setOpen] = useState(false);
  const asTab = variant === 'tab';
  const menuId = `mobile-navigation-${variant}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        className={asTab
          ? `flex w-full min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 py-2.5 text-[11px] font-semibold transition-colors ${open ? 'border-accent-400 text-accent-800' : 'border-transparent text-ink/70'}`
          : 'inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-700'}
      >
        <Icon name={open ? 'close' : 'menu'} size={18} />
        <span className={asTab ? 'max-w-full truncate' : undefined}>{asTab ? 'More' : 'Menu'}</span>
      </button>

      {open && (
        <div
          id={menuId}
          className={`animate-rise absolute inset-x-0 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-rule bg-white p-4 shadow-xl ${asTab ? 'bottom-full border-t' : 'top-full border-b'}`}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-accent-600">{title}</p>
          {subtitle && <p className="mb-3 mt-0.5 truncate text-sm text-ink/75" title={subtitle}>{subtitle}</p>}
          <nav aria-label="All pages">
            <NavLinks nav={nav} variant="menu" onNavigate={() => setOpen(false)} />
          </nav>
          {helpHref && (
            <Link
              href={helpHref}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-3 rounded-lg border-t border-rule px-3 pb-2 pt-3 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-50"
            >
              <Icon name="info" size={17} /> Help &amp; guides
            </Link>
          )}
          <form action={logout} className="border-t border-rule pt-3">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/75 transition-colors hover:bg-accent-50 hover:text-accent-800">
              <Icon name="logout" size={17} /> Log out
            </button>
          </form>
        </div>
      )}
    </>
  );
}
