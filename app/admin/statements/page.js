import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import { requireStaff } from '@/lib/auth';
import { presetPeriods } from '@/lib/statement';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Statements' };

export default async function StatementsPage() {
  await requireStaff();
  const p = presetPeriods();
  const qs = (x) => `from=${x.from}&to=${x.to}`;
  return (
    <>
      <PageHeader title="Statements" intro="Download your cooperative's statement as a PDF: collections by channel, every member's savings and loan balance, and every payment in the period." icon="fileText" />

      <section className="panel mb-6 grid max-w-2xl gap-4 p-6 sm:grid-cols-3">
        <div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Icon name="card" size={18} /></span>
          <p className="mt-2 text-sm font-semibold text-accent-900">Collections</p>
          <p className="text-xs text-ink/75">By channel and purpose</p>
        </div>
        <div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Icon name="users" size={18} /></span>
          <p className="mt-2 text-sm font-semibold text-accent-900">Member balances</p>
          <p className="text-xs text-ink/75">Savings and loans per member</p>
        </div>
        <div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Icon name="receipt" size={18} /></span>
          <p className="mt-2 text-sm font-semibold text-accent-900">Every payment</p>
          <p className="text-xs text-ink/75">Listed for the chosen period</p>
        </div>
      </section>

      <section className="panel max-w-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="calendar" size={18} className="text-accent-500" /> Quick periods</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <a className="btn-gold" href={`/api/statements/cooperative?${qs(p.thisMonth)}`}><Icon name="download" size={16} /> This month (PDF)</a>
          <a className="btn-quiet" href={`/api/statements/cooperative?${qs(p.lastMonth)}`}><Icon name="download" size={16} /> Last month (PDF)</a>
          <a className="btn-quiet" href={`/api/statements/cooperative?${qs(p.thisYear)}`}><Icon name="download" size={16} /> This year (PDF)</a>
        </div>

        <h2 className="mt-8 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="fileText" size={18} className="text-accent-500" /> Choose your own dates</h2>
        <form method="get" action="/api/statements/cooperative" className="mt-3 grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" required defaultValue={p.thisMonth.from} className="input" /></div>
          <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" required defaultValue={p.thisMonth.to} className="input" /></div>
          <div className="flex items-end"><button className="btn-primary w-full"><Icon name="download" size={16} /> Download PDF</button></div>
        </form>
        <p className="hint mt-3">Need the raw rows for a spreadsheet? Use <a className="link" href={`/api/export/payments?${qs(p.thisYear)}`}><Icon name="download" size={14} /> Export payments (CSV)</a>. Individual member statements are on each member&apos;s page.</p>
      </section>
    </>
  );
}
