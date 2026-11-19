import Logo from '@/components/Logo';
import { logout } from '@/app/actions/auth';

export const metadata = { title: 'Account suspended · CoopLedger' };

export default function SuspendedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-3xl font-bold text-adire-900">This cooperative is suspended</h1>
      <p className="mt-2 text-sm text-ink/70">Access to this cooperative's workspace has been paused by the platform owner. Your records are safe. Please contact your cooperative's officers or the platform support team.</p>
      <form action={logout} className="mt-5"><button className="btn-primary">Log out</button></form>
    </main>
  );
}
