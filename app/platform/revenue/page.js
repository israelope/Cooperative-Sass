import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import Stat, { StatGrid } from '@/components/Stat';
import BarChart from '@/components/BarChart';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';
import { feeConfig } from '@/lib/fees';
import { naira } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Revenue' };
const RANGES = [30, 90, 365];
const pct = (a, b) => (Number(b) > 0 ? `${((Number(a) / Number(b)) * 100).toFixed(2)}%` : '–');

export default async function RevenuePage(props) {
  const searchParams = await props.searchParams;
  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const r = (await must(createServiceClient().rpc('revenue_stats', { p_days: days }), 'revenue statistics')) || {};
  const cfg = feeConfig();
  const monthly = r.monthly || [];

  return (
    <>
      <PageHeader title="Revenue" intro="Fees your platform earns on online payments. Cash and transfer entries carry no fee." icon="trendingUp">
        {RANGES.map((d) => (
          <Link key={d} href={`/platform/revenue?days=${d}`} aria-current={d === days ? 'page' : undefined} className={d === days ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}>
            <Icon name="calendar" size={16} /> {d} days
          </Link>
        ))}
        <a href={`/api/platform/revenue?days=${days}`} className="btn-gold btn-sm"><Icon name="download" size={16} /> Download fee ledger (CSV)</a>
      </PageHeader>

      <StatGrid cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Net revenue (all time)" value={naira(r.all_net)} sub="fees kept after Paystack costs you bear" tone="text-ok-700" icon="trendingUp" />
        <Stat label="Gross fees (all time)" value={naira(r.all_gross)} sub={`on ${naira(r.all_online_volume)} of online payments`} icon="wallet" />
        <Stat label="Paystack fees you bear" value={naira(r.all_borne)} sub={cfg.bearer === 'account' ? 'platform pays Paystack' : 'cooperatives pay Paystack'} icon="card" />
        <Stat label="Effective fee rate" value={pct(r.all_gross, r.all_online_volume)} sub={`${Number(r.all_online_count || 0).toLocaleString('en-NG')} online payments`} icon="chart" />
        <Stat label="This month (net)" value={naira(r.month_net)} sub={`gross ${naira(r.month_gross)}`} tone="text-ok-700" icon="calendar" />
        <Stat label="Today (net)" value={naira(r.today_net)} sub={`gross ${naira(r.today_gross)}`} icon="clock" />
        <Stat label={`Last ${days} days (net)`} value={naira(r.range_net)} sub={`gross ${naira(r.range_gross)} · ${Number(r.range_payments || 0).toLocaleString('en-NG')} payments`} tone="text-ok-700" icon="trendingUp" />
        <Stat label="Fee-free volume" value={naira(r.fee_free_volume)} sub="cash and transfer entries" icon="receipt" />
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="chart" size={18} className="text-accent-500" /> Net revenue per month</h2>
          {monthly.length === 0 ? (
            <EmptyState compact icon="chart" title="No monthly revenue yet" description="Fees will appear here after online payments are recorded." />
          ) : (
            <div className="mt-4"><BarChart items={monthly.map((m) => ({ label: m.month.split(' ')[0], value: Math.max(0, Number(m.net)) }))} format={naira} label="Monthly net revenue" /></div>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="trendingUp" size={18} className="text-accent-500" /> Gross fees per day, last {days} days</h2>
          {(r.daily || []).length === 0 ? (
            <EmptyState compact icon="chart" title="No daily fees yet" description="Daily fee totals will appear once online payments start." />
          ) : (
            <div className="mt-4"><BarChart thin height={160} items={(r.daily || []).map((d) => ({ label: d.date, value: Number(d.gross) }))} format={naira} label="Daily gross fees" /></div>
          )}
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="calendar" size={18} className="text-accent-500" /> Month by month</h2>
        {monthly.length === 0 ? (
          <EmptyState compact icon="calendar" title="No monthly records yet" />
        ) : (
          <DataTable caption="Revenue and fees by month" className="mt-2">
            <thead><tr><th scope="col">Month</th><th scope="col" className="text-right">Online payments</th><th scope="col" className="text-right">Online volume</th><th scope="col" className="text-right">Gross fees</th><th scope="col" className="text-right">Paystack fees borne</th><th scope="col" className="text-right">Net revenue</th></tr></thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month}><td>{m.month}</td><td className="text-right">{m.payments}</td><td className="text-right">{naira(m.online_volume)}</td><td className="text-right">{naira(m.gross)}</td><td className="text-right">{naira(m.borne)}</td><td className="text-right font-semibold">{naira(m.net)}</td></tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="building" size={18} className="text-accent-500" /> Revenue by cooperative, last {days} days</h2>
        {(r.by_coop || []).length === 0 ? (
          <EmptyState compact icon="building" title="No cooperatives yet" description="Fees by cooperative will appear here once cooperatives start receiving online payments." />
        ) : (
          <DataTable caption="Revenue and fees by cooperative" className="mt-2">
            <thead><tr><th scope="col">Cooperative</th><th scope="col" className="text-right">Online payments</th><th scope="col" className="text-right">Online volume</th><th scope="col" className="text-right">Gross fees</th><th scope="col" className="text-right">Paystack fees borne</th><th scope="col" className="text-right">Net revenue</th></tr></thead>
            <tbody>
              {(r.by_coop || []).map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/platform/cooperatives/${c.id}`} className="link whitespace-nowrap">{c.name}</Link></td>
                  <td className="text-right">{c.payments}</td><td className="text-right">{naira(c.online_volume)}</td><td className="text-right">{naira(c.gross)}</td><td className="text-right">{naira(c.borne)}</td><td className="text-right font-semibold">{naira(c.net)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <div className="callout-info mt-6 max-w-3xl">
        <Icon name="info" size={18} className="mt-0.5" />
        <div className="min-w-0 space-y-2 text-sm">
          <h2 className="font-display text-base font-bold text-accent-900">How these numbers are worked out</h2>
          <p><b>Current fee setting:</b> {naira(cfg.flatKobo / 100)} flat + {cfg.percent}% of each online payment (never more than half the payment). Paystack&apos;s own processing fee is paid by {cfg.bearer === 'account' ? 'the platform' : 'the cooperative'}. Change this with <code>PLATFORM_FEE_KOBO</code>, <code>PLATFORM_FEE_PERCENT</code> and <code>PAYSTACK_BEARER</code> in your environment variables.</p>
          <p><b>Gross fees</b> are the platform fee recorded on each successful online payment. <b>Net revenue</b> = gross fees minus the Paystack fees the platform bears (zero when cooperatives bear them).</p>
          <p>These are your platform&apos;s own records of what it routed to itself through Paystack. Reconcile them with your Paystack settlements. Payments made before fee tracking was added show a fee of zero. Subscription plans are not billed by this version, so revenue here is transaction fees only.</p>
        </div>
      </div>
    </>
  );
}
