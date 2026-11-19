'use client';
import { useRef, useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { naira } from '@/lib/format';
import { toCsv } from '@/lib/format';

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

  if (result?.imported) {
    return (
      <div>
        <p className="rounded-lg bg-ok-100 px-4 py-3 text-sm text-ok-700">{result.message}</p>
        <p className="mt-3 text-sm text-ink/70">Download or print this list now. You can also find each code on the Members page until the member uses it.</p>
        <button className="btn-gold mt-3" onClick={() => downloadCodes(result.imported)}>Download claim codes (CSV)</button>
        <div className="panel mt-4 p-2"><div className="table-wrap">
          <table className="tbl"><thead><tr><th>No.</th><th>Name</th><th>Claim code</th></tr></thead>
            <tbody>{result.imported.map((r) => <tr key={r.member_no}><td className="num">{r.member_no}</td><td>{r.full_name}</td><td className="font-mono font-semibold">{r.claim_code}</td></tr>)}</tbody></table>
        </div></div>
        <button className="btn-quiet mt-4" onClick={() => setResult(null)}>Import another file</button>
      </div>
    );
  }

  return (
    <ActionForm action={submit} onResult={setResult} className="panel max-w-3xl space-y-4 p-6">
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
        <SubmitButton name="mode" value="preview" className="btn-quiet" pendingText="Checking…">1. Check the file</SubmitButton>
        <SubmitButton name="mode" value="commit" className="btn-primary" pendingText="Importing…">2. Import members</SubmitButton>
      </div>
      <p className="hint">Checking never saves anything. Importing is all-or-nothing: if any row is wrong, nobody is imported.</p>

      {result?.errors && (
        <div role="alert" className="rounded-lg bg-bad-100 px-4 py-3 text-sm text-bad-700">
          <ul className="list-disc space-y-1 pl-5">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          {result.moreErrors > 0 && <p className="mt-2">…and {result.moreErrors} more.</p>}
        </div>
      )}
      {result?.preview && (
        <div>
          <p className="mb-2 text-sm text-ink/70">Preview of the first {Math.min(result.preview.length, 10)} of {result.total} rows. Choose "2. Import members" to save them.</p>
          <div className="table-wrap"><table className="tbl num">
            <thead><tr><th>No.</th><th>Name</th><th>Phone</th><th className="text-right">Savings</th><th className="text-right">Loan</th></tr></thead>
            <tbody>{result.preview.slice(0, 10).map((r) => <tr key={r.member_no}><td>{r.member_no}</td><td>{r.full_name}</td><td>{r.phone}</td><td className="text-right">{naira(r.opening_savings)}</td><td className="text-right">{naira(r.opening_loan_balance)}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </ActionForm>
  );
}
