import Link from '@/components/TenantLink';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { requireStaff } from '@/lib/auth';
import { mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { getAppUrl } from '@/lib/appUrl';
import { addMember, setMemberStatus } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Members' };
const STATUSES = ['all', 'active', 'pending', 'unclaimed', 'suspended'];

export default async function MembersPage(props) {
  const searchParams = await props.searchParams;
  const { supabase, profile } = await requireStaff();
  const status = STATUSES.includes(searchParams.status) ? searchParams.status : 'all';
  const q = String(searchParams.q || '').trim().replace(/[%,()]/g, '');
  const page = pageOf(searchParams.page);
  const range = pageRange(page);

  let query = supabase
    .from('members')
    .select('id, member_no, full_name, phone, email, status, claim_code, created_at', { count: 'exact' })
    .order('member_no');
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`full_name.ilike.%${q}%,member_no.ilike.%${q}%`);
  const { rows: members, count: total } = await mustWithCount(query.range(range.from, range.to), 'members');
  const link = `${getAppUrl()}/${profile.tenants?.slug}`;

  return (
    <>
      <PageHeader title="Members" intro="Manage your society's members and their account status." icon="users" helpKey="adminMembers">
        {profile.role === 'admin' && <Link href="/admin/team" className="btn-quiet"><Icon name="users" size={16} /> Manage team</Link>}
        {profile.role === 'admin' && <Link href="/admin/import" className="btn-quiet"><Icon name="upload" size={16} /> Bulk import</Link>}
      </PageHeader>

      <div className="callout-info mb-5">
        <Icon name="link" size={17} className="mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold">Share this link so members can join themselves</p>
          <Link href={`/${profile.tenants?.slug}`} target="_blank" rel="noopener noreferrer" className="link mt-1 block break-all rounded bg-white px-2 py-1 text-xs"><code>{link}</code></Link>
        </div>
      </div>

      <form className="panel mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
        <input type="hidden" name="page" value="1" />
        <div className="grow sm:max-w-xs">
          <label htmlFor="q" className="label">Search name or number</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="e.g. Adeola or A014" />
        </div>
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn-quiet"><Icon name="filter" size={16} /> Filter</button>
        {(q || status !== 'all') && <Link href="/admin/members" className="btn-quiet">Clear</Link>}
      </form>

      <div className="panel p-2">
        {(members || []).length === 0 ? (
          <EmptyState compact icon="users" title="No members match" description="Add one below, use bulk import, or clear your filters." />
        ) : (
          <DataTable caption="Members, with status and account actions" scroll>
            <thead><tr><th scope="col">No.</th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col">Claim code</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {(members || []).map((m) => (
                <tr key={m.id}>
                  <td className="num">{m.member_no}</td>
                  <td><Link href={`/admin/members/${m.id}`} className="link whitespace-nowrap">{m.full_name}</Link><span className="block text-xs text-ink/75">{m.email}</span></td>
                  <td className="num">{m.phone}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="num font-mono">{m.claim_code || ''}</td>
                  <td>
                    {m.status === 'pending' && <RowAction id={m.id} to="active" label="Approve" cls="btn-primary btn-sm" />}
                    {m.status === 'active' && <RowAction id={m.id} to="suspended" label="Suspend" cls="btn-danger btn-sm" />}
                    {m.status === 'suspended' && <RowAction id={m.id} to="active" label="Reactivate" cls="btn-quiet btn-sm" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination page={page} total={total} basePath="/admin/members" params={{ q, status }} />
      </div>

      <section className="panel mt-8 max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="userPlus" size={18} className="text-accent-500" /> Add a member</h2>
        <p className="mt-1 text-sm text-ink/75">The member receives a claim code to activate their own account.</p>
        <ActionForm action={addMember} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Member number" name="memberNo" />
          <Field label="Full name" name="fullName" />
          <Field label="Phone" name="phone" type="tel" required={false} placeholder="08012345678" />
          <Field label="Email" name="email" type="email" required={false} />
          <Field label="Opening savings (₦)" name="openingSavings" type="number" step="0.01" min="0" required={false} hint="Balance carried over from the paper ledger." />
          <div className="flex items-end"><SubmitButton pendingText="Adding…">Add member</SubmitButton></div>
        </ActionForm>
      </section>
    </>
  );
}

function RowAction({ id, to, label, cls }) {
  return (
    <ActionForm action={setMemberStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ActionForm>
  );
}
