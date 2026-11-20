'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import Field from '@/components/Field';
import { createClient } from '@/lib/supabase/client';

/** Shrinks a phone photo to a small JPEG so receipts stay well inside the free storage quota. */
async function compress(file, maxDim = 1280, quality = 0.7) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image'))), 'image/jpeg', quality));
}

export default function ManualPaymentForm({ action, tenantId, members }) {
  const [path, setPath] = useState('');
  const [status, setStatus] = useState({ busy: false, error: '', name: '' });

  async function onFile(e) {
    const file = e.target.files?.[0];
    setPath('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setStatus({ busy: false, error: 'Choose an image file (photo or screenshot of the receipt).', name: '' });
    setStatus({ busy: true, error: '', name: file.name });
    try {
      const blob = await compress(file);
      const objectPath = `${tenantId}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient().storage.from('receipts').upload(objectPath, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      setPath(objectPath);
      setStatus({ busy: false, error: '', name: file.name });
    } catch (err) {
      setStatus({ busy: false, error: `Upload failed: ${err.message}`, name: '' });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={action} resetOnSuccess onResult={(s) => { if (s?.ok) setPath(''); }} className="panel max-w-2xl space-y-4 p-6">
      <div>
        <label htmlFor="memberId" className="label">Member</label>
        <select id="memberId" name="memberId" required className="input" defaultValue="">
          <option value="" disabled>Choose a member…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.member_no} · {m.full_name}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount (₦)" name="amount" type="number" step="0.01" min="1" />
        <div><label htmlFor="channel" className="label">Paid by</label>
          <select id="channel" name="channel" className="input" defaultValue="cash"><option value="cash">Cash</option><option value="transfer">Bank transfer</option></select></div>
        <Field label="Date paid" name="paidOn" type="date" defaultValue={today} max={today} />
      </div>
      <div>
        <label htmlFor="receipt" className="label">Photo of the receipt</label>
        <input id="receipt" type="file" accept="image/*" capture="environment" required onChange={onFile} className="input file:mr-3 file:rounded file:border-0 file:bg-adire-100 file:px-3 file:py-1 file:text-sm file:font-semibold" />
        <input type="hidden" name="receiptPath" value={path} />
        <p className="hint" aria-live="polite">
          {status.busy ? 'Uploading…' : path ? `Uploaded: ${status.name}` : 'Required. The photo is shrunk automatically and the member can see it in their passbook.'}
        </p>
        {status.error && (
          <div role="alert" className="callout-bad mt-2">
            <Icon name="xCircle" size={18} className="mt-0.5" />
            <span>{status.error}</span>
          </div>
        )}
      </div>
      <Field label="Note (optional)" name="note" required={false} placeholder="e.g. September contribution" />
      <SubmitButton className="btn-primary" pendingText="Saving…"><Icon name="check" size={16} /> Save payment</SubmitButton>
    </ActionForm>
  );
}
