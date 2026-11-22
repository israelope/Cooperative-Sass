import Link from 'next/link';
import Icon from '@/components/Icon';
import { PAGE_HELP } from '@/lib/help-content';

export default function PageHeader({ title, children, intro, icon, helpKey }) {
  const help = helpKey ? PAGE_HELP[helpKey] : null;

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-accent-900 sm:text-3xl">
          {icon && (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
              <Icon name={icon} size={19} />
            </span>
          )}
          {title}
        </h1>
        {intro && <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink/75">{intro}</p>}
        {help?.href && (
          <Link href={help.href} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 hover:underline">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent-100"><Icon name="info" size={11} /></span>
            {help.label || 'Help with this page'}
          </Link>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
