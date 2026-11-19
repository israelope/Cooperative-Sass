import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import BarChart from '@/components/BarChart';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
const RANGES = [7, 30, 90];

export default async function VisitorsPage({ searchParams }) {
  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const { data: v } = await createServiceClient().rpc('visit_stats', { p_days: days });
  const s = v || {};
  const totalDevices = (s.devices || []).reduce((a, d) => a + Number(d.views), 0) || 1;

  return (
    <>
      <PageHeader title="Visitors" intro="Anonymous page-view analytics. No cookies are used and no IP addresses are stored.">
        {RANGES.map((r) => <Link key={r} href={`/platform/visitors?days=${r}`} className={r === days ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}>{r} days</Link>)}
      </PageHeader>

      <div className="panel grid grid-cols-2 sm:grid-cols-4">
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Page views ({days} d)</p><p className="num mt-1 font-display text-2xl font-bold">{Number(s.views || 0).toLocaleString('en-NG')}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Views today</p><p className="num mt-1 font-display text-2xl font-bold">{Number(s.views_today || 0).toLocaleString('en-NG')}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Unique visitors today</p><p className="num mt-1 font-display text-2xl font-bold">{Number(s.unique_today || 0).toLocaleString('en-NG')}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Visitor-days ({days} d)</p><p className="num mt-1 font-display text-2xl font-bold">{Number(s.visitor_days || 0).toLocaleString('en-NG')}</p><p className="text-xs text-ink/50">unique visitors summed per day</p></div>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-lg font-bold text-adire-900">Daily traffic</h2>
        <p className="text-xs text-ink/60">Light bar = page views, dark bar = unique visitors that day.</p>
        <div className="mt-3"><BarChart thin height={180} items={(s.daily || []).map((d) => ({ label: d.date, value: d.views, value2: d.uniques }))} label="Daily page views" /></div>
        <div className="mt-1 flex justify-between text-xs text-ink/50"><span>{s.daily?.[0]?.date}</span><span>{s.daily?.[s.daily.length - 1]?.date}</span></div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Top pages</h2>
          <table className="tbl num mt-2"><tbody>{(s.top_pages || []).map((p) => <tr key={p.path}><td className="font-mono text-xs">{p.path}</td><td className="text-right">{p.views}</td></tr>)}
            {(s.top_pages || []).length === 0 && <tr><td className="py-4 text-ink/60">No visits recorded yet.</td></tr>}</tbody></table>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Devices</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {(s.devices || []).map((d) => (
              <li key={d.device}>
                <div className="flex justify-between"><span className="capitalize">{d.device}</span><span className="num">{Math.round((Number(d.views) / totalDevices) * 100)}%</span></div>
                <div className="mt-1 h-2 rounded bg-adire-100"><div className="h-2 rounded bg-adire-600" style={{ width: `${(Number(d.views) / totalDevices) * 100}%` }} /></div>
              </li>
            ))}
            {(s.devices || []).length === 0 && <li className="text-ink/60">No data yet.</li>}
          </ul>
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold text-adire-900">Most visited cooperative pages</h2>
          <table className="tbl num mt-2"><tbody>{(s.coop_pages || []).map((p) => <tr key={p.tenant_slug}><td className="font-mono text-xs">/c/{p.tenant_slug}</td><td className="text-right">{p.views}</td></tr>)}
            {(s.coop_pages || []).length === 0 && <tr><td className="py-4 text-ink/60">No data yet.</td></tr>}</tbody></table>
        </section>
      </div>
      <p className="mt-4 max-w-prose text-xs text-ink/60">Bots, the platform dashboard and API calls are excluded. A visitor is identified only by a one-way hash that changes every day, so the same person on two days counts as two visitor-days.</p>
    </>
  );
}
