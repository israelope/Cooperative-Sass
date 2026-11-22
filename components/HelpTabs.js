'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { ROLES } from '@/lib/help-content';

export default function HelpTabs() {
  const pathname = usePathname() || '';

  return (
    <nav aria-label="Guides by role" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <Link
        href="/help"
        aria-current={pathname === '/help' ? 'page' : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset transition-colors ${pathname === '/help' ? 'bg-accent-700 text-white ring-accent-700' : 'bg-white text-accent-800 ring-rule hover:bg-accent-50'}`}
      >
        <Icon name="book" size={16} /> All guides
      </Link>
      {ROLES.map((role) => {
        const active = pathname === `/help/${role.id}`;
        return (
          <Link
            key={role.id}
            href={`/help/${role.id}`}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset transition-colors ${active ? 'bg-accent-700 text-white ring-accent-700' : 'bg-white text-accent-800 ring-rule hover:bg-accent-50'}`}
          >
            <Icon name={role.icon} size={16} /> {role.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
