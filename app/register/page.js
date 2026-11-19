import Link from 'next/link';
import Logo from '@/components/Logo';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { registerCooperative } from '@/app/actions/auth';

export const metadata = { title: 'Register your cooperative · CoopLedger' };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">Register your cooperative</h1>
      <p className="mt-2 text-sm text-ink/70">You will be the admin. Your society gets a private workspace and a link to share with members. You can add bank details for online payments afterwards in Settings.</p>
      <ActionForm action={registerCooperative} className="panel mt-5 space-y-4 p-6">
        <Field label="Cooperative name" name="coopName" placeholder="e.g. Adeola Thrift Society" />
        <Field label="Your full name" name="fullName" autoComplete="name" />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <SubmitButton pendingText="Creating workspace…">Create workspace</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm text-ink/70">Already registered? <Link href="/login" className="font-semibold text-adire-700 underline">Log in</Link>.</p>
    </main>
  );
}
