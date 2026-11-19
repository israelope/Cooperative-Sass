import { describe, it, expect } from 'vitest';
import { buildMemberStatement, buildCooperativeStatement } from '@/lib/pdf/statements';

const head = (bytes) => Buffer.from(bytes.slice(0, 5)).toString();

describe('PDF statements', () => {
  it('builds a member statement (with accented names and long lists) as a valid PDF', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ entry_date: '2026-02-01T10:00:00Z', entry_type: 'contribution', amount: 1000, running_balance: 1000 * (i + 1), note: 'Online payment' }));
    const bytes = await buildMemberStatement({
      coopName: 'Adeola Thrift Society', member: { member_no: 'A001', full_name: 'Ọlayinka Ṣẹ́gun' },
      summary: { savings: 120000, outstanding: 0, loan_limit: 240000 }, period: { from: null, to: null }, broughtForward: 0, rows, closing: 120000, loans: [],
    });
    expect(head(bytes)).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it('builds a cooperative statement even when there are no payments', async () => {
    const bytes = await buildCooperativeStatement({
      coop: { name: 'UI Staff Cooperative', slug: 'ui-staff' }, period: { from: '2026-10-01', to: '2026-10-31' },
      summary: { members_total: 0, members_active: 0, total_savings: 0, loans_active: 0, loans_outstanding: 0, collected: 0, payments_count: 0, online: 0, cash: 0, transfer: 0, recorded: 0, contributions: 0, repayments: 0 },
      members: [], payments: [],
    });
    expect(head(bytes)).toBe('%PDF-');
  });
});
