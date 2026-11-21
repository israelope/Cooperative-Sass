import { describe, it, expect } from 'vitest';
import { parsePeriod, splitStatement, presetPeriods, lagosDate, isValidDate } from '@/lib/statement';

const E = (date, type, amount, bal, note = '') => ({ entry_date: date + 'T10:00:00Z', entry_type: type, amount, running_balance: bal, note });
const entries = [E('2026-01-05', 'opening', 100000, 100000), E('2026-02-10', 'contribution', 20000, 120000), E('2026-03-10', 'contribution', 20000, 140000), E('2026-04-10', 'withdrawal', 10000, 130000)];

describe('statement period', () => {
  it('parses valid dates and rejects bad ones', () => {
    expect(parsePeriod(new URLSearchParams('from=2026-01-01&to=2026-01-31'))).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(parsePeriod(new URLSearchParams('')).from).toBe(null);
    expect(parsePeriod(new URLSearchParams('from=01/01/2026')).error).toBeTruthy();
    expect(parsePeriod(new URLSearchParams('from=2026-02-01&to=2026-01-01')).error).toBeTruthy();
  });
  it('rejects dates that are not on the calendar', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-04-31')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(parsePeriod(new URLSearchParams('from=2026-02-30')).error).toBeTruthy();
  });
});

describe('splitStatement', () => {
  it('brings forward the balance before the period and closes with the last row', () => {
    const r = splitStatement(entries, '2026-03-01', '2026-03-31');
    expect(r.broughtForward).toBe(120000);
    expect(r.rows.length).toBe(1);
    expect(r.closing).toBe(140000);
  });
  it('with no period it returns everything and brings forward zero', () => {
    const r = splitStatement(entries, null, null);
    expect(r.broughtForward).toBe(0);
    expect(r.rows.length).toBe(4);
    expect(r.closing).toBe(130000);
  });
  it('an empty period closes at the brought-forward balance', () => {
    const r = splitStatement(entries, '2026-05-01', '2026-05-31');
    expect(r.rows.length).toBe(0);
    expect(r.closing).toBe(130000);
  });
  it('uses Nigerian time for the date (UTC 23:30 is already the next day in Lagos)', () => {
    expect(lagosDate('2026-03-31T23:30:00Z')).toBe('2026-04-01');
  });
});

describe('preset periods', () => {
  it('computes this month, last month and this year', () => {
    const p = presetPeriods(new Date('2026-03-15T12:00:00Z'));
    expect(p.thisMonth).toEqual({ from: '2026-03-01', to: '2026-03-15' });
    expect(p.lastMonth).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(p.thisYear.from).toBe('2026-01-01');
  });
  it('last month in January is December of the previous year', () => {
    expect(presetPeriods(new Date('2026-01-10T12:00:00Z')).lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});
