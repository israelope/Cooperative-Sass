import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Stat, { StatGrid } from '@/components/Stat';
import BarChart from '@/components/BarChart';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { requireStaff } from '@/lib/auth';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function AdminDashboard() {
  const { supabase, profile } = await requireStaff();
  const [stats, recent] = await Promise.all([
    must(supabase.rpc('admin_stats'), 'dashboard statistics'),
    must(
      supabase
        .from('transactions')
        .select('id, amount, channel, status, created_at, paid_at, members(full_name, member_no)')
        .order('created_at', { ascending: false })
        .limit(8),
      'recent payments',
    ),
  ]);

  const s = stats || {};
  const monthly = s.monthly || [];
  const needsAttention = Number(s.members_pending || 0) + Number(s.pending_loans || 0);

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name?.split(' ')[0] || 'there'}`} intro={`Overview of ${profile.tenants?.name}.`}>
        <Link href="/admin/payments/record" className="btn-gold"><Icon name="plusCircle" size={16} /> Record a payment</Link>
        <Link href="/admin/members" className="btn-quiet"><Icon name="users" size={16} /> Members</Link>
      </PageHeader>

      {needsAttention > 0 && (
        <div className="callout-warn mb-5" role="status">
          <Icon name="alertTriangle" size={18} className="mt-0.5" />
          <div>
            <p className="font-semibold">A few things need your attention</p>
            <ul className="mt-1 space-y-0.5">
              {Number(s.members_pending) > 0 && (
                <li><Link href="/admin/members?status=pending" className="link">{s.members_pending} member(s)</Link> waiting for approval.</li>
              )}
              {Number(s.pending_loans) > 0 && (
                <li><Link href="/admin/loans" className="link">{s.pending_loans} loan request(s)</Link> waiting for a decision.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <StatGrid cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active members" value={s.members_active ?? 0} icon="users" />
        <Stat label="Total savings" value={naira(s.total_savings)} icon="wallet" />
        <Stat label="Collected this month" value={naira(s.month_collections)} tone="text-ok-700" icon="trendingUp" />
        <Stat label="Active loans" value={s.active_loans ?? 0} icon="bank" />
        <Stat label="Loans outstanding" value={naira(s.outstanding_loans)} icon="receipt" />
        <Stat label="Awaiting claim" value={s.members_unclaimed ?? 0} icon="clock" />
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-adire-900">Collections, last 6 months</h2>
            <Icon name="chart" size={18} className="text-adire-300" />
          </div>
          {monthly.length === 0 ? (
            <EmptyState
              compact
              icon="chart"
              title="No collections yet"
              description="Record a payment or share your cooperative link to get started."
            />
          ) : (
            <div className="mt-4">
              <BarChart
                items={monthly.map((m) => ({ label: m.month, value: Number(m.total) }))}
                format={naira}
                label="Monthly collections"
              />
            </div>
          )}
        </section>

        <section className="panel p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-adire-900">Recent payments</h2>
            <Link href="/admin/payments" className="link whitespace-nowrap text-xs">View all</Link>
          </div>
          {(recent || []).length === 0 ? (
            <EmptyState
              compact
              icon="receipt"
              title="No payments yet"
              description="Record one, or share your cooperative link so members can pay online."
              action={<Link href="/admin/payments/record" className="btn-primary btn-sm">Record a payment</Link>}
            />
          ) : (
            <DataTable caption="The eight most recent payments" className="mt-2">
              <thead><tr><th scope="col">Member</th><th scope="col" className="text-right">Amount</th><th scope="col">Channel</th><th scope="col">Status</th><th scope="col">Date</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td>{t.members?.full_name}<span className="block text-xs text-ink/70">{t.members?.member_no}</span></td>
                    <td className="text-right">{naira(t.amount)}</td>
                    <td className="capitalize">{t.channel}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{formatDate(t.paid_at || t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>
    </>
  );
}
