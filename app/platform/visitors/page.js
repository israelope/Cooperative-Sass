import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import Stat, { StatGrid } from '@/components/Stat';
import BarChart from '@/components/BarChart';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Visitors' };
const RANGES = [7, 30, 90];

export default async function VisitorsPage(props) {
  const searchParams = await props.searchParams;
  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const s = must(await createServiceClient().rpc('visit_stats', { p_days: days }), 'visit statistics') || {};
  const totalDevices = (s.devices || []).reduce((a, d) => a + Number(d.views), 0) || 1;

  return (
    <>
      <PageHeader title="Visitors" intro="Anonymous page-view analytics. No cookies are used and no IP addresses are stored." icon="eye">
        {RANGES.map((r) => (
          <Link key={r} href={`/platform/visitors?days=${r}`} aria-current={r === days ? 'page' : undefined} className={r === days ? 'btn-primary btn-sm' : 'btn-quiet btn-sm'}>
            <Icon name="calendar" size={16} /> {r} days
          </Link>
        ))}
      </PageHeader>

      <StatGrid cols="grid-cols-2 sm:grid-cols-4">
        <Stat label={`Page views (${days} d)`} value={Number(s.views || 0).toLocaleString('en-NG')} icon="eye" />
        <Stat label="Views today" value={Number(s.views_today || 0).toLocaleString('en-NG')} icon="calendar" />
        <Stat label="Unique visitors today" value={Number(s.unique_today || 0).toLocaleString('en-NG')} icon="users" />
        <Stat label={`Visitor-days (${days} d)`} value={Number(s.visitor_days || 0).toLocaleString('en-NG')} sub="unique visitors summed per day" icon="trendingUp" />
      </StatGrid>

      <section className="panel mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="chart" size={18} className="text-adire-500" /> Daily traffic</h2>
        <p className="mt-1 text-xs text-ink/75">Light bar = page views, dark bar = unique visitors that day.</p>
        {(s.daily || []).length === 0 ? (
          <EmptyState compact icon="chart" title="No visits recorded yet" description="Traffic will appear once visitors open a page." />
        ) : (
          <>
            <div className="mt-3"><BarChart thin height={180} items={(s.daily || []).map((d) => ({ label: d.date, value: d.views, value2: d.uniques }))} label="Daily page views" /></div>
            <div className="mt-1 flex justify-between text-xs text-ink/75"><span>{s.daily?.[0]?.date}</span><span>{s.daily?.[s.daily.length - 1]?.date}</span></div>
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="fileText" size={18} className="text-adire-500" /> Top pages</h2>
          {(s.top_pages || []).length === 0 ? (
            <EmptyState compact icon="fileText" title="No visits recorded yet" />
          ) : (
            <DataTable caption="Most viewed pages" className="mt-2">
              <thead><tr><th scope="col">Page</th><th scope="col" className="text-right">Views</th></tr></thead>
              <tbody>{(s.top_pages || []).map((p) => <tr key={p.path}><td className="font-mono text-xs">{p.path}</td><td className="text-right">{p.views}</td></tr>)}</tbody>
            </DataTable>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="dashboard" size={18} className="text-adire-500" /> Devices</h2>
          {(s.devices || []).length === 0 ? (
            <EmptyState compact icon="dashboard" title="No device data yet" />
          ) : (
            <ul className="mt-2 space-y-3 text-sm">
              {(s.devices || []).map((d) => {
                const pct = Math.round((Number(d.views) / totalDevices) * 100);
                return (
                  <li key={d.device}>
                    <div className="flex justify-between"><span className="capitalize">{d.device}</span><span className="num">{pct}%</span></div>
                    <div
                      className="mt-1 h-2 w-full rounded bg-adire-100"
                      role="progressbar"
                      aria-label={`${d.device} share of page views`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div className="h-full rounded bg-adire-600" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="building" size={18} className="text-adire-500" /> Most visited cooperative pages</h2>
          {(s.coop_pages || []).length === 0 ? (
            <EmptyState compact icon="building" title="No cooperative page visits yet" />
          ) : (
            <DataTable caption="Most visited cooperative pages" className="mt-2">
              <thead><tr><th scope="col">Page</th><th scope="col" className="text-right">Views</th></tr></thead>
              <tbody>{(s.coop_pages || []).map((p) => <tr key={p.tenant_slug}><td className="font-mono text-xs">/c/{p.tenant_slug}</td><td className="text-right">{p.views}</td></tr>)}</tbody>
            </DataTable>
          )}
        </section>
      </div>
      <p className="mt-4 max-w-prose text-xs text-ink/75">Bots, the platform dashboard and API calls are excluded. A visitor is identified only by a one-way hash that changes every day, so the same person on two days counts as two visitor-days.</p>
    </>
  );
}
