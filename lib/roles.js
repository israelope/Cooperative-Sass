/** One source of truth for role routing, shared by the proxy, guards and login. */

export const APP_ROLES = ['platform_admin', 'admin', 'bookkeeper', 'member'];

export function roleHome(role) {
  if (role === 'platform_admin') return '/platform';
  if (role === 'member') return '/member';
  return '/admin';
}

export function sectionFor(pathname = '') {
  if (pathname.startsWith('/platform')) return 'platform';
  if (pathname.startsWith('/admin')) return 'staff';
  return 'member';
}

export function canAccess(role, section) {
  if (section === 'platform') return role === 'platform_admin';
  if (section === 'staff') return role === 'admin' || role === 'bookkeeper';
  return role === 'member';
}
