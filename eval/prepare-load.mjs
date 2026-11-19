// Creates a test cooperative with pending payments for the k6 webhook test and writes eval/k6/refs.json.
//   node eval/prepare-load.mjs --count=3000
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../scripts/loadEnv.mjs';
import { generate } from './lib/faults.mjs';
loadEnv();
const count = Number((process.argv.find((a) => a.startsWith('--count=')) || '--count=3000').slice(8));
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = `L${Date.now().toString(36)}`;
const items = generate({ n: count, faultRate: 0, seed: 1, tag });
const t = await svc.from('tenants').insert({ name: `Load ${tag}`, slug: `load-${tag.toLowerCase()}`, paystack_subaccount_code: 'ACCT_LOAD' }).select('id').single();
if (t.error) throw new Error(t.error.message);
const ms = await svc.from('members').insert(Array.from({ length: 20 }, (_, i) => ({ tenant_id: t.data.id, member_no: `L${String(i + 1).padStart(3, '0')}`, full_name: `Load Member ${i + 1}`, status: 'active' }))).select('id');
if (ms.error) throw new Error(ms.error.message);
for (let i = 0; i < items.length; i += 500) {
  const { error } = await svc.from('transactions').insert(items.slice(i, i + 500).map((it) => ({ tenant_id: t.data.id, member_id: ms.data[it.memberIndex].id, reference: it.reference, amount: it.amountKobo / 100, channel: 'online', status: 'pending', purpose: 'contribution', platform_fee: it.platformFeeKobo / 100, fee_bearer: 'subaccount' })));
  if (error) throw new Error(error.message);
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'k6', 'refs.json');
fs.writeFileSync(file, JSON.stringify(items.map((it) => ({ reference: it.reference, amountKobo: it.amountKobo, feeKobo: it.feeKobo, shareKobo: it.expectedShareKobo }))));
console.log(`Created tenant ${t.data.id} with ${count} pending payments. References written to ${file}.\nDelete the tenant afterwards (Supabase table editor, or: delete from tenants where id = '${t.data.id}').`);
