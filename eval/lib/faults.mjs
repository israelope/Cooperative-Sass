// Fault model of Chapter 3, Section 3.10.5.1 and Table "Fault classes" (3.8.4).
// All money here is in KOBO (integers) to avoid floating-point error.
import { mulberry32, randInt, pick } from './rng.mjs';

export const FAULTS = ['partial_payment', 'duplicate_webhook', 'delayed_settlement', 'failed_leg', 'rounding_diff', 'out_of_order'];

/** Ground truth: expected final status and whether the case counts as a mismatch. */
export const EXPECTED = {
  none:               { status: 'AUTO_MATCHED', mismatch: false },
  partial_payment:    { status: 'NEEDS_REVIEW', mismatch: true },
  duplicate_webhook:  { status: 'AUTO_RESOLVED', mismatch: true },
  delayed_settlement: { status: 'AUTO_RESOLVED', mismatch: true },
  failed_leg:         { status: 'NEEDS_REVIEW', mismatch: true },
  rounding_diff:      { status: 'AUTO_RESOLVED', mismatch: true },
  out_of_order:       { status: 'AUTO_RESOLVED', mismatch: true },
};

export const PLATFORM_FEE_KOBO = 5000;                  // NGN 50 flat, as in the example configuration
export const FEE_BEARER = 'subaccount';                 // the cooperative bears Paystack's fee

/** Paystack-like processing fee: 1.5% (+ NGN 100 from NGN 2,500), capped at NGN 2,000. */
export function paystackFeeKobo(amountKobo) {
  return Math.min(200000, Math.round(amountKobo * 0.015) + (amountKobo >= 250000 ? 10000 : 0));
}

/** The cooperative's share the platform expects: X - F - P (the cooperative bears P). */
export const expectedShareKobo = (amountKobo, platformFeeKobo, feeKobo) => amountKobo - platformFeeKobo - feeKobo;

/**
 * Generates n split payments, a fraction `faultRate` of them faulty, each with its ground truth.
 * `tag` makes payment references unique per run.
 */
export function generate({ n, faultRate, seed, tag = `s${seed}`, members = 20 }) {
  const rng = mulberry32(seed);
  const items = [];
  for (let i = 0; i < n; i++) {
    const amountKobo = (1000 + 500 * randInt(rng, 0, 198)) * 100;               // NGN 1,000 to 100,000
    const feeKobo = paystackFeeKobo(amountKobo);
    const share = expectedShareKobo(amountKobo, PLATFORM_FEE_KOBO, feeKobo);
    const fault = rng() < faultRate ? pick(rng, FAULTS) : 'none';
    const item = {
      i, reference: `EV-${tag}-${i}`, memberIndex: i % members,
      amountKobo, platformFeeKobo: PLATFORM_FEE_KOBO, feeKobo, expectedShareKobo: share,
      fault, expected: EXPECTED[fault],
      receivedKobo: amountKobo, shareKobo: share, copies: 1, variant: null, legMode: null,
    };
    if (fault === 'partial_payment') item.receivedKobo = Math.max(100, Math.round(amountKobo * (1 - (0.01 + rng() * 0.49))));
    if (fault === 'duplicate_webhook') item.copies = randInt(rng, 2, 3);
    if (fault === 'rounding_diff') item.shareKobo = share + (rng() < 0.5 ? 1 : -1);
    if (fault === 'failed_leg') { item.legMode = rng() < 0.5 ? 'leg_failed' : 'short_share'; }
    if (fault === 'out_of_order') item.variant = rng() < 0.5 ? 'early' : 'late_failure';
    items.push(item);
  }
  return items;
}
