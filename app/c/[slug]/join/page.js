import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { joinCooperative } from '@/app/actions/auth';
import { createServiceClient } from '@/lib/supabase/service';

export default async function JoinPage({ params }) {
  const { data: tenant } = await createServiceClient().from('tenants').select('name, slug').eq('slug', params.slug).maybeSingle();
  if (!tenant) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">Join {tenant.name}</h1>
      <p className="mt-2 text-sm text-ink/70">Create your account. A cooperative officer will approve your membership before you can pay or borrow.</p>
      <ActionForm action={joinCooperative} className="panel mt-5 space-y-4 p-6">
        <input type="hidden" name="slug" value={tenant.slug} />
        <Field label="Full name" name="fullName" autoComplete="name" />
        <Field label="Phone number" name="phone" type="tel" autoComplete="tel" placeholder="08012345678" />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} />
        <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </main>
  );
}
