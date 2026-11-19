// Platform fee calculation (pure, unit-tested). All amounts in KOBO.

/** Reads the fee settings from environment variables. */
export function feeConfig(env = process.env) {
  return {
    flatKobo: Math.max(0, parseInt(env.PLATFORM_FEE_KOBO || '0', 10) || 0),
    percent: Math.max(0, Number(env.PLATFORM_FEE_PERCENT || 0) || 0),
    // Who pays Paystack's own processing fee. 'subaccount' = the cooperative (platform keeps its fee in full).
    bearer: env.PAYSTACK_BEARER === 'account' ? 'account' : 'subaccount',
  };
}

/** fee = flat + percent of the payment, never more than half of the payment. */
export function computePlatformFeeKobo(amountKobo, { flatKobo = 0, percent = 0 } = {}) {
  const raw = Math.round(flatKobo + (amountKobo * percent) / 100);
  const cap = Math.floor(amountKobo * 0.5);
  return Math.max(0, Math.min(raw, cap));
}
