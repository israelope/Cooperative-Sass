import AppShell from '@/components/AppShell';
import { requireStaff } from '@/lib/auth';
import { unreadCount } from '@/lib/notifications';

export default async function AdminLayout({ children }) {
  const { supabase, profile } = await requireStaff();
  const isAdmin = profile.role === 'admin';
  const unread = await unreadCount(supabase);
  const nav = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/notifications', label: 'Notifications', badge: unread },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/cashbook', label: 'Cashbook' },
    { href: '/admin/contributions', label: 'Savings plans' },
    { href: '/admin/loans', label: 'Loans' },
    { href: '/admin/payments/record', label: 'Record payment' },
    { href: '/admin/reconciliation', label: 'Reconciliation' },
    { href: '/admin/statements', label: 'Statements' },
    ...(isAdmin ? [{ href: '/admin/team', label: 'Team' }, { href: '/admin/import', label: 'Bulk import' }, { href: '/admin/settings', label: 'Settings' }] : []),
  ];
  return (
    <AppShell nav={nav} title={isAdmin ? 'Cooperative admin' : 'Bookkeeper'} subtitle={profile.tenants?.name} tone="cooperative">
      {children}
    </AppShell>
  );
}
