import { describe, it, expect } from 'vitest';
import { validateRows, normalisePhone } from '@/lib/importValidate';

const good = { member_no: '001', full_name: 'Adeola Bamidele', phone: '08012345678', email: '', opening_savings: '150000.00', opening_loan_balance: '' };

describe('bulk import validation (U6, U7)', () => {
  it('accepts a valid row', () => {
    const { valid, errors } = validateRows([good]);
    expect(errors).toEqual([]);
    expect(valid[0].opening_savings).toBe(150000);
  });
  it('rejects a duplicate member_no', () => {
    const { errors } = validateRows([good, { ...good, full_name: 'Someone Else' }]);
    expect(errors[0]).toMatch(/Row 3.*duplicate/);
  });
  it('rejects an invalid phone number', () => {
    const { errors } = validateRows([{ ...good, phone: '12345' }]);
    expect(errors[0]).toMatch(/phone/);
  });
  it('rejects negative or malformed amounts', () => {
    expect(validateRows([{ ...good, opening_savings: '-5' }]).errors.length).toBe(1);
    expect(validateRows([{ ...good, opening_savings: '10.123' }]).errors.length).toBe(1);
    expect(validateRows([{ ...good, opening_savings: 'abc' }]).errors.length).toBe(1);
  });
  it('repairs a phone number whose leading zero Excel removed', () => expect(normalisePhone(8012345678)).toBe('08012345678'));
  it('accepts +234 numbers and comma-formatted money', () => {
    const { valid, errors } = validateRows([{ ...good, phone: '+2347031234567', opening_savings: '1,250.50' }]);
    expect(errors).toEqual([]);
    expect(valid[0].opening_savings).toBe(1250.5);
  });
  it('rejects an empty file', () => expect(validateRows([]).errors.length).toBe(1));
});
