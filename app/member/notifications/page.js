import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import NotificationsList from '@/components/NotificationsList';
import Pagination from '@/components/Pagination';
import { requireMember } from '@/lib/auth';
import { mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { markAllNotificationsRead } from '@/app/actions/notifications';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function MemberNotifications(props) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireMember();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const unreadOnly = searchParams.filter === 'unread';

  let query = supabase
    .from('notifications')
    .select('id, title, body, href, category, read_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(range.from, range.to);
  if (unreadOnly) query = query.is('read_at', null);
  const { rows, count } = await mustWithCount(query, 'notifications');

  return (
    <>
      <PageHeader title="Notifications" intro="Payments, loan updates and messages from your cooperative, all in one place." icon="mail" helpKey="memberNotifications">
        {count > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="btn-quiet"><Icon name="check" size={16} /> Mark all as read</button>
          </form>
        )}
      </PageHeader>

      <div className="mb-4 flex gap-2">
        <Link href="/member/notifications" className={unreadOnly ? 'btn-quiet' : 'btn-primary'}>All</Link>
        <Link href="/member/notifications?filter=unread" className={unreadOnly ? 'btn-primary' : 'btn-quiet'}>Unread only</Link>
      </div>

      <div className="panel p-0">
        <NotificationsList notifications={rows} emptyText="New notices will appear here after a payment, a loan update or an announcement." />
        <Pagination page={page} total={count} basePath="/member/notifications" params={{ filter: unreadOnly ? 'unread' : '' }} />
      </div>
    </>
  );
}
