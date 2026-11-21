// Minimal in-memory limiter for the claim-code endpoint.
// NOTE: on serverless hosting each instance has its own memory, so this slows guessing
// but is not a hard guarantee. Claim codes are also random, single-use and 31^8 in size.
const hits = new Map();

/** Best-effort client address; proxies can set either header. */
export function clientIp(headers) {
  const forwarded = headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'local';
  return forwarded.split(',')[0].trim();
}

export function rateLimit(key, { max = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const rec = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (rec.length >= max) {
    hits.set(key, rec);
    return false;
  }
  rec.push(now);
  hits.set(key, rec);
  if (hits.size > 5000) hits.clear();
  return true;
}
