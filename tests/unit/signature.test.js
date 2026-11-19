import { describe, it, expect } from 'vitest';
import { computePaystackSignature, verifyPaystackSignature } from '@/lib/signature';

const body = JSON.stringify({ event: 'charge.success', data: { reference: 'CT-1', amount: 500000 } });

describe('webhook signature (U9, I2, I3)', () => {
  it('accepts a correctly signed body', () => {
    const sig = computePaystackSignature(body, 'sk_test_secret');
    expect(verifyPaystackSignature(body, sig, 'sk_test_secret')).toBe(true);
  });
  it('rejects a signature made with the wrong secret', () => {
    const sig = computePaystackSignature(body, 'attacker');
    expect(verifyPaystackSignature(body, sig, 'sk_test_secret')).toBe(false);
  });
  it('rejects a tampered body', () => {
    const sig = computePaystackSignature(body, 'sk_test_secret');
    expect(verifyPaystackSignature(body.replace('500000', '900000'), sig, 'sk_test_secret')).toBe(false);
  });
  it('rejects a missing signature', () => expect(verifyPaystackSignature(body, null, 'sk_test_secret')).toBe(false));
});
