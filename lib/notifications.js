import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/** Notification writes are best-effort: they must never break a payment or loan action. */
async function write(name, args) {
  try {
    const { error } = await createServiceClient().rpc(name, args);
    if (error) console.error(`Notification (${name}) failed:`, error.message);
  } catch (error) {
    console.error(`Notification (${name}) failed:`, error?.message || error);
  }
}

export const notifyPayment = (reference) => write('notify_payment', { p_reference: reference });
export const notifyTransaction = (txnId) => write('notify_transaction', { p_txn_id: txnId });
export const notifyLoan = (loanId, event) => write('notify_loan', { p_loan_id: loanId, p_event: event });

/** Uses the caller's session so RLS returns only that person's unread rows. */
export async function unreadCount(supabase) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) {
    console.error('Unread notification count failed:', error.message);
    return 0;
  }
  return count || 0;
}
