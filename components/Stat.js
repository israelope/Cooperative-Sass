import Link from 'next/link';
import Icon from '@/components/Icon';

/**
 * A single KPI card. `tone` is a Tailwind text-colour class, `icon` is an Icon
 * name, and `href` turns the whole card into a link.
 */
export function Stat({ label, value, sub, tone = 'text-accent-900', icon, href, className = '' }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink/75">{label}</p>
        {icon && <Icon name={icon} size={18} className="text-accent-300" />}
      </div>
      <p className={`num mt-2 font-display text-2xl font-bold leading-tight sm:text-[1.65rem] ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs leading-snug text-ink/70">{sub}</p>}
    </>
  );

  return (
    <div className={`bg-white px-4 py-4 sm:px-5 ${className}`}>
      {href ? (
        <Link href={href} className="hover-lift group block rounded-lg focus-visible:outline-offset-4">{body}</Link>
      ) : body}
    </div>
  );
}

/** Gap-px grid gives clean 1px dividers between any number of rows/columns. */
export function StatGrid({ children, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', className = '', panel = true }) {
  return (
    <div className={`grid ${cols} gap-px bg-rule ${panel ? 'overflow-hidden rounded-xl ring-1 ring-rule' : ''} ${className}`}>
      {children}
    </div>
  );
}

/** Backwards-compatible alias for pages that used a local `Kpi` helper. */
export const Kpi = Stat;

export default Stat;
