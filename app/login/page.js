import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { login } from '@/app/actions/auth';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const reason = sp?.reason === 'role';
  return (
    <AuthCard
      title="Log in"
      intro={reason
        ? 'Your permissions changed. Sign in again to refresh them.'
        : 'Welcome back. Sign in to your cooperative workspace.'}
      footer={
        <div className="space-y-2">
          <p>
            New cooperative? <Link href="/register" className="link">Register it</Link>.{' '}
            Got a claim code? <Link href="/claim" className="link">Activate your account</Link>.
          </p>
          <p><Link href="/help" className="link">Not sure where to start? Open the Help centre</Link></p>
        </div>
      }
    >
      <ActionForm action={login} className="space-y-4">
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton className="btn-primary w-full" pendingText="Logging in…">Log in</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
