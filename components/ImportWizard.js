'use client';
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import DataTable from '@/components/DataTable';
import { naira, toCsv } from '@/lib/format';

export default function ImportWizard({ action }) {
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  // Keep the chosen file so "Check" followed by "Import" works even if the browser clears the input.
  const submit = async (prev, fd) => {
    const f = fd.get('file');
    if ((!f || f.size === 0) && fileRef.current) fd.set('file', fileRef.current);
    return action(prev, fd);
  };
  const today = new Date().toISOString().slice(0, 10);

  function downloadCodes(rows) {
    const csv = toCsv([['member_no', 'full_name', 'claim_code'], ...rows.map((r) => [r.member_no, r.full_name, r.claim_code])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'claim-codes.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  const step = result?.preview || result?.errors ? 2 : 1;
  const stepClass = (active) => `inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${active ? 'bg-adire-700 text-white' : 'bg-adire-50 text-adire-700'}`;

  if (result?.imported) {
    return (
      <div>
        <div className="callout-ok" role="status">
          <Icon name="checkCircle" size={18} className="mt-0.5" />
          <span>{result.message}</span>
        </div>
        <h2 className="mt-6 flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="users" size={18} className="text-adire-500" /> Members imported</h2>
        <p className="mt-1 text-sm text-ink/75">Download or print this list now. You can also find each code on the Members page until the member uses it.</p>
        <button className="btn-gold mt-3" onClick={() => downloadCodes(result.imported)}><Icon name="download" size={16} /> Download claim codes (CSV)</button>
        <div className="panel mt-4 p-2">
          <DataTable caption="Imported members and their claim codes">
            <thead><tr><th scope="col">No.</th><th scope="col">Name</th><th scope="col">Claim code</th></tr></thead>
            <tbody>{result.imported.map((r) => <tr key={r.member_no}><td className="num">{r.member_no}</td><td>{r.full_name}</td><td className="font-mono font-semibold">{r.claim_code}</td></tr>)}</tbody>
          </DataTable>
        </div>
        <button className="btn-quiet mt-4" onClick={() => setResult(null)}><Icon name="refresh" size={16} /> Import another file</button>
      </div>
    );
  }

  return (
    <ActionForm action={submit} onResult={setResult} className="panel max-w-3xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Import progress">
        <span className={stepClass(step === 1)}><span className="num">1</span> Choose file</span>
        <Icon name="arrowRight" size={16} className="text-adire-300" />
        <span className={stepClass(step === 2)}><span className="num">2</span> Review &amp; import</span>
      </div>
      <div>
        <label htmlFor="file" className="label">Spreadsheet (.xlsx, .xls or .csv)</label>
        <input id="file" name="file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { fileRef.current = e.target.files?.[0] || null; }} className="input file:mr-3 file:rounded file:border-0 file:bg-adire-100 file:px-3 file:py-1 file:text-sm file:font-semibold" />
      </div>
      <div className="max-w-xs">
        <label htmlFor="cutoff" className="label">Cut-off date</label>
        <input id="cutoff" name="cutoff" type="date" defaultValue={today} max={today} required className="input" />
        <p className="hint">Balances in the file are as at this date. The digital ledger starts here.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="mode" value="preview" className="btn-quiet" pendingText="Checking…"><Icon name="eye" size={16} /> 1. Check the file</SubmitButton>
        <SubmitButton name="mode" value="commit" className="btn-primary" pendingText="Importing…"><Icon name="upload" size={16} /> 2. Import members</SubmitButton>
      </div>
      <p className="hint">Checking never saves anything. Importing is all-or-nothing: if any row is wrong, nobody is imported.</p>

      {result?.errors && (
        <div role="alert" className="callout-bad">
          <Icon name="alertTriangle" size={18} className="mt-0.5" />
          <div className="min-w-0">
            <ul className="list-disc space-y-1 pl-5">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            {result.moreErrors > 0 && <p className="mt-2">…and {result.moreErrors} more.</p>}
          </div>
        </div>
      )}
      {result?.preview && (
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-adire-900"><Icon name="eye" size={16} className="text-adire-500" /> Preview</h3>
          <p className="mb-2 mt-1 text-sm text-ink/75">Preview of the first {Math.min(result.preview.length, 10)} of {result.total} rows. Choose &quot;2. Import members&quot; to save them.</p>
          <DataTable caption="Preview of the first ten members in the file">
            <thead><tr><th scope="col">No.</th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col" className="text-right">Savings</th><th scope="col" className="text-right">Loan</th></tr></thead>
            <tbody>{result.preview.slice(0, 10).map((r) => <tr key={r.member_no}><td>{r.member_no}</td><td>{r.full_name}</td><td>{r.phone}</td><td className="text-right">{naira(r.opening_savings)}</td><td className="text-right">{naira(r.opening_loan_balance)}</td></tr>)}</tbody>
          </DataTable>
        </div>
      )}
    </ActionForm>
  );
}
