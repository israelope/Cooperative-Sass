// The six fault classes of Chapter 3 (Table "Fault classes") against the real database functions.
// Requires: migrations 1 to 8 applied + `npm run seed`. Uses the service role, exactly like the webhook route.
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient, clientFor } from '../helpers/clients.js';

let svc, tenantId, memberId;
const ref = () => 'RC-' + Math.random().toString(36).slice(2, 12);
const payload = (reference, amountKobo, feeKobo, shareKobo) => ({ event: 'charge.success', data: { reference, amount: amountKobo, currency: 'NGN', fees: feeKobo, fees_split: { subaccount: shareKobo } } });

// A pending online payment of NGN 10,000 with a NGN 50 platform fee, the cooperative bearing Paystack's fee.
// Paystack fee NGN 250 -> expected cooperative share = 10,000 - 50 - 250 = 9,700.00 (970,000 kobo).
async function pending(r = ref()) {
  const { error } = await svc.from('transactions').insert({ tenant_id: tenantId, member_id: memberId, reference: r, amount: 10000, channel: 'online', status: 'pending', purpose: 'contribution', platform_fee: 50, fee_bearer: 'subaccount' });
  expect(error).toBeNull();
  return r;
}
const pay = (r, amountKobo = 1000000, feeKobo = 25000, shareKobo = 970000, currency = 'NGN') =>
  svc.rpc('process_successful_payment', { p_reference: r, p_amount: amountKobo / 100, p_currency: currency, p_payload: payload(r, amountKobo, feeKobo, shareKobo) });
const record = async (r) => (await svc.from('reconciliation_results').select('*, transactions!inner(reference)').eq('transactions.reference', r).single()).data;
const settle = (r, share = 9700, ok = true) => svc.rpc('record_settlement', { p_reference: r, p_share: share, p_leg_ok: ok });
const balance = async () => Number((await svc.from('passbook_entries').select('running_balance').eq('member_id', memberId).order('seq', { ascending: false }).limit(1).single()).data.running_balance);

beforeAll(async () => {
  svc = serviceClient();
  const m = (await svc.from('members').select('id, tenant_id').eq('member_no', 'A001').single()).data;
  memberId = m.id; tenantId = m.tenant_id;
});

describe('reconciliation outcomes', () => {
  it('no fault: credited, then AUTO_MATCHED once the settlement is confirmed', async () => {
    const r = await pending();
    expect((await pay(r)).data).toBe('credited');
    expect((await record(r)).status).toBe('AWAITING_SETTLEMENT');
    expect((await settle(r)).data).toBe('settled');
    const rec = await record(r);
    expect(rec.status).toBe('AUTO_MATCHED');
    expect(rec.flagged_mismatch).toBe(false);
    expect(rec.reconciled_at).not.toBeNull();
  });

  it('partial payment: no credit, NEEDS_REVIEW, and the officer can accept the amount received', async () => {
    const r = await pending();
    const before = await balance();
    expect((await pay(r, 600000, 9000, 590000)).data).toBe('needs_review');
    expect(await balance()).toBe(before);
    const rec = await record(r);
    expect(rec.status).toBe('NEEDS_REVIEW');
    expect(rec.detected_fault).toBe('partial_payment');
    // an officer of the same cooperative decides
    const admin = await clientFor('admin.a@coop.test');
    const res = await admin.rpc('resolve_reconciliation', { p_id: rec.id, p_action: 'accept_received', p_note: 'Member confirmed NGN 6,000 paid' });
    expect(res.error).toBeNull();
    expect((await record(r)).status).toBe('RESOLVED_MANUALLY');
    expect(await balance()).toBe(before + 6000);
  });

  it('duplicate webhook: ignored, flagged, and AUTO_RESOLVED; credited once', async () => {
    const r = await pending();
    const before = await balance();
    await pay(r); await settle(r);
    expect((await pay(r)).data).toBe('duplicate');
    expect((await pay(r)).data).toBe('duplicate');
    const rec = await record(r);
    expect(rec.status).toBe('AUTO_RESOLVED');
    expect(rec.detected_fault).toBe('duplicate_webhook');
    expect(await balance()).toBe(before + 10000);
  });

  it('rounding difference of one kobo: accepted and AUTO_RESOLVED', async () => {
    const r = await pending();
    expect((await pay(r, 1000000, 25000, 970001)).data).toBe('credited');
    const rec = await record(r);
    expect(rec.status).toBe('AUTO_RESOLVED');
    expect(rec.detected_fault).toBe('rounding_diff');
  });

  it('failed leg: the member is credited but the case needs review (leg failed in the settlement report)', async () => {
    const r = await pending();
    await pay(r);
    expect((await settle(r, 9700, false)).data).toBe('needs_review');
    const rec = await record(r);
    expect(rec.status).toBe('NEEDS_REVIEW');
    expect(rec.detected_fault).toBe('failed_leg');
  });

  it('failed leg: a share more than one kobo short in the payment confirmation needs review', async () => {
    const r = await pending();
    await pay(r, 1000000, 25000, 900000);
    const rec = await record(r);
    expect(rec.status).toBe('NEEDS_REVIEW');
    expect(rec.detected_fault).toBe('failed_leg');
  });

  it('delayed settlement: flagged by the sweep, then AUTO_RESOLVED when it arrives', async () => {
    const r = await pending();
    await pay(r);
    await new Promise((res) => setTimeout(res, 1500));
    const sweep = await svc.rpc('reconcile_sweep', { p_settle_window: '1 second', p_final_window: '1 day', p_review_window: '30 days' });
    expect(sweep.error).toBeNull();
    expect((await record(r)).detected_fault).toBe('delayed_settlement');
    await settle(r);
    expect((await record(r)).status).toBe('AUTO_RESOLVED');
  });

  it('delayed settlement that never arrives becomes UNRESOLVED after the final deadline', async () => {
    const r = await pending();
    await pay(r);
    await new Promise((res) => setTimeout(res, 1500));
    await svc.rpc('reconcile_sweep', { p_settle_window: '1 second', p_final_window: '1 second', p_review_window: '30 days' });
    const rec = await record(r);
    expect(rec.status).toBe('UNRESOLVED');
    expect(rec.reconciled_at).not.toBeNull();
  });

  it('out-of-order (early event): held, then processed and AUTO_RESOLVED once the pending record exists', async () => {
    const r = ref();
    expect((await pay(r)).data).toBe('held');
    await pending(r);
    const sweep = await svc.rpc('reconcile_sweep', { p_settle_window: '1 hour', p_final_window: '1 day', p_review_window: '30 days' });
    expect(sweep.data.held_retried).toBeGreaterThan(0);
    await settle(r);
    const rec = await record(r);
    expect(rec.status).toBe('AUTO_RESOLVED');
    expect(rec.detected_fault).toBe('out_of_order');
  });

  it('out-of-order (late failure notice): never undoes a success', async () => {
    const r = await pending();
    await pay(r); await settle(r);
    expect((await svc.rpc('process_failed_notice', { p_reference: r })).data).toBe('ignored_late_failure');
    const { data } = await svc.from('transactions').select('status').eq('reference', r).single();
    expect(data.status).toBe('success');
    expect((await record(r)).status).toBe('AUTO_RESOLVED');
  });

  it('a duplicate settlement report is ignored', async () => {
    const r = await pending();
    await pay(r);
    await settle(r);
    expect((await settle(r)).data).toBe('duplicate');
  });
});

describe('integrity and access', () => {
  it('all integrity invariants hold after the tests above', async () => {
    const { data, error } = await svc.rpc('integrity_violations');
    expect(error).toBeNull();
    for (const k of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6']) expect(Number(data[k])).toBe(0);
  });
  it('a member cannot read reconciliation records or run the engine', async () => {
    const m = await clientFor('member.a1@coop.test');
    const read = await m.from('reconciliation_results').select('*');
    expect(!read.error ? read.data.length : 0).toBe(0);
    expect((await m.rpc('process_payment_event', { p_reference: 'X', p_amount: 1, p_currency: 'NGN', p_payload: {} })).error).not.toBeNull();
    expect((await m.rpc('integrity_violations')).error).not.toBeNull();
  });
  it('an officer of another cooperative cannot resolve this cooperative\'s records', async () => {
    const r = await pending();
    await pay(r, 500000, 9000, 490000);
    const rec = await record(r);
    const other = await clientFor('admin.b@coop.test');
    const res = await other.rpc('resolve_reconciliation', { p_id: rec.id, p_action: 'mark_failed', p_note: 'should not work' });
    expect(res.error).not.toBeNull();
  });
});
