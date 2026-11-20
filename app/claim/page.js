import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { claimAccount } from '@/app/actions/auth';

export const metadata = { title: 'Activate your account' };

export default function ClaimPage() {
  return (
    <AuthCard
      title="Activate your account"
      intro="Your cooperative has moved its records online. Enter the claim code your admin gave you and choose a password. A code works once."
      footer={<p>Already activated? <Link href="/login" className="link">Log in</Link>.</p>}
    >
      <ActionForm action={claimAccount} className="space-y-4">
        <Field label="Claim code" name="code" placeholder="K7P2-9QXA" autoComplete="off" autoCapitalize="characters" hint="Ask your admin if you do not have one." />
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} />
        <SubmitButton className="btn-primary w-full" pendingText="Activating…">Activate account</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
