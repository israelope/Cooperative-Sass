// Pure helpers for privacy-friendly visit tracking (unit-tested).
import crypto from 'crypto';
import { isReservedSlug } from '@/lib/slug';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|headless|lighthouse|vercel-|uptime|curl|wget|python-requests/i;

export function isBot(ua) {
  return !ua || BOT_RE.test(ua);
}

export function parseDevice(ua) {
  const s = String(ua || '');
  if (/ipad|tablet|kindle|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(s)) return 'mobile';
  return 'desktop';
}

/** Returns { path, tenantSlug } or null when the path should not be counted. */
export function normalisePath(input) {
  let p = String(input || '').split('?')[0].split('#')[0];
  if (!p.startsWith('/') || p.length > 200) return null;
  if (p.startsWith('/platform') || p.startsWith('/api') || p.startsWith('/_next')) return null;
  p = p.replace(UUID_RE, ':id');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  // Fold the old /c/<co-op>/... links into the current format before grouping.
  p = p.replace(/^\/c\/([a-z0-9-]+)/, '/$1');
  let tenantSlug = null;
  const m = p.match(/^\/([a-z0-9-]+)(\/.*)?$/);
  if (m && !isReservedSlug(m[1])) {
    tenantSlug = m[1];
    p = '/:slug' + (m[2] || '');
  }
  return { path: p, tenantSlug };
}

/** SHA-256 over a salt that changes daily: cannot be reversed to an IP and cannot follow a person across days. */
export function visitorHash({ salt, ip, ua, day }) {
  return crypto.createHash('sha256').update(`${salt}|${day}|${ip}|${ua}`).digest('hex').slice(0, 32);
}
