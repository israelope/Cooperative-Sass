import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { requireStaff } from '@/lib/auth';
import { must, mustWithCount } from '@/lib/db';
import { pageOf, pageRange } from '@/lib/pagination';
import { naira, formatDate } from '@/lib/format';
import {
  createCashAccount, addCashEntry, addCashTransfer, setDefaultCashAccount, deleteCashEntry,
} from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cashbook' };

export default async function CashbookPage(props) {
  const searchParams = await props.searchParams;
  const { supabase, profile } = await requireStaff();
  const page = pageOf(searchParams.page);
  const range = pageRange(page);

  const [summary, { rows: entries, count }] = await Promise.all([
    await must(supabase.rpc('cashbook_summary'), 'cashbook summary'),
    await mustWithCount(
      supabase
        .from('cashbook_entries')
        .select('id, kind, category, amount, entry_date, note, reference, transfer_group, cash_accounts(name)', { count: 'exact' })
        .order('entry_date', { ascending: false })
        .range(range.from, range.to),
      'cashbook entries',
    ),
  ]);
  const accounts = summary?.accounts || [];
  const monthly = summary?.monthly || [];
  const categories = summary?.categories || [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Cashbook" intro="Record cooperative expenses, other income and transfers. Member contributions and loan payouts are included automatically." icon="bank" />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.length === 0 && (
          <div className="panel p-5 sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-ink/75">Add your first bank or cash account to start using the cashbook.</p>
          </div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="panel p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
              <Icon name={a.kind === 'bank' ? 'bank' : 'wallet'} size={14} /> {a.name}
              {a.is_default && <span className="rounded bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-700">DEFAULT</span>}
            </p>
            <p className="num mt-2 font-display text-2xl font-bold text-accent-900">{naira(a.balance)}</p>
            <p className="mt-1 text-xs text-ink/60">Opening balance + recorded entries{a.is_default ? ' + member money' : ''}</p>
          </div>
        ))}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="chart" size={18} className="text-accent-500" /> Six-month cashflow</h2>
          {monthly.length === 0 ? (
            <EmptyState compact icon="chart" title="No movement yet" />
          ) : (
            <DataTable caption="Monthly money in, money out and net movement" scroll>
              <thead><tr><th scope="col">Month</th><th scope="col" className="text-right">Money in</th><th scope="col" className="text-right">Money out</th><th scope="col" className="text-right">Net</th></tr></thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="font-semibold">{m.month}</td>
                    <td className="num text-right text-ok-700">{naira(m.income)}</td>
                    <td className="num text-right text-bad-700">{naira(m.expense)}</td>
                    <td className="num text-right font-semibold">{naira(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {categories.length > 0 && (
            <p className="mt-4 text-xs text-ink/70">
              This month by category: {categories.map((c) => `${c.category} ${c.kind === 'income' ? '+' : '−'}${naira(c.total)}`).join(' · ')}
            </p>
          )}
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-accent-900">Accounts</h2>
          <ul className="mb-4 space-y-1 text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate">{a.name}</span>
                {a.is_default ? (
                  <span className="text-xs text-ok-700">Receives member money</span>
                ) : profile.role === 'admin' && (
                  <form action={setDefaultCashAccount}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <SubmitButton className="link text-xs">Make default</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <h3 className="font-semibold text-accent-900">Add an account</h3>
          <ActionForm action={createCashAccount} resetOnSuccess className="mt-2 grid gap-3">
            <Field label="Account name" name="name" placeholder="e.g. Zenith account" />
            <div>
              <label htmlFor="accountKind" className="label">Type *</label>
              <select id="accountKind" name="kind" className="input"><option value="bank">Bank</option><option value="cash">Cash</option></select>
            </div>
            <Field label="Opening balance (₦)" name="openingBalance" type="number" min="0" step="0.01" required={false} defaultValue="0" />
            <SubmitButton className="btn-quiet">Add account</SubmitButton>
          </ActionForm>
        </section>
      </div>

      <section className="panel mb-6 grid max-w-4xl gap-6 p-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold text-accent-900">Record income or expense</h2>
          <ActionForm action={addCashEntry} resetOnSuccess className="mt-3 grid gap-3">
            <div>
              <label htmlFor="kind" className="label">Type *</label>
              <select id="kind" name="kind" className="input"><option value="expense">Expense (money out)</option><option value="income">Other income (money in)</option></select>
            </div>
            <div>
              <label htmlFor="accountId" className="label">Account *</label>
              <select id="accountId" name="accountId" required className="input" disabled={accounts.length === 0}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Field label="Category" name="category" placeholder="e.g. Stationery, Bank charges" />
            <Field label="Amount (₦)" name="amount" type="number" min="0.01" step="0.01" />
            <Field label="Date" name="entryDate" type="date" required={false} defaultValue={today} />
            <Field label="Note" name="note" required={false} placeholder="Optional" />
            <SubmitButton><Icon name="plusCircle" size={16} /> Add entry</SubmitButton>
          </ActionForm>
        </div>
        <div>
          <h2 className="text-lg font-bold text-accent-900">Move money between accounts</h2>
          <p className="mt-1 text-sm text-ink/75">Transfers are excluded from net cashflow.</p>
          <ActionForm action={addCashTransfer} resetOnSuccess className="mt-3 grid gap-3">
            <div>
              <label htmlFor="fromAccount" className="label">From *</label>
              <select id="fromAccount" name="fromAccount" required className="input" disabled={accounts.length < 2}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="toAccount" className="label">To *</label>
              <select id="toAccount" name="toAccount" required className="input" disabled={accounts.length < 2}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Field label="Amount (₦)" name="amount" type="number" min="0.01" step="0.01" />
            <Field label="Date" name="entryDate" type="date" required={false} defaultValue={today} />
            <Field label="Note" name="note" required={false} placeholder="Optional" />
            <SubmitButton className="btn-quiet"><Icon name="refresh" size={16} /> Record transfer</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-accent-900"><Icon name="receipt" size={18} className="text-accent-500" /> Cashbook entries</h2>
      <div className="panel p-2">
        {!entries?.length ? (
          <EmptyState compact icon="receipt" title="No entries yet" description="Add an account, then record an expense or other income." />
        ) : (
          <DataTable caption="Recorded cashbook entries" scroll>
            <thead><tr><th scope="col">Date</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Category</th><th scope="col" className="text-right">Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.entry_date)}</td>
                  <td className="whitespace-nowrap">{e.cash_accounts?.name || '—'}</td>
                  <td className="capitalize">{e.kind.replace('_', ' ')}</td>
                  <td>{e.category}<span className="block text-xs text-ink/70">{e.note || e.reference || ''}</span></td>
                  <td className={`num text-right font-semibold ${e.kind === 'income' || e.kind === 'transfer_in' ? 'text-ok-700' : 'text-bad-700'}`}>
                    {e.kind === 'income' || e.kind === 'transfer_in' ? '+' : '−'}{naira(e.amount)}
                  </td>
                  <td>
                    <form action={deleteCashEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton className="btn-quiet btn-sm">Delete</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination page={page} total={count} basePath="/admin/cashbook" />
      </div>
    </>
  );
}
