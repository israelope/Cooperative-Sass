import AppShell from '@/components/AppShell';
import { requireStaff } from '@/lib/auth';

export default async function AdminLayout({ children }) {
  const { profile } = await requireStaff();
  const isAdmin = profile.role === 'admin';
  const nav = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/payments/record', label: 'Record payment' },
    { href: '/admin/loans', label: 'Loans' },
    { href: '/admin/reconciliation', label: 'Reconciliation' },
    { href: '/admin/statements', label: 'Statements' },
    ...(isAdmin ? [{ href: '/admin/import', label: 'Bulk import' }, { href: '/admin/settings', label: 'Settings' }] : []),
  ];
  return (
    <AppShell nav={nav} title={isAdmin ? 'Cooperative admin' : 'Bookkeeper'} subtitle={profile.tenants?.name}>
      {children}
    </AppShell>
  );
}
