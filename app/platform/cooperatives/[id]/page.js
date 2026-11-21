import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import Stat, { StatGrid } from '@/components/Stat';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';
import { naira, formatDate } from '@/lib/format';
import { setTenantStatus } from '@/app/platform/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cooperative details' };

export default async function CooperativeDetail(props) {
  const params = await props.params;
  const svc = createServiceClient();
  const all = await must(svc.rpc('platform_cooperatives'), 'platform cooperatives');
  const c = (all || []).find((x) => x.id === params.id);
  if (!c) notFound();

  const [members, staff, logs] = await Promise.all([
    await must(
      svc.from('members').select('id, member_no, full_name, status, created_at').eq('tenant_id', c.id).order('member_no').limit(500),
      'members',
    ),
    await must(
      svc.from('profiles').select('id, full_name, role').eq('tenant_id', c.id).in('role', ['admin', 'bookkeeper']),
      'staff',
    ),
    await must(
      svc.from('audit_logs').select('id, action, created_at').eq('tenant_id', c.id).order('created_at', { ascending: false }).limit(15),
      'activity log',
    ),
  ]);

  return (
    <>
      <PageHeader title={c.name} intro={`Member link: /c/${c.slug} · registered ${formatDate(c.created_at)}`} icon="building">
        <Link href={`/c/${c.slug}`} target="_blank" rel="noopener noreferrer" className="btn-quiet"><Icon name="externalLink" size={16} /> View member page</Link>
        <Link href="/platform/cooperatives" className="btn-quiet"><Icon name="building" size={16} /> All cooperatives</Link>
        <ActionForm action={setTenantStatus}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={c.status === 'active' ? 'suspended' : 'active'} />
          <SubmitButton className={c.status === 'active' ? 'btn-danger' : 'btn-primary'}>
            <Icon name={c.status === 'active' ? 'lock' : 'checkCircle'} size={16} /> {c.status === 'active' ? 'Suspend cooperative' : 'Reactivate cooperative'}
          </SubmitButton>
        </ActionForm>
      </PageHeader>

      <StatGrid cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Status" value={<StatusBadge status={c.status} />} icon="shield" />
        <Stat label="Members" value={`${c.members_active} / ${c.members_total}`} icon="users" />
        <Stat label="Savings" value={naira(c.total_savings)} icon="wallet" />
        <Stat label="Transacted" value={naira(c.total_transacted)} tone="text-ok-700" icon="trendingUp" />
        <Stat label="Fees earned" value={naira(c.fees_earned)} tone="text-ok-700" icon="receipt" />
        <Stat label="Payout account" value={<span className="text-base font-semibold">{c.payout_set ? (c.bank_name || 'Set') : 'Not set'}</span>} icon="bank" />
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="users" size={18} className="text-accent-500" /> Members</h2>
          {(members || []).length === 0 ? (
            <EmptyState compact icon="users" title="No members yet" description="Members will appear here once they are added or join." />
          ) : (
            <div className="mt-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <DataTable caption="Members of this cooperative, with status and join date">
                <thead><tr><th scope="col">No.</th><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
                <tbody>
                  {(members || []).map((m) => <tr key={m.id}><td>{m.member_no}</td><td>{m.full_name}</td><td><StatusBadge status={m.status} /></td><td>{formatDate(m.created_at)}</td></tr>)}
                </tbody>
              </DataTable>
            </div>
          )}
          {(members || []).length > 0 && <p className="mt-2 text-xs text-ink/75">Showing first {members.length} members (up to 500).</p>}
        </section>
        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="userPlus" size={18} className="text-accent-500" /> Staff</h2>
            {(staff || []).length === 0 ? (
              <EmptyState compact icon="userPlus" title="No staff yet" />
            ) : (
              <ul className="mt-2 divide-y divide-rule text-sm">{(staff || []).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.full_name}</span><span className="capitalize text-ink/75">{p.role}</span></li>)}</ul>
            )}
          </section>
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="clock" size={18} className="text-accent-500" /> Recent activity</h2>
            {(logs || []).length === 0 ? (
              <EmptyState compact icon="clock" title="Nothing yet" description="Actions for this cooperative will appear here." />
            ) : (
              <>
                <ul className="mt-2 divide-y divide-rule text-sm">
                  {(logs || []).map((l) => <li key={l.id} className="flex justify-between gap-2 py-2"><span>{l.action}</span><span className="text-xs text-ink/75">{formatDate(l.created_at)}</span></li>)}
                </ul>
                <p className="mt-2 text-xs text-ink/75">Showing first {logs.length} events (up to 15).</p>
              </>
            )}
          </section>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink/75">Member names and statuses are shown for oversight. Individual balances and passbooks are not exposed to the platform owner.</p>
    </>
  );
}
