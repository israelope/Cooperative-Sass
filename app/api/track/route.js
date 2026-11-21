import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isBot, parseDevice, normalisePath, visitorHash } from '@/lib/track';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/** Records one page view. No cookies, no stored IP address. Bots and platform pages are ignored. */
export async function POST(req) {
  const ua = req.headers.get('user-agent') || '';
  if (isBot(ua)) return new NextResponse(null, { status: 204 });

  const body = await req.json().catch(() => ({}));
  const norm = normalisePath(body?.path);
  if (!norm) return new NextResponse(null, { status: 204 });

  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  // Never derive the daily salt from a public or predictable value: visitor
  // hashes could then be correlated. Skip tracking until it is configured.
  const salt = process.env.VISIT_SALT || (process.env.NODE_ENV !== 'production' ? 'dev-only-visit-salt' : null);
  if (!salt) return new NextResponse(null, { status: 204 });
  const hash = visitorHash({ salt, ip, ua, day });
  if (!rateLimit(`track:${hash}`, { max: 90, windowMs: 60_000 })) return new NextResponse(null, { status: 204 });

  await createServiceClient().from('site_visits').insert({
    path: norm.path, tenant_slug: norm.tenantSlug, visitor_hash: hash, device: parseDevice(ua),
  });
  return new NextResponse(null, { status: 204 });
}
