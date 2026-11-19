// Payment reconciliation tests (I2 to I6): atomic, idempotent, amount-checked.
// Requires: migrations applied + `npm run seed`. Uses the service role, exactly like the webhook route.
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient } from '../helpers/clients.js';

let svc, tenantId, memberId;
const ref = () => 'TEST-' + Math.random().toString(36).slice(2, 12);

async function pending(amount) {
  const reference = ref();
  const { error } = await svc.from('transactions').insert({ tenant_id: tenantId, member_id: memberId, reference, amount, channel: 'online', status: 'pending' });
  expect(error).toBeNull();
  return reference;
}
const balance = async () => Number((await svc.from('passbook_entries').select('running_balance').eq('member_id', memberId).order('seq', { ascending: false }).limit(1).single()).data.running_balance);
const entries = async (reference) => (await svc.from('passbook_entries').select('id, transaction_id, transactions!inner(reference)').eq('transactions.reference', reference)).data.length;
const pay = (reference, amountNaira, currency = 'NGN') => svc.rpc('process_successful_payment', { p_reference: reference, p_amount: amountNaira, p_currency: currency, p_payload: { reference } });

beforeAll(async () => {
  svc = serviceClient();
  const m = (await svc.from('members').select('id, tenant_id').eq('member_no', 'A001').single()).data;
  memberId = m.id; tenantId = m.tenant_id;
});

describe('webhook reconciliation', () => {
  it('I2 credits the passbook exactly once for a valid payment', async () => {
    const before = await balance();
    const r = await pending(7500);
    const res = await pay(r, 7500);
    expect(res.error).toBeNull();
    expect(res.data).toBe('credited');
    expect(await balance()).toBe(before + 7500);
    expect(await entries(r)).toBe(1);
  });

  it('I4 ignores a replayed (duplicate) event', async () => {
    const r = await pending(3000);
    await pay(r, 3000);
    const before = await balance();
    const again = await pay(r, 3000);
    expect(again.data).toBe('duplicate');
    expect(await balance()).toBe(before);
    expect(await entries(r)).toBe(1);
  });

  it('I5 sends an amount mismatch to review and does not credit', async () => {
    const r = await pending(5000);
    const before = await balance();
    const res = await pay(r, 9000);
    expect(res.data).toBe('needs_review');
    expect(await balance()).toBe(before);
    const { data } = await svc.from('transactions').select('status').eq('reference', r).single();
    expect(data.status).toBe('pending');                       // an officer decides (Section 3.8.4)
    const rec = await svc.from('reconciliation_results').select('status, flagged_mismatch').eq('transaction_id', (await svc.from('transactions').select('id').eq('reference', r).single()).data.id).single();
    expect(rec.data.status).toBe('NEEDS_REVIEW');
    expect(rec.data.flagged_mismatch).toBe(true);
  });

  it('rejects a non-NGN currency', async () => {
    const r = await pending(2000);
    expect((await pay(r, 2000, 'USD')).data).toBe('needs_review');
  });

  it('I6 holds an event for an unknown reference and credits nothing', async () => {
    const before = await balance();
    const res = await pay('DOES-NOT-EXIST-' + ref(), 1000);
    expect(res.data).toBe('held');
    expect(await balance()).toBe(before);
  });

  it('handles concurrent deliveries of the same event safely', async () => {
    const r = await pending(1200);
    const before = await balance();
    const results = await Promise.all([pay(r, 1200), pay(r, 1200), pay(r, 1200)]);
    expect(results.filter((x) => x.data === 'credited').length).toBe(1);
    expect(await balance()).toBe(before + 1200);
  });

  it('records the platform fee and Paystack fee, and computes net revenue by bearer', async () => {
    const reference = ref();
    await svc.from('transactions').insert({ tenant_id: tenantId, member_id: memberId, reference, amount: 20000, channel: 'online', status: 'pending', platform_fee: 50, fee_bearer: 'account' });
    const res = await svc.rpc('process_successful_payment', { p_reference: reference, p_amount: 20000, p_currency: 'NGN', p_payload: { event: 'charge.success', data: { reference, fees: 40000 } } });
    expect(res.data).toBe('credited');
    const { data } = await svc.from('transactions').select('platform_fee, paystack_fee, fee_bearer').eq('reference', reference).single();
    expect(Number(data.platform_fee)).toBe(50);
    expect(Number(data.paystack_fee)).toBe(400);          // 40000 kobo
    const stats = await svc.rpc('revenue_stats', { p_days: 30 });
    expect(stats.error).toBeNull();
    expect(Number(stats.data.all_gross)).toBeGreaterThan(0);
    // platform bears the fee here, so this payment's net is 50 - 400 = -350 (a loss): why 'subaccount' is the default bearer
    expect(Number(stats.data.all_net)).toBeLessThan(Number(stats.data.all_gross));
  });

  describe('online loan repayment', () => {
    async function activeLoan(owed) {
      const { data } = await svc.from('loans').insert({ tenant_id: tenantId, member_id: memberId, principal: owed, interest_rate: 0, tenor_months: 3, total_repayable: owed, amount_repaid: 0, status: 'active' }).select().single();
      return data;
    }
    async function repaymentTxn(loanId, amount) {
      const reference = ref();
      const { error } = await svc.from('transactions').insert({ tenant_id: tenantId, member_id: memberId, reference, amount, channel: 'online', status: 'pending', purpose: 'loan_repayment', loan_id: loanId });
      expect(error).toBeNull();
      return reference;
    }

    it('applies the payment to the loan, writes a repayment line, and leaves savings unchanged', async () => {
      const loan = await activeLoan(10000);
      const r = await repaymentTxn(loan.id, 4000);
      const before = await balance();
      expect((await pay(r, 4000)).data).toBe('credited');
      const { data: l } = await svc.from('loans').select('amount_repaid, status').eq('id', loan.id).single();
      expect(Number(l.amount_repaid)).toBe(4000);
      expect(l.status).toBe('active');
      expect(await balance()).toBe(before);                       // repayments never change savings
      const { data: rp } = await svc.from('loan_repayments').select('amount, transaction_id').eq('loan_id', loan.id);
      expect(rp.length).toBe(1);
      expect(rp[0].transaction_id).not.toBeNull();
    });

    it('marks the loan repaid when the balance is cleared, and credits any overpayment to savings', async () => {
      const loan = await activeLoan(1000);
      const r = await repaymentTxn(loan.id, 1500);                // 500 more than owed (e.g. an officer recorded a payment meanwhile)
      const before = await balance();
      expect((await pay(r, 1500)).data).toBe('credited');
      const { data: l } = await svc.from('loans').select('amount_repaid, status').eq('id', loan.id).single();
      expect(l.status).toBe('repaid');
      expect(Number(l.amount_repaid)).toBe(1000);
      expect(await balance()).toBe(before + 500);                 // nothing is lost
    });

    it('a replayed repayment webhook is ignored', async () => {
      const loan = await activeLoan(5000);
      const r = await repaymentTxn(loan.id, 2000);
      await pay(r, 2000);
      expect((await pay(r, 2000)).data).toBe('duplicate');
      const { data: l } = await svc.from('loans').select('amount_repaid').eq('id', loan.id).single();
      expect(Number(l.amount_repaid)).toBe(2000);
    });
  });
});
