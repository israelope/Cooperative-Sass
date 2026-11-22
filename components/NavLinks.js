'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const NAV_ICONS = {
  '/admin': 'dashboard',
  '/admin/notifications': 'mail',
  '/admin/cashbook': 'bank',
  '/admin/contributions': 'calendar',
  '/admin/members': 'users',
  '/admin/payments': 'card',
  '/admin/payments/record': 'plusCircle',
  '/admin/loans': 'bank',
  '/admin/reconciliation': 'refresh',
  '/admin/statements': 'fileText',
  '/admin/import': 'upload',
  '/admin/team': 'users',
  '/admin/settings': 'settings',
  '/member': 'home',
  '/member/notifications': 'mail',
  '/member/passbook': 'book',
  '/member/pay': 'wallet',
  '/member/loans': 'bank',
  '/member/contributions': 'calendar',
  '/member/goals': 'trendingUp',
  '/member/card': 'card',
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

const TAB_COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bad-600 px-1 text-[10px] font-bold text-white" aria-label={`${count} unread`}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function NavLinks({ nav, variant = 'sidebar', onNavigate, columns = 4 }) {
  const pathname = usePathname() || '';

  if (variant === 'tabs') {
    return (
      <div className={`no-scrollbar grid max-w-full ${TAB_COLS[columns] || TAB_COLS[4]}`}>
        {nav.map((n) => {
          const active = isActivePath(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[11px] font-semibold transition-all duration-200 ${active ? 'border-t-2 border-accent-400 text-accent-800' : 'border-t-2 border-transparent text-ink/70 hover:text-accent-700'}`}
            >
              <span className="relative inline-flex">
                <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={18} />
                {!!n.badge && <span className="absolute -right-2 -top-1"><Badge count={n.badge} /></span>}
              </span>
              <span className="max-w-full truncate">{n.label}</span>
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-accent-700 text-white' : 'text-ink/80 hover:bg-accent-50 hover:text-accent-800'}`}
            >
              <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={17} />
              <span className="truncate">{n.label}</span>
              {!!n.badge && <span className="ml-auto"><Badge count={n.badge} /></span>}
              {active && !n.badge && <Icon name="chevronRight" size={14} className="ml-auto shrink-0" />}
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
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-white/15 text-white shadow-sm ring-1 ring-inset ring-white/10' : 'text-white/85 hover:bg-accent-700 hover:text-white'}`}
          >
            <Icon name={NAV_ICONS[n.href] || 'chevronRight'} size={17} className={active ? 'shrink-0 text-accent-300' : 'shrink-0 text-accent-200'} />
            <span className="truncate">{n.label}</span>
            {!!n.badge && <span className="ml-auto"><Badge count={n.badge} /></span>}
          </Link>
        );
      })}
    </div>
  );
}
