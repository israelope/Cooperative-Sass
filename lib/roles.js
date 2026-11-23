/** One source of truth for role routing, shared by the proxy, guards and login. */

export const APP_ROLES = ['platform_admin', 'admin', 'bookkeeper', 'member'];

/** The browser-facing home for a role. Tenant users get a co-op-scoped address. */
export function roleHome(role, slug) {
  if (role === 'platform_admin') return '/platform';
  if (!slug) return role === 'member' ? '/member' : '/admin';
  return `/${slug}/${role === 'member' ? 'member' : 'admin'}`;
}

/** Which part of the app a path belongs to (works for scoped and legacy paths). */
export function sectionFor(pathname = '') {
  if (pathname.startsWith('/platform')) return 'platform';
  if (/(^|\/)admin(\/|$)/.test(pathname)) return 'staff';
  return 'member';
}

export function canAccess(role, section) {
  if (section === 'platform') return role === 'platform_admin';
  if (section === 'staff') return role === 'admin' || role === 'bookkeeper';
  return role === 'member';
}

/** Add the tenant prefix to an app link so navigation keeps its scoped URL. */
export function scopeHref(href, pathname = '') {
  if (typeof href !== 'string') return href;
  const match = pathname.match(/^\/([^/]+)\/(member|admin)(?:\/|$)/);
  if (!match) return href;
  const [, slug, section] = match;
  if (href === `/${section}` || href.startsWith(`/${section}/`)) return `/${slug}${href}`;
  return href;
}

/** Read the co-op slug out of a scoped pathname. */
export function slugFromPath(pathname = '') {
  return pathname.match(/^\/([^/]+)\/(member|admin)(?:\/|$)/)?.[1] || null;
}
