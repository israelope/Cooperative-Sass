import Link from 'next/link';
import Logo from '@/components/Logo';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { login } from '@/app/actions/auth';

export const metadata = { title: 'Log in · CoopLedger' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">Log in</h1>
      <ActionForm action={login} className="panel mt-5 space-y-4 p-6">
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm text-ink/70">
        New cooperative? <Link href="/register" className="font-semibold text-adire-700 underline">Register it</Link>.
        Got a claim code? <Link href="/claim" className="font-semibold text-adire-700 underline">Activate your account</Link>.
      </p>
    </main>
  );
}
