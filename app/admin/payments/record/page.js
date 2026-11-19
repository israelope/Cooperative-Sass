import PageHeader from '@/components/PageHeader';
import ManualPaymentForm from '@/components/ManualPaymentForm';
import { requireStaff } from '@/lib/auth';
import { recordManualPayment } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';

export default async function RecordPaymentPage() {
  const { supabase, profile } = await requireStaff();
  const { data: members } = await supabase.from('members').select('id, member_no, full_name').in('status', ['active', 'unclaimed']).order('member_no').limit(1000);
  return (
    <>
      <PageHeader title="Record a payment" intro="For cash and bank-transfer payments. Online payments are recorded automatically." />
      <ManualPaymentForm action={recordManualPayment} tenantId={profile.tenant_id} members={members || []} />
    </>
  );
}
