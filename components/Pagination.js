import Link from 'next/link';
import Icon from '@/components/Icon';
import { PAGE_SIZE } from '@/lib/pagination';

const ACTIVE = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-accent-800 px-2 text-xs font-bold text-white';
const IDLE = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-rule px-2 text-xs font-semibold text-ink/75 transition-colors hover:bg-accent-50 hover:text-accent-800';

/** Server-rendered page links that preserve the page's existing filters. */
export default function Pagination({ page, total, params = {}, basePath, pageSize = PAGE_SIZE }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const href = (p) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== '' && value != null) sp.set(key, String(value));
    }
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const first = Math.max(1, Math.min(page - 2, pages - 4));
  const visible = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i).filter((p) => p <= pages);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-3 py-3">
      <p className="text-xs text-ink/75">Showing {from}–{to} of {total}</p>
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={IDLE} aria-label="Previous page">
            <Icon name="chevronRight" size={14} className="rotate-180" /><span className="ml-1">Previous</span>
          </Link>
        ) : <span className={`${IDLE} opacity-40`} aria-hidden="true">Previous</span>}
        {visible.map((p) => (
          <Link key={p} href={href(p)} className={p === page ? ACTIVE : IDLE} aria-current={p === page ? 'page' : undefined}>{p}</Link>
        ))}
        {page < pages ? (
          <Link href={href(page + 1)} className={IDLE} aria-label="Next page">
            Next<Icon name="chevronRight" size={14} className="ml-1" />
          </Link>
        ) : <span className={`${IDLE} opacity-40`} aria-hidden="true">Next</span>}
      </div>
    </nav>
  );
}
