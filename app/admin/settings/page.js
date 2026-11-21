import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { requireStaff } from '@/lib/auth';
import { must } from '@/lib/db';
import { getAppUrl } from '@/lib/appUrl';
import { listBanks } from '@/lib/paystack';
import { saveSettings, saveBank, createStaff } from '@/app/admin/actions';
import BankForm from '@/components/BankForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { supabase, profile } = await requireStaff({ adminOnly: true });
  const [tenant, banks, staff] = await Promise.all([
    must(supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(), 'cooperative settings'),
    listBanks(),
    must(supabase.from('profiles').select('id, full_name, role').in('role', ['admin', 'bookkeeper']).order('role'), 'staff'),
  ]);
  const link = `${getAppUrl()}/c/${tenant.slug}`;

  return (
    <>
      <PageHeader title="Settings" intro="Your cooperative's rules, payout account and staff." icon="settings" />

      <section className="panel mb-8 max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="building" size={18} className="text-accent-500" /> Cooperative</h2>
        <div className="callout-info mt-3">
          <Icon name="link" size={17} className="mt-0.5" />
          <span className="min-w-0">Member link: <Link href={`/c/${tenant.slug}`} target="_blank" rel="noopener noreferrer" className="link break-all font-mono">{link}</Link></span>
        </div>
        <ActionForm action={saveSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Cooperative name" name="name" defaultValue={tenant.name} /></div>
          <Field label="Loan multiplier" name="loanMultiplier" type="number" step="0.01" min="0" max="20" defaultValue={tenant.loan_multiplier} hint="A member can borrow up to this many times their savings, minus any loan still owed." />
          <Field label="Default interest (% a year)" name="interest" type="number" step="0.01" min="0" max="100" defaultValue={tenant.default_interest_rate} hint="Simple interest. You can change it when approving each loan." />
          <div><SubmitButton><Icon name="check" size={16} /> Save settings</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="panel mb-8 max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="bank" size={18} className="text-accent-500" /> Payout account for online payments</h2>
        <p className="mt-1 text-sm text-ink/75">
          {tenant.paystack_subaccount_code
            ? `Online contributions are paid into ${tenant.bank_name || 'your bank'} account ending ${String(tenant.account_number || '').slice(-4)}.`
            : 'Add the cooperative\'s bank account. Members\' online contributions are paid straight into it.'}
        </p>
        <BankForm action={saveBank} banks={banks} current={{ bankCode: tenant.bank_code || '', accountNumber: tenant.account_number || '' }} />
      </section>

      <section className="panel max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="users" size={18} className="text-accent-500" /> Staff</h2>
        <ul className="mt-2 divide-y divide-rule text-sm">
          {(staff || []).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.full_name}</span><span className="capitalize text-ink/75">{p.role}</span></li>)}
        </ul>
        <p className="mt-3 text-sm text-ink/75">
          Need another admin, or want to change a role? <Link href="/admin/team" className="link">Manage your team</Link>.
        </p>
        <h3 className="mt-5 flex items-center gap-2 font-semibold"><Icon name="userPlus" size={16} className="text-accent-500" /> Add a bookkeeper</h3>
        <p className="text-sm text-ink/75">A bookkeeper can record payments and manage members, but cannot approve loans or change settings.</p>
        <ActionForm action={createStaff} resetOnSuccess className="mt-3 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="role" value="bookkeeper" />
          <Field label="Full name" name="fullName" />
          <Field label="Email address" name="email" type="email" />
          <Field label="Temporary password" name="password" type="password" minLength={8} autoComplete="new-password" />
          <div className="flex items-end"><SubmitButton><Icon name="userPlus" size={16} /> Create account</SubmitButton></div>
        </ActionForm>
      </section>
    </>
  );
}
