import AppShell from '@/components/AppShell';
import { requireMember } from '@/lib/auth';
import { unreadCount } from '@/lib/notifications';

export default async function MemberLayout({ children }) {
  const { supabase, profile, member } = await requireMember();
  const unread = await unreadCount(supabase);
  const nav = [
    { href: '/member', label: 'Home' },
    { href: '/member/notifications', label: 'Notifications', badge: unread },
    { href: '/member/pay', label: 'Pay contribution' },
    { href: '/member/passbook', label: 'Passbook' },
    { href: '/member/loans', label: 'Loans' },
    { href: '/member/contributions', label: 'Savings plan' },
    { href: '/member/goals', label: 'My goal' },
    { href: '/member/card', label: 'Membership card' },
  ];
  return (
    <AppShell nav={nav} title="Member" subtitle={profile.tenants?.name} tone="member">
      {member.status === 'pending' && (
        <p className="mb-5 rounded-xl bg-marigold-100 px-4 py-3 text-sm text-marigold-700">Your membership is waiting for approval by a cooperative officer. You can look around, but payments and loans open once you are approved.</p>
      )}
      {member.status === 'suspended' && (
        <p className="mb-5 rounded-xl bg-bad-100 px-4 py-3 text-sm text-bad-700">Your membership is suspended. Contact your cooperative&apos;s officers.</p>
      )}
      {children}
    </AppShell>
  );
}
