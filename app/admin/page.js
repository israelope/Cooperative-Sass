import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { requireStaff } from '@/lib/auth';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Stat({ label, value, tone }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className={`num mt-1 font-display text-2xl font-bold ${tone || 'text-adire-900'}`}>{value}</p>
    </div>
  );
}

export default async function AdminDashboard() {
  const { supabase, profile } = await requireStaff();
  const [{ data: stats }, { data: recent }] = await Promise.all([
    supabase.rpc('admin_stats'),
    supabase.from('transactions').select('id, amount, channel, status, created_at, paid_at, members(full_name, member_no)').order('created_at', { ascending: false }).limit(8),
  ]);
  const s = stats || {};
  const monthly = s.monthly || [];
  const max = Math.max(1, ...monthly.map((m) => Number(m.total)));
  const needsAttention = Number(s.members_pending || 0) + Number(s.pending_loans || 0);

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name?.split(' ')[0] || 'there'}`} intro={`Overview of ${profile.tenants?.name}.`}>
        <Link href="/admin/payments/record" className="btn-gold">Record a payment</Link>
        <Link href="/admin/members" className="btn-quiet">Members</Link>
      </PageHeader>

      {needsAttention > 0 && (
        <div className="mb-5 rounded-xl bg-marigold-100 px-4 py-3 text-sm text-marigold-700">
          {Number(s.members_pending) > 0 && <span><Link href="/admin/members?status=pending" className="font-semibold underline">{s.members_pending} member(s)</Link> waiting for approval. </span>}
          {Number(s.pending_loans) > 0 && <span><Link href="/admin/loans" className="font-semibold underline">{s.pending_loans} loan request(s)</Link> waiting for a decision.</span>}
        </div>
      )}

      <div className="panel grid grid-cols-2 divide-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        <Stat label="Active members" value={s.members_active ?? 0} />
        <Stat label="Total savings" value={naira(s.total_savings)} />
        <Stat label="Collected this month" value={naira(s.month_collections)} tone="text-ok-700" />
        <Stat label="Active loans" value={s.active_loans ?? 0} />
        <Stat label="Loans outstanding" value={naira(s.outstanding_loans)} />
        <Stat label="Awaiting claim" value={s.members_unclaimed ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-bold text-adire-900">Collections, last 6 months</h2>
          <div className="mt-4 flex h-40 items-end gap-3" role="img" aria-label="Bar chart of monthly collections">
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-adire-600" style={{ height: `${Math.max(3, (Number(m.total) / max) * 100)}%` }} title={naira(m.total)} />
                <span className="text-xs text-ink/60">{m.month}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5 lg:col-span-3">
          <h2 className="text-lg font-bold text-adire-900">Recent payments</h2>
          {(recent || []).length === 0 ? (
            <p className="mt-3 text-sm text-ink/70">No payments yet. Record one or share your cooperative link so members can pay online.</p>
          ) : (
            <div className="table-wrap mt-2">
              <table className="tbl num">
                <thead><tr><th>Member</th><th className="text-right">Amount</th><th>Channel</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id}>
                      <td>{t.members?.full_name}<span className="block text-xs text-ink/50">{t.members?.member_no}</span></td>
                      <td className="text-right">{naira(t.amount)}</td>
                      <td className="capitalize">{t.channel}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>{formatDate(t.paid_at || t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
