'use client';
import { useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';

export default function BankForm({ action, banks, current }) {
  const [code, setCode] = useState(current.bankCode);
  const selected = banks.find((b) => b.code === code);
  const manual = banks.length === 0; // Paystack bank list unavailable: let the admin type the code
  return (
    <ActionForm action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="bankCode" className="label">Bank</label>
        {manual ? (
          <input id="bankCode" name="bankCode" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paystack bank code, e.g. 058" required />
        ) : (
          <select id="bankCode" name="bankCode" className="input" value={code} onChange={(e) => setCode(e.target.value)} required>
            <option value="" disabled>Choose your bank…</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        )}
        <input type="hidden" name="bankName" value={selected?.name || ''} />
        {manual && <p className="hint">Could not load the bank list from Paystack. Check your secret key, or enter the bank code.</p>}
      </div>
      <div>
        <label htmlFor="accountNumber" className="label">Account number</label>
        <input id="accountNumber" name="accountNumber" inputMode="numeric" pattern="\d{10}" maxLength={10} defaultValue={current.accountNumber} required className="input" placeholder="10 digits" />
      </div>
      <div className="sm:col-span-2"><SubmitButton pendingText="Saving with Paystack…">Save payout account</SubmitButton></div>
    </ActionForm>
  );
}
