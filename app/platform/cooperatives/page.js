import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';
import { setTenantStatus } from '@/app/platform/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cooperatives' };

export default async function CooperativesPage({ searchParams }) {
  const q = String(searchParams.q || '').trim().toLowerCase();
  const all = must(await createServiceClient().rpc('platform_cooperatives'), 'platform cooperatives') || [];
  const coops = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.admin_name || '').toLowerCase().includes(q)) : all;

  return (
    <>
      <PageHeader title="Cooperatives" intro={`${all.length} registered. Suspending a cooperative locks all its users out immediately.`} icon="building" />
      <form method="get" className="mb-4 flex items-end gap-3">
        <div className="grow sm:max-w-xs"><label htmlFor="q" className="label">Search name, link or admin</label><input id="q" name="q" defaultValue={q} className="input" /></div>
        <button className="btn-quiet"><Icon name="search" size={16} /> Search</button>
      </form>
      <div className="panel p-2">
        {coops.length === 0 ? (
          <EmptyState compact icon="building" title="No cooperatives match" description="Try a different search term." />
        ) : (
          <DataTable
            caption="Registered cooperatives with membership, payments and account status"
            className="[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-white"
          >
            <thead><tr><th scope="col">Cooperative</th><th scope="col">Admin</th><th scope="col" className="text-right">Members</th><th scope="col" className="text-right">Savings</th><th scope="col" className="text-right">Transacted</th><th scope="col" className="text-right">Fees earned</th><th scope="col">Last payment</th><th scope="col">Payout</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {coops.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/platform/cooperatives/${c.id}`} className="link whitespace-nowrap">{c.name}</Link><span className="block font-mono text-xs text-ink/75">/c/{c.slug}</span></td>
                  <td>{c.admin_name}</td>
                  <td className="text-right">{c.members_active}<span className="text-ink/75"> / {c.members_total}</span></td>
                  <td className="text-right">{naira(c.total_savings)}</td>
                  <td className="text-right">{naira(c.total_transacted)}</td>
                  <td className="text-right font-semibold text-ok-700">{naira(c.fees_earned)}</td>
                  <td>{c.last_payment_at ? formatDate(c.last_payment_at) : <span className="text-ink/75">none</span>}</td>
                  <td>{c.payout_set ? <span className="badge-ok">set</span> : <span className="badge-warn">not set</span>}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{formatDate(c.created_at)}</td>
                  <td>
                    <ActionForm action={setTenantStatus}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value={c.status === 'active' ? 'suspended' : 'active'} />
                      <SubmitButton className={c.status === 'active' ? 'btn-danger btn-sm' : 'btn-quiet btn-sm'}>
                        <Icon name={c.status === 'active' ? 'lock' : 'checkCircle'} size={14} /> {c.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      <p className="mt-3 text-xs text-ink/75">The table scrolls horizontally on small screens. Members column: active / total. Individual passbooks are intentionally not shown here.</p>
    </>
  );
}
