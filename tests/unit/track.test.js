import { describe, it, expect } from 'vitest';
import { isBot, parseDevice, normalisePath, visitorHash } from '@/lib/track';

describe('visit tracking helpers', () => {
  it('detects bots and empty user agents', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36')).toBe(false);
  });
  it('classifies devices', () => {
    expect(parseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile Safari')).toBe('mobile');
    expect(parseDevice('Mozilla/5.0 (Linux; Android 13; SM-T500) Safari')).toBe('tablet');
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe('desktop');
  });
  it('ignores platform, api and internal paths', () => {
    expect(normalisePath('/platform')).toBe(null);
    expect(normalisePath('/api/track')).toBe(null);
    expect(normalisePath('https://evil.com')).toBe(null);
  });
  it('normalises ids and extracts the cooperative slug', () => {
    expect(normalisePath('/admin/members/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toEqual({ path: '/admin/members/:id', tenantSlug: null });
    expect(normalisePath('/c/adeola-thrift/join?x=1')).toEqual({ path: '/c/:slug/join', tenantSlug: 'adeola-thrift' });
  });
  it('hashes differ by day and never contain the raw IP', () => {
    const a = visitorHash({ salt: 's', ip: '102.89.1.2', ua: 'x', day: '2026-10-01' });
    const b = visitorHash({ salt: 's', ip: '102.89.1.2', ua: 'x', day: '2026-10-02' });
    expect(a === b).toBe(false);
    expect(a.includes('102')).toBe(false);
  });
});
