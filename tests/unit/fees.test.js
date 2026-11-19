import { describe, it, expect } from 'vitest';
import { computePlatformFeeKobo, feeConfig } from '@/lib/fees';

describe('platform fee', () => {
  it('flat fee only', () => expect(computePlatformFeeKobo(2_000_000, { flatKobo: 5000, percent: 0 })).toBe(5000));
  it('flat + percentage (N50 + 1.5% of N5,000)', () => expect(computePlatformFeeKobo(500_000, { flatKobo: 5000, percent: 1.5 })).toBe(12500));
  it('is zero when nothing is configured', () => expect(computePlatformFeeKobo(500_000, {})).toBe(0));
  it('never takes more than half of a small payment', () => expect(computePlatformFeeKobo(10_000, { flatKobo: 9000, percent: 0 })).toBe(5000));
  it('reads settings from the environment and defaults the bearer to the cooperative', () => {
    expect(feeConfig({ PLATFORM_FEE_KOBO: '5000', PLATFORM_FEE_PERCENT: '1' })).toEqual({ flatKobo: 5000, percent: 1, bearer: 'subaccount' });
    expect(feeConfig({ PAYSTACK_BEARER: 'account' }).bearer).toBe('account');
    expect(feeConfig({ PLATFORM_FEE_KOBO: 'abc' }).flatKobo).toBe(0);
  });
});
