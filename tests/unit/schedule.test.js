import { describe, it, expect } from 'vitest';
import { nextDueDate } from '@/lib/schedule';

const date = (s) => new Date(`${s}T00:00:00`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('savings schedule preview', () => {
  it('keeps a monthly date in the current month when it is still ahead', () => {
    expect(iso(nextDueDate('monthly', 28, null, date('2026-11-05')))).toBe('2026-11-28');
  });

  it('rolls a passed monthly date into next month', () => {
    expect(iso(nextDueDate('monthly', 5, null, date('2026-11-20')))).toBe('2026-12-05');
  });

  it('never uses a day above 28', () => {
    expect(iso(nextDueDate('monthly', 31, null, date('2026-11-05')))).toBe('2026-11-28');
  });

  it('finds the next weekly day, including today', () => {
    // 2026-11-22 is a Sunday (dow 0)
    expect(iso(nextDueDate('weekly', null, 0, date('2026-11-22')))).toBe('2026-11-22');
    expect(iso(nextDueDate('weekly', null, 3, date('2026-11-22')))).toBe('2026-11-25');
  });
});
