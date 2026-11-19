import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import BarChart from '@/components/BarChart';
import { createServiceClient } from '@/lib/supabase/service';
import { naira, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const n = (v) => Number(v || 0).toLocaleString('en-NG');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className={`num mt-1 font-display text-2xl font-bold ${tone || 'text-adire-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

export default async function PlatformOverview() {
  const svc = createServiceClient();
  const [{ data: s }, { data: v }, { data: rev }, { data: activity }, { data: newest }] = await Promise.all([
    svc.rpc('platform_stats'),
    svc.rpc('visit_stats', { p_days: 30 }),
    svc.rpc('revenue_stats', { p_days: 30 }),
    svc.from('audit_logs').select('id, action, created_at, tenants(name)').order('created_at', { ascending: false }).limit(12),
    svc.from('tenants').select('id, name, slug, created_at, status').order('created_at', { ascending: false }).limit(6),
  ]);
  const st = s || {};
  const vs = v || {};
  const rv = rev || {};
  const { data: rc } = await svc.rpc('platform_reconciliation_summary');
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
      <PageHeader title="Platform overview" intro="Everything happening across every cooperative on CoopLedger." />

      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Cooperatives" value={n(st.coops_total)} sub={`${n(st.coops_active)} active · ${n(st.coops_suspended)} suspended`} />
        <Kpi label="Members" value={n(st.members_total)} sub={`${n(st.members_active)} active · ${n(st.members_pending)} pending · ${n(st.members_unclaimed)} unclaimed`} />
        <Kpi label="Total transacted" value={naira(st.total_transacted)} sub={`${n(st.txn_count)} successful payments`} tone="text-ok-700" />
        <Kpi label="This month" value={naira(st.month_transacted)} sub={`Today: ${naira(st.today_transacted)}`} tone="text-ok-700" />
        <Kpi label="Online (Paystack)" value={naira(st.online_total)} sub="auto-reconciled" />
        <Kpi label="Cash / transfer" value={naira(st.manual_total)} sub="recorded by bookkeepers" />
        <Kpi label="Savings held in passbooks" value={naira(st.total_savings)} />
        <Kpi label="Loans outstanding" value={naira(st.loans_outstanding)} sub={`${n(st.loans_active)} active loans`} />
        <Kpi label="Page views (30 days)" value={n(vs.views)} sub={`${n(vs.views_today)} today`} />
        <Kpi label="Visitors today" value={n(vs.unique_today)} sub="unique, anonymous" />
        <Kpi label="Staff accounts" value={n(st.staff_accounts)} sub="admins and bookkeepers" />
        <Kpi label="Webhooks processed" value={n(st.webhook_events)} sub="Paystack events" />
      </div>

      <section className="panel mt-5 grid grid-cols-2 lg:grid-cols-4" aria-label="Revenue">
        <Kpi label="Net revenue (all time)" value={naira(rv.all_net)} sub="your fees after Paystack costs" tone="text-ok-700" />
        <Kpi label="Gross fees earned" value={naira(rv.all_gross)} sub={`on ${naira(rv.all_online_volume)} online`} />
        <Kpi label="Net revenue this month" value={naira(rv.month_net)} sub={`today: ${naira(rv.today_net)}`} tone="text-ok-700" />
        <div className="flex items-center px-5 py-4"><Link href="/platform/revenue" className="btn-quiet btn-sm">Open revenue report</Link></div>
      </section>

      <section className="panel mt-5 grid grid-cols-2 lg:grid-cols-4" aria-label="Reconciliation">
        <Kpi label="Payments reconciled" value={n(rcs.total)} sub="online payments with a record" />
        <Kpi label="Matched or auto-resolved" value={n(Number(rcs.by_status?.AUTO_MATCHED || 0) + Number(rcs.by_status?.AUTO_RESOLVED || 0))} sub="no human action needed" tone="text-ok-700" />
        <Kpi label="Needing attention" value={n(rcs.needs_attention)} sub="needs review or unresolved" tone={Number(rcs.needs_attention) > 0 ? 'text-bad-700' : undefined} />
        <Kpi label="Unmatched early events" value={n(rcs.unmatched_events)} sub="held until their payment appears" />
      </section>

      {attention.length > 0 && (
        <section className="mt-5 rounded-xl bg-marigold-100 px-5 py-4" aria-label="Needs attention">
          <h2 className="font-display text-base font-bold text-marigold-700">Needs attention</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-marigold-700">{attention.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Money transacted, last 12 months</h2>
          <div className="mt-4"><BarChart items={monthly.map((m) => ({ label: m.month.split(' ')[0], value: Number(m.transacted) }))} format={naira} label="Monthly amount transacted" /></div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Page views, last 30 days</h2>
          <p className="text-xs text-ink/60">Light bar = views, dark bar = unique visitors. <Link href="/platform/visitors" className="font-semibold text-adire-700 underline">Full analytics</Link></p>
          <div className="mt-3"><BarChart thin height={140} items={(vs.daily || []).map((d) => ({ label: d.date, value: d.views, value2: d.uniques }))} label="Daily page views" /></div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">New cooperatives and members per month</h2>
          <div className="table-wrap mt-2">
            <table className="tbl num">
              <thead><tr><th>Month</th><th className="text-right">New cooperatives</th><th className="text-right">New members</th></tr></thead>
              <tbody>{monthly.slice(-6).reverse().map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right">{m.new_coops}</td><td className="text-right">{m.new_members}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Top cooperatives by amount transacted</h2>
          <div className="table-wrap mt-2">
            <table className="tbl num">
              <thead><tr><th>Cooperative</th><th className="text-right">Payments</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {(st.top_coops || []).map((c) => (
                  <tr key={c.id}><td><Link href={`/platform/cooperatives/${c.id}`} className="font-semibold text-adire-700 underline">{c.name}</Link></td><td className="text-right">{c.txns}</td><td className="text-right">{naira(c.total)}</td></tr>
                ))}
                {(st.top_coops || []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-ink/60">No cooperatives yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Newest cooperatives</h2>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {(newest || []).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <Link href={`/platform/cooperatives/${t.id}`} className="font-semibold text-adire-700 underline">{t.name}</Link>
                <span className="text-ink/60">{formatDate(t.created_at)}{t.status === 'suspended' ? ' · suspended' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Recent activity</h2>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {(activity || []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="font-medium">{a.action}</span> <span className="text-ink/60">· {a.tenants?.name}</span></span>
                <span className="shrink-0 text-xs text-ink/50">{formatDate(a.created_at)}</span>
              </li>
            ))}
            {(activity || []).length === 0 && <li className="py-4 text-ink/60">Nothing yet.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
