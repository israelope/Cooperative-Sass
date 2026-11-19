import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { createServiceClient } from '@/lib/supabase/service';
import { naira, formatDate } from '@/lib/format';
import { setTenantStatus } from '@/app/platform/actions';

export const dynamic = 'force-dynamic';

export default async function CooperativeDetail({ params }) {
  const svc = createServiceClient();
  const { data: all } = await svc.rpc('platform_cooperatives');
  const c = (all || []).find((x) => x.id === params.id);
  if (!c) notFound();

  const [{ data: members }, { data: staff }, { data: logs }] = await Promise.all([
    svc.from('members').select('id, member_no, full_name, status, created_at').eq('tenant_id', c.id).order('member_no').limit(500),
    svc.from('profiles').select('id, full_name, role').eq('tenant_id', c.id).in('role', ['admin', 'bookkeeper']),
    svc.from('audit_logs').select('id, action, created_at').eq('tenant_id', c.id).order('created_at', { ascending: false }).limit(15),
  ]);

  return (
    <>
      <PageHeader title={c.name} intro={`Member link: /c/${c.slug} · registered ${formatDate(c.created_at)}`}>
        <Link href="/platform/cooperatives" className="btn-quiet">All cooperatives</Link>
        <ActionForm action={setTenantStatus}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={c.status === 'active' ? 'suspended' : 'active'} />
          <SubmitButton className={c.status === 'active' ? 'btn-danger' : 'btn-primary'}>{c.status === 'active' ? 'Suspend cooperative' : 'Reactivate cooperative'}</SubmitButton>
        </ActionForm>
      </PageHeader>

      <div className="panel grid grid-cols-2 sm:grid-cols-6">
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Status</p><p className="mt-1"><StatusBadge status={c.status} /></p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Members</p><p className="num mt-1 font-display text-xl font-bold">{c.members_active} / {c.members_total}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Savings</p><p className="num mt-1 font-display text-xl font-bold">{naira(c.total_savings)}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Transacted</p><p className="num mt-1 font-display text-xl font-bold text-ok-700">{naira(c.total_transacted)}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Fees earned</p><p className="num mt-1 font-display text-xl font-bold text-ok-700">{naira(c.fees_earned)}</p></div>
        <div className="px-5 py-4"><p className="text-sm text-ink/60">Payout account</p><p className="mt-1 text-sm font-semibold">{c.payout_set ? (c.bank_name || 'Set') : 'Not set'}</p></div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-bold text-adire-900">Members</h2>
          <div className="table-wrap mt-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tbl num">
              <thead><tr><th>No.</th><th>Name</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>
                {(members || []).map((m) => <tr key={m.id}><td>{m.member_no}</td><td>{m.full_name}</td><td><StatusBadge status={m.status} /></td><td>{formatDate(m.created_at)}</td></tr>)}
                {(members || []).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink/60">No members yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-lg font-bold text-adire-900">Staff</h2>
            <ul className="mt-2 divide-y divide-rule text-sm">{(staff || []).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.full_name}</span><span className="capitalize text-ink/60">{p.role}</span></li>)}</ul>
          </section>
          <section className="panel p-5">
            <h2 className="text-lg font-bold text-adire-900">Recent activity</h2>
            <ul className="mt-2 divide-y divide-rule text-sm">
              {(logs || []).map((l) => <li key={l.id} className="flex justify-between gap-2 py-2"><span>{l.action}</span><span className="text-xs text-ink/50">{formatDate(l.created_at)}</span></li>)}
              {(logs || []).length === 0 && <li className="py-3 text-ink/60">Nothing yet.</li>}
            </ul>
          </section>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink/60">Member names and statuses are shown for oversight. Individual balances and passbooks are not exposed to the platform owner.</p>
    </>
  );
}
