// Financial-integrity invariants I1 to I6 (Chapter 3, Section 3.10.6). Run after every experiment and load test.
//   node eval/integrity.mjs        (exit code 1 if any invariant is violated)
// I7 (a PDF statement's closing balance equals the passbook balance) is checked by hand.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../scripts/loadEnv.mjs';
loadEnv();
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await svc.rpc('integrity_violations');
if (error) { console.error(error.message); process.exit(2); }
const NAMES = { I1: 'Each successful online payment has matching passbook entries', I2: 'Running balance equals the sum of signed entries', I3: 'No negative balance', I4: 'amount_repaid equals the sum of repayments', I5: 'No duplicate payment reference', I6: 'Related rows belong to the same tenant' };
let bad = 0;
for (const [k, v] of Object.entries(data)) { console.log(`${k}  ${String(v).padStart(6)}  ${NAMES[k] || ''}`); bad += Number(v); }
console.log(bad === 0 ? '\nAll invariants hold (0 violations).' : `\n${bad} violation(s) found.`);
process.exit(bad === 0 ? 0 : 1);
