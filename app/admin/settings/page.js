import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { requireStaff } from '@/lib/auth';
import { listBanks } from '@/lib/paystack';
import { saveSettings, saveBank, createBookkeeper } from '@/app/admin/actions';
import BankForm from '@/components/BankForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { supabase, profile } = await requireStaff({ adminOnly: true });
  const [{ data: tenant }, banks, { data: staff }] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
    listBanks(),
    supabase.from('profiles').select('id, full_name, role').in('role', ['admin', 'bookkeeper']).order('role'),
  ]);
  const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/c/${tenant.slug}`;

  return (
    <>
      <PageHeader title="Settings" intro="Your cooperative's rules, payout account and staff." />

      <section className="panel mb-8 max-w-2xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Cooperative</h2>
        <p className="mt-1 text-sm text-ink/70">Member link: <span className="font-mono">{link}</span></p>
        <ActionForm action={saveSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Cooperative name" name="name" defaultValue={tenant.name} /></div>
          <Field label="Loan multiplier" name="loanMultiplier" type="number" step="0.01" min="0" max="20" defaultValue={tenant.loan_multiplier} hint="A member can borrow up to this many times their savings, minus any loan still owed." />
          <Field label="Default interest (% a year)" name="interest" type="number" step="0.01" min="0" max="100" defaultValue={tenant.default_interest_rate} hint="Simple interest. You can change it when approving each loan." />
          <div><SubmitButton>Save settings</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="panel mb-8 max-w-2xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Payout account for online payments</h2>
        <p className="mt-1 text-sm text-ink/70">
          {tenant.paystack_subaccount_code
            ? `Online contributions are paid into ${tenant.bank_name || 'your bank'} account ending ${String(tenant.account_number || '').slice(-4)}.`
            : 'Add the cooperative\'s bank account. Members\' online contributions are paid straight into it.'}
        </p>
        <BankForm action={saveBank} banks={banks} current={{ bankCode: tenant.bank_code || '', accountNumber: tenant.account_number || '' }} />
      </section>

      <section className="panel max-w-2xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Staff</h2>
        <ul className="mt-2 divide-y divide-rule text-sm">
          {(staff || []).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.full_name}</span><span className="capitalize text-ink/60">{p.role}</span></li>)}
        </ul>
        <h3 className="mt-5 font-semibold">Add a bookkeeper</h3>
        <p className="text-sm text-ink/70">A bookkeeper can record payments and manage members, but cannot approve loans or change settings.</p>
        <ActionForm action={createBookkeeper} resetOnSuccess className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="fullName" />
          <Field label="Email address" name="email" type="email" />
          <Field label="Temporary password" name="password" type="password" minLength={8} autoComplete="new-password" />
          <div className="flex items-end"><SubmitButton>Create account</SubmitButton></div>
        </ActionForm>
      </section>
    </>
  );
}
