import PageHeader from '@/components/PageHeader';
import PaymentProcessing from '@/components/PaymentProcessing';
import { requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProcessingPage({ searchParams }) {
  await requireMember();
  const ref = String(searchParams.ref || searchParams.reference || '').slice(0, 64);
  return (
    <>
      <PageHeader title="Payment status" />
      {ref ? <PaymentProcessing reference={ref} /> : <p className="text-sm">No payment reference found.</p>}
    </>
  );
}
