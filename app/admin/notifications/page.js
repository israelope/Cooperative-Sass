import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import NotificationsList from '@/components/NotificationsList';
import Pagination from '@/components/Pagination';
import { requireStaff } from '@/lib/auth';
import { mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { broadcastAnnouncement } from '@/app/admin/actions';
import { markAllNotificationsRead } from '@/app/actions/notifications';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function AdminNotifications(props) {
  const searchParams = await props.searchParams;
  const { supabase, profile } = await requireStaff();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);
  const unreadOnly = searchParams.filter === 'unread';

  let query = supabase
    .from('notifications')
    .select('id, title, body, href, category, read_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(range.from, range.to);
  if (unreadOnly) query = query.is('read_at', null);
  const { rows, count } = await mustWithCount(query, 'staff notifications');

  return (
    <>
      <PageHeader title="Notifications" intro="Cooperative alerts for officers and announcements for members." icon="mail">
        {count > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="btn-quiet"><Icon name="check" size={16} /> Mark all as read</button>
          </form>
        )}
      </PageHeader>

      {profile.role === 'admin' && (
        <section className="panel mb-6 max-w-2xl p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="info" size={18} className="text-accent-500" /> Announce something to members</h2>
          <p className="mt-1 text-sm text-ink/75">Delivered to every active member&apos;s in-app inbox. No email or SMS is sent.</p>
          <ActionForm action={broadcastAnnouncement} resetOnSuccess className="mt-4 grid gap-4">
            <Field label="Title" name="title" placeholder="e.g. Meeting on Saturday" />
            <div>
              <label htmlFor="body" className="label">Message *</label>
              <textarea id="body" name="body" rows={3} required minLength={5} className="input" placeholder="What should members know?" />
            </div>
            <Field label="Link (optional)" name="href" required={false} placeholder="/member/pay" hint="App path such as /member/pay, or leave blank." />
            <div><SubmitButton><Icon name="mail" size={16} /> Send announcement</SubmitButton></div>
          </ActionForm>
        </section>
      )}

      <div className="mb-4 flex gap-2">
        <Link href="/admin/notifications" className={unreadOnly ? 'btn-quiet' : 'btn-primary'}>All</Link>
        <Link href="/admin/notifications?filter=unread" className={unreadOnly ? 'btn-primary' : 'btn-quiet'}>Unread only</Link>
      </div>

      <div className="panel p-0">
        <NotificationsList notifications={rows} emptyText="Officer alerts such as new payments and loan requests will appear here." />
        <Pagination page={page} total={count} basePath="/admin/notifications" params={{ filter: unreadOnly ? 'unread' : '' }} />
      </div>
    </>
  );
}
