'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const NAV_ICONS = {
  '/admin': 'dashboard',
  '/admin/members': 'users',
  '/admin/payments': 'card',
  '/admin/payments/record': 'plusCircle',
  '/admin/loans': 'bank',
  '/admin/reconciliation': 'refresh',
  '/admin/statements': 'fileText',
  '/admin/import': 'upload',
  '/admin/settings': 'settings',
  '/member': 'home',
  '/member/passbook': 'book',
  '/member/pay': 'wallet',
  '/member/loans': 'bank',
  '/platform': 'dashboard',
  '/platform/revenue': 'chart',
  '/platform/cooperatives': 'building',
  '/platform/cooperatives/[id]': 'building',
  '/platform/visitors': 'eye',
};

export function isActivePath(pathname, href) {
  if (pathname === href) return true;
  // Only treat child routes as active for nested links (never for /admin, /member, /platform).
  return href.split('/').length > 2 && pathname.startsWith(`${href}/`);
}

export default function NavLinks({ nav, variant = 'sidebar', onNavigate }) {
  const pathname = usePathname() || '';

  if (variant === 'tabs') {
    return (
      <div className="no-scrollbar flex items-stretch overflow-x-auto">
        {nav.map((n) => {
          const active = isActivePath(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={`flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold transition-colors ${active ? 'border-t-2 border-marigold-400 text-adire-800' : 'border-t-2 border-transparent text-ink/70 hover:text-adire-700'}`}
            >
              <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={18} />
              <span className="whitespace-nowrap">{n.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  if (variant === 'menu') {
    return (
      <div className="space-y-1">
        {nav.map((n) => {
          const active = isActivePath(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? 'bg-adire-700 text-white' : 'text-ink/80 hover:bg-adire-50 hover:text-adire-800'}`}
            >
              <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={17} />
              {n.label}
              {active && <Icon name="chevronRight" size={14} className="ml-auto" />}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {nav.map((n) => {
        const active = isActivePath(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-white/15 text-white shadow-sm ring-1 ring-inset ring-white/10' : 'text-adire-100 hover:bg-adire-700 hover:text-white'}`}
          >
            <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={17} className={active ? 'text-marigold-400' : 'text-adire-200'} />
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}
