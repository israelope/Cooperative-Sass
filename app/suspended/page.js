import Icon from '@/components/Icon';
import AuthCard from '@/components/AuthCard';
import { logout } from '@/app/actions/auth';

export const metadata = { title: 'Account suspended' };

export default function SuspendedPage() {
  return (
    <AuthCard
      title="This cooperative is suspended"
      intro="Access to this workspace has been paused by the platform owner."
      footer={<p className="text-ink/75">If you believe this is a mistake, contact your cooperative&apos;s officers or the platform support team.</p>}
    >
      <div className="callout-warn">
        <Icon name="lock" size={18} className="mt-0.5" />
        <span>Your records are safe. You will be able to sign in again once the cooperative is reactivated.</span>
      </div>
      <form action={logout} className="mt-5">
        <button className="btn-primary w-full"><Icon name="logout" size={16} /> Log out</button>
      </form>
    </AuthCard>
  );
}
