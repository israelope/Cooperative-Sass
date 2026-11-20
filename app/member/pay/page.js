import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import PayForm from '@/components/PayForm';
import { requireMember } from '@/lib/auth';

export const metadata = { title: 'Pay contribution' };

export default async function PayPage() {
  const { member } = await requireMember();
  const active = member.status === 'active';
  return (
    <>
      <PageHeader title="Pay your contribution" icon="wallet" />
      {!active && (
        <div className="callout-warn mb-4" role="status">
          <Icon name="alertTriangle" size={18} className="mt-0.5" />
          <div>Payments open once your membership is active.</div>
        </div>
      )}
      <PayForm disabled={!active} />
    </>
  );
}
