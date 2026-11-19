import PageHeader from '@/components/PageHeader';
import { requireStaff } from '@/lib/auth';
import { presetPeriods } from '@/lib/statement';

export const dynamic = 'force-dynamic';

export default async function StatementsPage() {
  await requireStaff();
  const p = presetPeriods();
  const qs = (x) => `from=${x.from}&to=${x.to}`;
  return (
    <>
      <PageHeader title="Statements" intro="Download your cooperative's statement as a PDF: collections by channel, every member's savings and loan balance, and every payment in the period." />

      <section className="panel max-w-2xl p-6">
        <h2 className="text-lg font-bold text-adire-900">Quick periods</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <a className="btn-gold" href={`/api/statements/cooperative?${qs(p.thisMonth)}`}>This month (PDF)</a>
          <a className="btn-quiet" href={`/api/statements/cooperative?${qs(p.lastMonth)}`}>Last month (PDF)</a>
          <a className="btn-quiet" href={`/api/statements/cooperative?${qs(p.thisYear)}`}>This year (PDF)</a>
        </div>

        <h2 className="mt-8 text-lg font-bold text-adire-900">Choose your own dates</h2>
        <form method="get" action="/api/statements/cooperative" className="mt-3 grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" required defaultValue={p.thisMonth.from} className="input" /></div>
          <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" required defaultValue={p.thisMonth.to} className="input" /></div>
          <div className="flex items-end"><button className="btn-primary w-full">Download PDF</button></div>
        </form>
        <p className="hint mt-3">Need the raw rows for a spreadsheet? Use <a className="font-semibold text-adire-700 underline" href={`/api/export/payments?${qs(p.thisYear)}`}>Export payments (CSV)</a>. Individual member statements are on each member's page.</p>
      </section>
    </>
  );
}
