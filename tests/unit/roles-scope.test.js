import { describe, it, expect } from 'vitest';
import { roleHome, sectionFor, canAccess, scopeHref, slugFromPath } from '@/lib/roles';

describe('tenant-scoped routing', () => {
  it('sends tenant roles to their co-op address and the owner to /platform', () => {
    expect(roleHome('member', 'adeola-thrift')).toBe('/c/adeola-thrift/member');
    expect(roleHome('admin', 'adeola-thrift')).toBe('/c/adeola-thrift/admin');
    expect(roleHome('bookkeeper', 'adeola-thrift')).toBe('/c/adeola-thrift/admin');
    expect(roleHome('platform_admin', 'adeola-thrift')).toBe('/platform');
  });

  it('keeps a legacy fallback when no slug is known yet', () => {
    expect(roleHome('member')).toBe('/member');
    expect(roleHome('admin')).toBe('/admin');
  });

  it('recognises sections on scoped and legacy paths', () => {
    expect(sectionFor('/c/adeola-thrift/member/pay')).toBe('member');
    expect(sectionFor('/c/adeola-thrift/admin/loans')).toBe('staff');
    expect(sectionFor('/member')).toBe('member');
    expect(sectionFor('/admin/members')).toBe('staff');
    expect(sectionFor('/platform/revenue')).toBe('platform');
  });

  it('enforces the same role rules on scoped paths', () => {
    expect(canAccess('member', 'member')).toBe(true);
    expect(canAccess('member', 'staff')).toBe(false);
    expect(canAccess('bookkeeper', 'staff')).toBe(true);
    expect(canAccess('admin', 'platform')).toBe(false);
  });

  it('keeps app links inside the current co-op', () => {
    const pathname = '/c/adeola-thrift/member/passbook';
    expect(scopeHref('/member/pay', pathname)).toBe('/c/adeola-thrift/member/pay');
    expect(scopeHref('/member/notifications?filter=unread', pathname)).toBe('/c/adeola-thrift/member/notifications?filter=unread');
    expect(scopeHref('/c/other/member', pathname)).toBe('/c/other/member');
    expect(scopeHref('/help', pathname)).toBe('/help');
  });

  it('extracts the slug from a scoped path', () => {
    expect(slugFromPath('/c/adeola-thrift/admin/loans')).toBe('adeola-thrift');
    expect(slugFromPath('/admin/loans')).toBeNull();
  });
});
