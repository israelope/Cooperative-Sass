import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { registerCooperative } from '@/app/actions/auth';

export const metadata = { title: 'Register your cooperative' };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Register your cooperative"
      intro="You will be the admin. Your society gets a private workspace and a link to share with members. You can add bank details for online payments afterwards in Settings."
      footer={<div className="space-y-2"><p>Already registered? <Link href="/login" className="link">Log in</Link>.</p><p>New to this? <Link href="/help/admin#setup" className="link">Read the admin setup guide</Link></p></div>}
    >
      <ActionForm action={registerCooperative} className="space-y-4">
        <Field label="Cooperative name" name="coopName" placeholder="e.g. Adeola Thrift Society" />
        <Field label="Your full name" name="fullName" autoComplete="name" />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <SubmitButton className="btn-primary w-full" pendingText="Creating workspace…">Create workspace</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
