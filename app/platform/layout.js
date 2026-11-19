import AppShell from '@/components/AppShell';
import { requirePlatformAdmin } from '@/lib/auth';

export default async function PlatformLayout({ children }) {
  const { user } = await requirePlatformAdmin();
  const nav = [
    { href: '/platform', label: 'Overview' },
    { href: '/platform/revenue', label: 'Revenue' },
    { href: '/platform/cooperatives', label: 'Cooperatives' },
    { href: '/platform/visitors', label: 'Visitors' },
  ];
  return <AppShell nav={nav} title="Platform owner" subtitle={user.email}>{children}</AppShell>;
}
