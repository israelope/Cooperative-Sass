import crypto from 'crypto';

/** Paystack signs the RAW request body with HMAC-SHA512 using your secret key. */
export function computePaystackSignature(rawBody, secret) {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = computePaystackSignature(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
