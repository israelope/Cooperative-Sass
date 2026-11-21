import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import PaymentProcessing from '@/components/PaymentProcessing';
import { requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment status' };

export default async function ProcessingPage(props) {
  const searchParams = await props.searchParams;
  await requireMember();
  const ref = String(searchParams.ref || searchParams.reference || '').slice(0, 64);
  return (
    <>
      <PageHeader title="Payment status" intro="We are confirming your payment with Paystack." icon="clock" />
      {ref ? (
        <PaymentProcessing reference={ref} />
      ) : (
        <EmptyState
          icon="receipt"
          title="No payment reference found"
          description="Start a new contribution from the payment page and we will track it here."
          action={<Link href="/member/pay" className="btn-primary btn-sm"><Icon name="arrowRight" size={16} /> Back to payments</Link>}
        />
      )}
    </>
  );
}
