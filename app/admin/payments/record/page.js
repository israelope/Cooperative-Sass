import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ManualPaymentForm from '@/components/ManualPaymentForm';
import { requireStaff } from '@/lib/auth';
import { must } from '@/lib/db';
import { recordManualPayment } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Record a payment' };

export default async function RecordPaymentPage() {
  const { supabase, profile } = await requireStaff();
  const members = must(
    await supabase.from('members').select('id, member_no, full_name').in('status', ['active', 'unclaimed']).order('member_no').limit(1000),
    'members for manual payment',
  ) || [];
  return (
    <>
      <PageHeader title="Record a payment" intro="For cash and bank-transfer payments. Online payments are recorded automatically." icon="plusCircle">
        <a href="/admin/payments" className="btn-quiet"><Icon name="arrowRight" size={16} className="rotate-180" /> All payments</a>
      </PageHeader>
      <ManualPaymentForm action={recordManualPayment} tenantId={profile.tenant_id} members={members} />
    </>
  );
}
