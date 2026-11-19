import PageHeader from '@/components/PageHeader';
import PayForm from '@/components/PayForm';
import { requireMember } from '@/lib/auth';

export default async function PayPage() {
  const { member } = await requireMember();
  const active = member.status === 'active';
  return (
    <>
      <PageHeader title="Pay your contribution" />
      {!active && <p className="mb-4 rounded-lg bg-marigold-100 px-4 py-3 text-sm text-marigold-700">Payments open once your membership is active.</p>}
      <PayForm disabled={!active} />
    </>
  );
}
