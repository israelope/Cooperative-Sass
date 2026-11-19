import Link from 'next/link';
import Logo from '@/components/Logo';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { claimAccount } from '@/app/actions/auth';

export const metadata = { title: 'Activate your account · CoopLedger' };

export default function ClaimPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">Activate your account</h1>
      <p className="mt-2 text-sm text-ink/70">Your cooperative has moved its records online. Enter the claim code your admin gave you and choose a password. A code works once.</p>
      <ActionForm action={claimAccount} className="panel mt-5 space-y-4 p-6">
        <Field label="Claim code" name="code" placeholder="K7P2-9QXA" autoComplete="off" autoCapitalize="characters" />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} />
        <SubmitButton pendingText="Activating…">Activate account</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-sm text-ink/70">Already activated? <Link href="/login" className="font-semibold text-adire-700 underline">Log in</Link>.</p>
    </main>
  );
}
