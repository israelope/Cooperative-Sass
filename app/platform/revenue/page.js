import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import BarChart from '@/components/BarChart';
import { createServiceClient } from '@/lib/supabase/service';
import { feeConfig } from '@/lib/fees';
import { naira } from '@/lib/format';

export const dynamic = 'force-dynamic';
const RANGES = [30, 90, 365];
const pct = (a, b) => (Number(b) > 0 ? `${((Number(a) / Number(b)) * 100).toFixed(2)}%` : '–');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className={`num mt-1 font-display text-2xl font-bold ${tone || 'text-adire-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

export default async function RevenuePage({ searchParams }) {
  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const { data } = await createServiceClient().rpc('revenue_stats', { p_days: days });
  const r = data || {};
  const cfg = feeConfig();
  const monthly = r.monthly || [];

  return (
    <>
      <PageHeader title="Revenue" intro="Fees your platform earns on online payments. Cash and transfer entries carry no fee.">
        {RANGES.map((d) => <Link key={d} href={`/platform/revenue?days=${d}`} className={d === days ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}>{d} days</Link>)}
        <a href={`/api/platform/revenue?days=${days}`} className="btn-gold btn-sm">Download fee ledger (CSV)</a>
      </PageHeader>

      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Net revenue (all time)" value={naira(r.all_net)} sub="fees kept after Paystack costs you bear" tone="text-ok-700" />
        <Kpi label="Gross fees (all time)" value={naira(r.all_gross)} sub={`on ${naira(r.all_online_volume)} of online payments`} />
        <Kpi label="Paystack fees you bear" value={naira(r.all_borne)} sub={cfg.bearer === 'account' ? 'platform pays Paystack' : 'cooperatives pay Paystack'} />
        <Kpi label="Effective fee rate" value={pct(r.all_gross, r.all_online_volume)} sub={`${Number(r.all_online_count || 0).toLocaleString('en-NG')} online payments`} />
        <Kpi label="This month (net)" value={naira(r.month_net)} sub={`gross ${naira(r.month_gross)}`} tone="text-ok-700" />
        <Kpi label="Today (net)" value={naira(r.today_net)} sub={`gross ${naira(r.today_gross)}`} />
        <Kpi label={`Last ${days} days (net)`} value={naira(r.range_net)} sub={`gross ${naira(r.range_gross)} · ${Number(r.range_payments || 0).toLocaleString('en-NG')} payments`} tone="text-ok-700" />
        <Kpi label="Fee-free volume" value={naira(r.fee_free_volume)} sub="cash and transfer entries" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Net revenue per month</h2>
          <div className="mt-4"><BarChart items={monthly.map((m) => ({ label: m.month.split(' ')[0], value: Math.max(0, Number(m.net)) }))} format={naira} label="Monthly net revenue" /></div>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Gross fees per day, last {days} days</h2>
          <div className="mt-4"><BarChart thin height={160} items={(r.daily || []).map((d) => ({ label: d.date, value: Number(d.gross) }))} format={naira} label="Daily gross fees" /></div>
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-lg font-bold text-adire-900">Month by month</h2>
        <div className="table-wrap mt-2">
          <table className="tbl num">
            <thead><tr><th>Month</th><th className="text-right">Online payments</th><th className="text-right">Online volume</th><th className="text-right">Gross fees</th><th className="text-right">Paystack fees borne</th><th className="text-right">Net revenue</th></tr></thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month}><td>{m.month}</td><td className="text-right">{m.payments}</td><td className="text-right">{naira(m.online_volume)}</td><td className="text-right">{naira(m.gross)}</td><td className="text-right">{naira(m.borne)}</td><td className="text-right font-semibold">{naira(m.net)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="text-lg font-bold text-adire-900">Revenue by cooperative, last {days} days</h2>
        <div className="table-wrap mt-2">
          <table className="tbl num">
            <thead><tr><th>Cooperative</th><th className="text-right">Online payments</th><th className="text-right">Online volume</th><th className="text-right">Gross fees</th><th className="text-right">Paystack fees borne</th><th className="text-right">Net revenue</th></tr></thead>
            <tbody>
              {(r.by_coop || []).map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/platform/cooperatives/${c.id}`} className="font-semibold text-adire-700 underline">{c.name}</Link></td>
                  <td className="text-right">{c.payments}</td><td className="text-right">{naira(c.online_volume)}</td><td className="text-right">{naira(c.gross)}</td><td className="text-right">{naira(c.borne)}</td><td className="text-right font-semibold">{naira(c.net)}</td>
                </tr>
              ))}
              {(r.by_coop || []).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink/60">No cooperatives yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 max-w-3xl space-y-2 rounded-xl bg-adire-50 p-5 text-sm text-ink/80">
        <h2 className="font-display text-base font-bold text-adire-900">How these numbers are worked out</h2>
        <p><b>Current fee setting:</b> {naira(cfg.flatKobo / 100)} flat + {cfg.percent}% of each online payment (never more than half the payment). Paystack's own processing fee is paid by {cfg.bearer === 'account' ? 'the platform' : 'the cooperative'}. Change this with <code>PLATFORM_FEE_KOBO</code>, <code>PLATFORM_FEE_PERCENT</code> and <code>PAYSTACK_BEARER</code> in your environment variables.</p>
        <p><b>Gross fees</b> are the platform fee recorded on each successful online payment. <b>Net revenue</b> = gross fees minus the Paystack fees the platform bears (zero when cooperatives bear them).</p>
        <p>These are your platform's own records of what it routed to itself through Paystack. Reconcile them with your Paystack settlements. Payments made before fee tracking was added show a fee of zero. Subscription plans are not billed by this version, so revenue here is transaction fees only.</p>
      </section>
    </>
  );
}
