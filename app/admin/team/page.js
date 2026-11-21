import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { requireStaff } from '@/lib/auth';
import { must } from '@/lib/db';
import { createStaff, setStaffRole } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team' };

const ROLES = ['admin', 'bookkeeper', 'member'];

export default async function TeamPage() {
  const { supabase, profile } = await requireStaff({ adminOnly: true });
  const staff = must(
    await supabase.from('profiles')
      .select('id, full_name, role')
      .in('role', ['admin', 'bookkeeper'])
      .order('role'),
    'team',
  );

  return (
    <>
      <PageHeader title="Team" intro="Add admins and bookkeepers, or change an existing staff member's role." icon="users">
        <Link href="/admin/settings" className="btn-quiet"><Icon name="settings" size={16} /> Cooperative settings</Link>
      </PageHeader>

      <div className="callout-info mb-5">
        <Icon name="info" size={17} className="mt-0.5" />
        <span>After you change someone&apos;s role, they must sign out and sign back in before their new permissions take effect.</span>
      </div>

      <section className="panel mb-8 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="users" size={18} className="text-accent-500" /> Your team</h2>
        {(staff || []).length === 0 ? (
          <p className="mt-2 text-sm text-ink/75">No staff found.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule text-sm">
            {(staff || []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {p.full_name}
                    {p.id === profile.id && <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-800">You</span>}
                  </p>
                  <p className="text-xs capitalize text-ink/75">{p.role}</p>
                </div>
                {p.id === profile.id ? (
                  <span className="text-xs text-ink/75">Your own role cannot be changed here</span>
                ) : (
                  <ActionForm action={setStaffRole} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={p.id} />
                    <label className="sr-only" htmlFor={`role-${p.id}`}>Role for {p.full_name}</label>
                    <select id={`role-${p.id}`} name="role" defaultValue={p.role} className="input w-36">
                      {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                    </select>
                    <SubmitButton className="btn-quiet btn-sm">Save</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="userPlus" size={18} className="text-accent-500" /> Add a team member</h2>
        <p className="mt-1 text-sm text-ink/75">Creates a new login. Share the temporary password with them securely.</p>
        <ActionForm action={createStaff} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="newStaffRole" className="label">Role</label>
            <select id="newStaffRole" name="role" defaultValue="bookkeeper" className="input">
              <option value="admin">Admin</option>
              <option value="bookkeeper">Bookkeeper</option>
            </select>
          </div>
          <Field label="Full name" name="fullName" />
          <Field label="Email address" name="email" type="email" />
          <Field label="Temporary password" name="password" type="password" minLength={8} autoComplete="new-password" />
          <div className="flex items-end sm:col-span-2"><SubmitButton pendingText="Creating…"><Icon name="userPlus" size={16} /> Create account</SubmitButton></div>
        </ActionForm>
      </section>
    </>
  );
}
