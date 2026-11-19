import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { requireStaff } from '@/lib/auth';
import { addMember, setMemberStatus } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
const STATUSES = ['all', 'active', 'pending', 'unclaimed', 'suspended'];

export default async function MembersPage({ searchParams }) {
  const { supabase, profile } = await requireStaff();
  const status = STATUSES.includes(searchParams.status) ? searchParams.status : 'all';
  const q = String(searchParams.q || '').trim().replace(/[%,()]/g, '');

  let query = supabase.from('members').select('id, member_no, full_name, phone, email, status, claim_code, created_at').order('member_no').limit(300);
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`full_name.ilike.%${q}%,member_no.ilike.%${q}%`);
  const { data: members } = await query;
  const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/c/${profile.tenants?.slug}`;

  return (
    <>
      <PageHeader title="Members" intro={`Share this link so members can join: ${link}`}>
        {profile.role === 'admin' && <Link href="/admin/import" className="btn-quiet">Bulk import</Link>}
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <div className="grow sm:max-w-xs">
          <label htmlFor="q" className="label">Search name or number</label>
          <input id="q" name="q" defaultValue={q} className="input" />
        </div>
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn-quiet">Filter</button>
      </form>

      <div className="panel p-2">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>No.</th><th>Name</th><th>Phone</th><th>Status</th><th>Claim code</th><th></th></tr></thead>
            <tbody>
              {(members || []).map((m) => (
                <tr key={m.id}>
                  <td className="num">{m.member_no}</td>
                  <td><Link href={`/admin/members/${m.id}`} className="font-semibold text-adire-700 underline">{m.full_name}</Link><span className="block text-xs text-ink/50">{m.email}</span></td>
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
              {(members || []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-ink/60">No members match. Add one below or use bulk import.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="panel mt-8 max-w-2xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Add a member</h2>
        <p className="mt-1 text-sm text-ink/70">The member receives a claim code to activate their own account.</p>
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
