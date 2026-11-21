import { notFound } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { joinCooperative } from '@/app/actions/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { must } from '@/lib/db';

export async function generateMetadata(props) {
  const params = await props.params;
  return { title: `Join ${params.slug}` };
}

export default async function JoinPage(props) {
  const params = await props.params;
  const tenant = must(
    await createServiceClient().from('tenants').select('name, slug, status').eq('slug', params.slug).maybeSingle(),
    'cooperative lookup',
  );
  if (!tenant || tenant.status !== 'active') notFound();

  return (
    <AuthCard
      title={`Join ${tenant.name}`}
      intro="Create your account. A cooperative officer will approve your membership before you can pay or borrow."
    >
      <ActionForm action={joinCooperative} className="space-y-4">
        <input type="hidden" name="slug" value={tenant.slug} />
        <Field label="Full name" name="fullName" autoComplete="name" />
        <Field label="Phone number" name="phone" type="tel" autoComplete="tel" placeholder="08012345678" />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
