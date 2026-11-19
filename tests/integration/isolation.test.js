// Multi-tenant isolation tests (T1 to T10). Requires: migrations applied + `npm run seed`.
import { describe, it, expect, beforeAll } from 'vitest';
import { clientFor, serviceClient, blocked } from '../helpers/clients.js';

let adminA, bookA, memberA1, memberA2, adminB, svc, tenantA, tenantB, memberB1Id, memberA2Id, txnB;

beforeAll(async () => {
  svc = serviceClient();
  [adminA, bookA, memberA1, memberA2, adminB] = await Promise.all([
    clientFor('admin.a@coop.test'), clientFor('book.a@coop.test'), clientFor('member.a1@coop.test'),
    clientFor('member.a2@coop.test'), clientFor('admin.b@coop.test'),
  ]);
  tenantA = (await svc.from('tenants').select('id').eq('slug', 'adeola-thrift').single()).data.id;
  tenantB = (await svc.from('tenants').select('id').eq('slug', 'ui-staff-coop').single()).data.id;
  memberB1Id = (await svc.from('members').select('id').eq('member_no', 'B001').single()).data.id;
  memberA2Id = (await svc.from('members').select('id').eq('member_no', 'A002').single()).data.id;
  txnB = (await svc.from('transactions').select('id').eq('tenant_id', tenantB).limit(1).single()).data.id;
});

describe('multi-tenant isolation', () => {
  it('T1 admin A lists only Tenant A members', async () => {
    const { data } = await adminA.from('members').select('tenant_id');
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((m) => m.tenant_id === tenantA)).toBe(true);
  });

  it('T2 admin A cannot fetch a Tenant B member by id', async () => {
    expect(blocked(await adminA.from('members').select('*').eq('id', memberB1Id))).toBe(true);
  });

  it('T3 admin A cannot insert a member into Tenant B', async () => {
    const r = await adminA.from('members').insert({ tenant_id: tenantB, member_no: 'HACK', full_name: 'Intruder', status: 'active' }).select();
    expect(blocked(r)).toBe(true);
  });

  it('T4 admin A cannot update a Tenant B transaction', async () => {
    const r = await adminA.from('transactions').update({ amount: 1 }).eq('id', txnB).select();
    expect(blocked(r)).toBe(true);
    const { data } = await svc.from('transactions').select('amount').eq('id', txnB).single();
    expect(Number(data.amount)).not.toBe(1);
  });

  it('T5 member A1 sees only their own passbook entries', async () => {
    const { data: me } = await memberA1.from('members').select('id').single();
    const { data } = await memberA1.from('passbook_entries').select('member_id');
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e) => e.member_id === me.id)).toBe(true);
  });

  it('T6 member A1 cannot read member A2 loans, transactions or profile row', async () => {
    expect(blocked(await memberA1.from('loans').select('*').eq('member_id', memberA2Id))).toBe(true);
    expect(blocked(await memberA1.from('transactions').select('*').eq('member_id', memberA2Id))).toBe(true);
    expect(blocked(await memberA1.from('members').select('*').eq('id', memberA2Id))).toBe(true);
  });

  it('T7 a member cannot use staff-only functions', async () => {
    const r1 = await memberA1.rpc('record_manual_payment', { p_member_id: memberA2Id, p_amount: 1000, p_channel: 'cash', p_receipt_path: `${tenantA}/x.jpg`, p_paid_on: null, p_note: null });
    expect(r1.error).not.toBeNull();
    const r2 = await memberA1.rpc('import_members', { p_rows: [], p_cutoff: '2026-01-01' });
    expect(r2.error).not.toBeNull();
  });

  it('T8 a user cannot change their own tenant, role or membership fields', async () => {
    const r = await memberA1.from('profiles').update({ tenant_id: tenantB, role: 'admin' }).eq('role', 'member').select();
    expect(blocked(r)).toBe(true);
    const r2 = await memberA1.from('members').update({ tenant_id: tenantB }).select();
    expect(blocked(r2)).toBe(true);
  });

  it('T9 the ledger and reconciliation function cannot be called or written by users', async () => {
    const r1 = await memberA1.rpc('process_successful_payment', { p_reference: 'X', p_amount: 1, p_currency: 'NGN', p_payload: {} });
    expect(r1.error).not.toBeNull();
    const r2 = await adminA.from('passbook_entries').insert({ tenant_id: tenantA, member_id: memberA2Id, entry_type: 'contribution', amount: 999999, running_balance: 999999 });
    expect(r2.error).not.toBeNull();
    const r3 = await adminA.rpc('append_passbook_entry', { p_tenant: tenantA, p_member: memberA2Id, p_txn: null, p_type: 'contribution', p_amount: 1, p_date: null, p_note: null });
    expect(r3.error).not.toBeNull();
  });

  it('T10 webhook_events and audit logs are protected', async () => {
    expect(blocked(await adminA.from('webhook_events').select('*'))).toBe(true);
    expect(blocked(await bookA.from('audit_logs').select('*'))).toBe(true);   // admin-only
    expect(blocked(await memberA1.from('audit_logs').select('*'))).toBe(true);
  });

  it('a member cannot create a non-pending or non-online transaction', async () => {
    const { data: me } = await memberA1.from('members').select('id').single();
    const r = await memberA1.from('transactions').insert({ tenant_id: tenantA, member_id: me.id, reference: 'FAKE-' + Date.now(), amount: 5000, channel: 'cash', status: 'success' });
    expect(r.error).not.toBeNull();
  });

  it('T11 tenant users cannot reach platform data or platform functions', async () => {
    for (const c of [adminA, memberA1]) {
      expect(blocked(await c.from('platform_admins').select('*'))).toBe(true);
      expect(blocked(await c.from('site_visits').select('*'))).toBe(true);
      expect((await c.rpc('platform_stats')).error).not.toBeNull();
      expect((await c.rpc('visit_stats', { p_days: 7 })).error).not.toBeNull();
      expect((await c.rpc('platform_cooperatives')).error).not.toBeNull();
      expect((await c.rpc('revenue_stats', { p_days: 30 })).error).not.toBeNull();
    }
  });

  it('T12 a suspended cooperative is locked out by the database itself, and restored on reactivation', async () => {
    await svc.from('tenants').update({ status: 'suspended' }).eq('id', tenantB);
    try {
      const fresh = await clientFor('admin.b@coop.test');
      expect(blocked(await fresh.from('members').select('*'))).toBe(true);
    } finally {
      await svc.from('tenants').update({ status: 'active', suspended_at: null }).eq('id', tenantB);
    }
    const again = await clientFor('admin.b@coop.test');
    expect((await again.from('members').select('*')).data.length).toBeGreaterThan(0);
  });

  it('T13 a member cannot write fee columns (revenue cannot be distorted from the client)', async () => {
    const { data: me } = await memberA1.from('members').select('id').single();
    const r = await memberA1.from('transactions').insert({ tenant_id: tenantA, member_id: me.id, reference: 'FEE-' + Date.now(), amount: 5000, channel: 'online', status: 'pending', platform_fee: 999999 });
    expect(r.error).not.toBeNull();
  });

  it('T14 a member cannot start a repayment for someone else\'s loan, or a repayment with no loan', async () => {
    const { data: me } = await memberA1.from('members').select('id').single();
    const { data: otherLoan } = await svc.from('loans').insert({ tenant_id: tenantA, member_id: memberA2Id, principal: 5000, interest_rate: 0, tenor_months: 1, total_repayable: 5000, amount_repaid: 0, status: 'active' }).select().single();
    const base = { tenant_id: tenantA, member_id: me.id, amount: 1000, channel: 'online', status: 'pending', purpose: 'loan_repayment' };
    expect((await memberA1.from('transactions').insert({ ...base, reference: 'T14a-' + Date.now(), loan_id: otherLoan.id })).error).not.toBeNull();
    expect((await memberA1.from('transactions').insert({ ...base, reference: 'T14b-' + Date.now(), loan_id: null })).error).not.toBeNull();
  });

  it('T15 cooperative statement data: staff get only their own cooperative, members are refused', async () => {
    const { data, error } = await bookA.rpc('cooperative_statement', { p_from: '2026-01-01', p_to: '2026-12-31' });
    expect(error).toBeNull();
    expect(data.coop.slug).toBe('adeola-thrift');
    expect(data.members.some((m) => m.member_no === 'B001')).toBe(false);
    expect((await memberA1.rpc('cooperative_statement', { p_from: '2026-01-01', p_to: '2026-12-31' })).error).not.toBeNull();
  });
});
