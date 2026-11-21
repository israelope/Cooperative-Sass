import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import BarChart from '@/components/BarChart';
import Stat, { StatGrid } from '@/components/Stat';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

const n = (v) => Number(v || 0).toLocaleString('en-NG');

function SectionTitle({ icon, children, link }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold text-accent-900">
        <Icon name={icon} size={17} className="text-accent-500" /> {children}
      </h2>
      {link}
    </div>
  );
}

export default async function PlatformOverview() {
  const svc = createServiceClient();
  const [s, v, rev, activity, newest, rc] = await Promise.all([
    await must(svc.rpc('platform_stats'), 'platform statistics'),
    await must(svc.rpc('visit_stats', { p_days: 30 }), 'visit statistics'),
    await must(svc.rpc('revenue_stats', { p_days: 30 }), 'revenue statistics'),
    await must(svc.from('audit_logs').select('id, action, created_at, tenants(name)').order('created_at', { ascending: false }).limit(12), 'activity log'),
    await must(svc.from('tenants').select('id, name, slug, created_at, status').order('created_at', { ascending: false }).limit(6), 'newest cooperatives'),
    await must(svc.rpc('platform_reconciliation_summary'), 'reconciliation summary'),
  ]);

  const st = s || {};
  const vs = v || {};
  const rv = rev || {};
  const rcs = rc || {};
  const monthly = st.monthly || [];
  const attention = [
    Number(st.stale_pending) > 0 && `${st.stale_pending} online payment(s) pending for over a day (possible missed webhook)`,
    Number(st.failed_7d) > 0 && `${st.failed_7d} failed payment(s) in the last 7 days`,
    Number(st.coops_no_payout) > 0 && `${st.coops_no_payout} cooperative(s) have not set a payout account`,
    Number(st.coops_no_members) > 0 && `${st.coops_no_members} cooperative(s) have no members yet`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Platform overview" intro="Everything happening across every cooperative on CoopLedger.">
        <Link href="/platform/revenue" className="btn-quiet"><Icon name="chart" size={16} /> Revenue report</Link>
      </PageHeader>

      <SectionTitle icon="dashboard">At a glance</SectionTitle>
      <StatGrid cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Cooperatives" value={n(st.coops_total)} sub={`${n(st.coops_active)} active · ${n(st.coops_suspended)} suspended`} icon="building" href="/platform/cooperatives" />
        <Stat label="Members" value={n(st.members_total)} sub={`${n(st.members_active)} active · ${n(st.members_pending)} pending`} icon="users" />
        <Stat label="Total transacted" value={naira(st.total_transacted)} sub={`${n(st.txn_count)} successful payments`} tone="text-ok-700" icon="trendingUp" />
        <Stat label="This month" value={naira(st.month_transacted)} sub={`Today: ${naira(st.today_transacted)}`} tone="text-ok-700" icon="calendar" />
        <Stat label="Online (Paystack)" value={naira(st.online_total)} sub="auto-reconciled" icon="card" />
        <Stat label="Cash / transfer" value={naira(st.manual_total)} sub="recorded by bookkeepers" icon="receipt" />
        <Stat label="Savings held" value={naira(st.total_savings)} sub="across all passbooks" icon="wallet" />
        <Stat label="Loans outstanding" value={naira(st.loans_outstanding)} sub={`${n(st.loans_active)} active loans`} icon="bank" />
        <Stat label="Page views (30 days)" value={n(vs.views)} sub={`${n(vs.views_today)} today`} icon="eye" href="/platform/visitors" />
        <Stat label="Visitors today" value={n(vs.unique_today)} sub="unique, anonymous" icon="users" />
        <Stat label="Staff accounts" value={n(st.staff_accounts)} sub="admins and bookkeepers" icon="userPlus" />
        <Stat label="Webhooks processed" value={n(st.webhook_events)} sub="Paystack events" icon="refresh" />
      </StatGrid>

      <div className="mt-8">
        <SectionTitle icon="chart" link={<Link href="/platform/revenue" className="link text-xs">Open full report</Link>}>Revenue & reconciliation</SectionTitle>
        <StatGrid cols="grid-cols-2 lg:grid-cols-4">
          <Stat label="Net revenue (all time)" value={naira(rv.all_net)} sub="your fees after Paystack costs" tone="text-ok-700" icon="trendingUp" />
          <Stat label="Gross fees earned" value={naira(rv.all_gross)} sub={`on ${naira(rv.all_online_volume)} online`} icon="wallet" />
          <Stat label="Net revenue this month" value={naira(rv.month_net)} sub={`Today: ${naira(rv.today_net)}`} tone="text-ok-700" icon="calendar" />
          <Stat label="Needing attention" value={n(rcs.needs_attention)} sub="reconciliations to review" tone={Number(rcs.needs_attention) > 0 ? 'text-bad-700' : 'text-accent-900'} icon="refresh" />
        </StatGrid>
      </div>

      {attention.length > 0 && (
        <div className="callout-warn mt-5" role="status">
          <Icon name="alertTriangle" size={18} className="mt-0.5" />
          <div>
            <p className="font-semibold">Needs attention</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{attention.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">Money transacted, last 12 months</h2>
          {monthly.length === 0 ? (
            <EmptyState compact icon="chart" title="No transactions yet" description="Charts will appear once payments are recorded." />
          ) : (
            <div className="mt-4"><BarChart items={monthly.map((m) => ({ label: m.month.split(' ')[0], value: Number(m.transacted) }))} format={naira} label="Monthly amount transacted" /></div>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">Page views, last 30 days</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/75">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-200" /> Page views</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-600" /> Unique visitors</span>
            <Link href="/platform/visitors" className="link">Full analytics</Link>
          </div>
          {(vs.daily || []).length === 0 ? (
            <EmptyState compact icon="eye" title="No visits recorded yet" />
          ) : (
            <div className="mt-3"><BarChart thin height={140} items={(vs.daily || []).map((d) => ({ label: d.date, value: d.views, value2: d.uniques }))} label="Daily page views and unique visitors" /></div>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">New cooperatives and members per month</h2>
          {monthly.length === 0 ? (
            <EmptyState compact icon="building" title="No growth data yet" />
          ) : (
            <DataTable caption="New cooperatives and members per month" className="mt-2">
              <thead><tr><th scope="col">Month</th><th scope="col" className="text-right">New cooperatives</th><th scope="col" className="text-right">New members</th></tr></thead>
              <tbody>{monthly.slice(-6).reverse().map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right">{m.new_coops}</td><td className="text-right">{m.new_members}</td></tr>)}</tbody>
            </DataTable>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">Top cooperatives by amount transacted</h2>
          {(st.top_coops || []).length === 0 ? (
            <EmptyState compact icon="building" title="No cooperatives yet" />
          ) : (
            <DataTable caption="Cooperatives ranked by amount transacted" className="mt-2">
              <thead><tr><th scope="col">Cooperative</th><th scope="col" className="text-right">Payments</th><th scope="col" className="text-right">Total</th></tr></thead>
              <tbody>
                {(st.top_coops || []).map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/platform/cooperatives/${c.id}`} className="link">{c.name}</Link></td>
                    <td className="text-right">{c.txns}</td>
                    <td className="text-right">{naira(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">Newest cooperatives</h2>
          {(newest || []).length === 0 ? (
            <EmptyState compact icon="building" title="No cooperatives yet" />
          ) : (
            <ul className="mt-2 divide-y divide-rule text-sm">
              {(newest || []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/platform/cooperatives/${t.id}`} className="link">{t.name}</Link>
                  <span className="shrink-0 text-xs text-ink/75">{formatDate(t.created_at)}{t.status === 'suspended' ? ' · suspended' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-accent-900">Recent activity</h2>
          {(activity || []).length === 0 ? (
            <EmptyState compact icon="clock" title="Nothing yet" description="Actions across cooperatives will appear here." />
          ) : (
            <ul className="mt-2 divide-y divide-rule text-sm">
              {(activity || []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="font-medium">{a.action}</span> <span className="text-ink/75">· {a.tenants?.name}</span></span>
                  <span className="shrink-0 text-xs text-ink/75">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
