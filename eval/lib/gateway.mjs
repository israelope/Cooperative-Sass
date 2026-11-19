import crypto from 'crypto';

/** A Paystack-style charge.success payload (money in kobo). */
export function chargeSuccess(ref, { amountKobo, feeKobo, shareKobo }) {
  return { event: 'charge.success', data: { reference: ref, amount: amountKobo, currency: 'NGN', status: 'success', fees: feeKobo, fees_split: { subaccount: shareKobo } } };
}
export const chargeFailed = (ref) => ({ event: 'charge.failed', data: { reference: ref, status: 'failed' } });
export const sign = (raw, secret) => crypto.createHmac('sha512', secret).update(raw).digest('hex');

export async function postSigned(url, payload, secret) {
  const raw = JSON.stringify(payload);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sign(raw, secret) }, body: raw });
  if (!res.ok && res.status !== 200) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json().catch(() => ({}));
}

/** Runs async tasks with a concurrency limit. */
export async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  });
  await Promise.all(workers);
}
