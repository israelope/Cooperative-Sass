const RESERVED = new Set(['admin', 'member', 'api', 'login', 'register', 'claim', 'c', 'www', 'app', 'static', 'public', 'settings']);

export function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return s || 'cooperative';
}

export const isReservedSlug = (s) => RESERVED.has(s);
