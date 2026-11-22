import Link from 'next/link';
import Icon from '@/components/Icon';
import EmptyState from '@/components/EmptyState';
import { formatDate } from '@/lib/format';
import { markNotificationRead } from '@/app/actions/notifications';

const ICONS = {
  payment: 'wallet', loan: 'bank', contribution: 'calendar',
  announcement: 'info', cashbook: 'bank', general: 'mail',
};

export default function NotificationsList({ notifications, emptyText }) {
  if (!notifications?.length) {
    return <EmptyState icon="mail" title="Nothing here yet" description={emptyText} />;
  }
  return (
    <ul className="divide-y divide-rule">
      {notifications.map((n) => {
        const unread = !n.read_at;
        return (
          <li key={n.id} className={`flex flex-wrap items-start gap-3 px-4 py-4 ${unread ? 'bg-accent-50/50' : ''}`}>
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              <Icon name={ICONS[n.category] || 'mail'} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-accent-900">
                {n.title}
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-bad-600" aria-label="Unread" />}
              </p>
              <p className="mt-0.5 text-sm text-ink/75">{n.body}</p>
              <p className="mt-1 text-xs text-ink/60">{formatDate(n.created_at)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {n.href && <Link href={n.href} className="link inline-flex items-center gap-1 text-xs"><Icon name="arrowRight" size={13} /> Open</Link>}
                {unread && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="link text-xs text-ink/70">Mark as read</button>
                  </form>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
