// Reconciliation-accuracy experiment (Chapter 3, Section 3.10.5; results go in Chapter 4).
//
//   node eval/run-experiment.mjs --n=1000,5000,10000 --rate=0.05,0.15,0.30 --runs=10 --mode=rpc
//
// Modes:  rpc   = call the database functions directly (fast; default)
//         http  = post signed events to the running app (--url=http://localhost:3000)
//         model = in-memory model of the rules. HARNESS SELF-TEST ONLY: its numbers are NOT evidence.
// Options: --settle-window=5 (seconds, scaled settlement window)  --concurrency=10  --seed-start=1  --keep=true
// RUN IT AGAINST A SEPARATE TEST SUPABASE PROJECT, never your live one.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../scripts/loadEnv.mjs';
import { generate } from './lib/faults.mjs';
import { scoreRun, aggregate } from './lib/metrics.mjs';
import { chargeSuccess, chargeFailed, postSigned, pool } from './lib/gateway.mjs';
import { runModelExperiment } from './lib/modelRun.mjs';

loadEnv();
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; }));
const list = (v, d) => String(v ?? d).split(',').map(Number);
const SIZES = list(args.n, '1000'), RATES = list(args.rate, '0.15');
const RUNS = Number(args.runs || 3), SEED0 = Number(args['seed-start'] || 1);
const MODE = args.mode || 'rpc', SETTLE_S = Number(args['settle-window'] || 5), CONC = Number(args.concurrency || 10), KEEP = args.keep === 'true';
const BASE = args.url || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(fileURLToPath(import.meta.url));

let svc = null;
if (MODE !== 'model') {
  const { createClient } = await import('@supabase/supabase-js');      // loaded only when a database is used
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing Supabase settings in .env.local'); process.exit(1); }
  svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
const must = async (p, what) => { const { data, error } = await p; if (error) throw new Error(`${what}: ${error.message}`); return data; };
const sweep = (settle, final = '1 day') => must(svc.rpc('reconcile_sweep', { p_settle_window: settle, p_final_window: final, p_review_window: '30 days' }), 'sweep');

async function setupTenant(tag) {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tenant = await must(svc.from('tenants').insert({ name: `Eval ${tag}`, slug: `eval-${clean}`.slice(0, 48), paystack_subaccount_code: 'ACCT_EVAL' }).select('id').single(), 'tenant');
  const rows = Array.from({ length: 20 }, (_, i) => ({ tenant_id: tenant.id, member_no: `E${String(i + 1).padStart(3, '0')}`, full_name: `Eval Member ${i + 1}`, status: 'active' }));
  const members = await must(svc.from('members').insert(rows).select('id, member_no').order('member_no'), 'members');
  return { tenantId: tenant.id, memberIds: members.map((m) => m.id) };
}
async function createPending(tenantId, memberIds, items) {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500).map((it) => ({ tenant_id: tenantId, member_id: memberIds[it.memberIndex], reference: it.reference, amount: it.amountKobo / 100, channel: 'online', status: 'pending', purpose: 'contribution', platform_fee: it.platformFeeKobo / 100, fee_bearer: 'subaccount' }));
    await must(svc.from('transactions').insert(chunk), 'pending transactions');
  }
}
const sendSuccess = (it) => {
  const payload = chargeSuccess(it.reference, { amountKobo: it.receivedKobo, feeKobo: it.feeKobo, shareKobo: it.shareKobo });
  return MODE === 'http'
    ? postSigned(`${BASE}/api/webhooks/paystack`, payload, SECRET)
    : must(svc.rpc('process_successful_payment', { p_reference: it.reference, p_amount: it.receivedKobo / 100, p_currency: 'NGN', p_payload: payload }), 'webhook');
};
const sendFailed = (it) => (MODE === 'http' ? postSigned(`${BASE}/api/webhooks/paystack`, chargeFailed(it.reference), SECRET) : must(svc.rpc('process_failed_notice', { p_reference: it.reference }), 'failed notice'));
const sendSettlement = (it) => {
  const short = it.fault === 'failed_leg' && it.legMode === 'short_share';
  const share = (short ? it.expectedShareKobo - Math.round(it.expectedShareKobo * 0.05) : it.expectedShareKobo) / 100;
  const legOk = !(it.fault === 'failed_leg' && it.legMode === 'leg_failed');
  return MODE === 'http'
    ? postSigned(`${BASE}/api/webhooks/settlement`, { reference: it.reference, share, leg_ok: legOk }, SECRET)
    : must(svc.rpc('record_settlement', { p_reference: it.reference, p_share: share, p_leg_ok: legOk }), 'settlement');
};
async function fetchAll(build) {
  const out = []; for (let from = 0; ; from += 1000) { const page = await must(build().range(from, from + 999), 'fetch'); out.push(...page); if (page.length < 1000) break; }
  return out;
}

async function runOnce(n, rate, seed) {
  const t0 = Date.now();
  if (MODE === 'model') {
    const r = runModelExperiment({ n, faultRate: rate, seed });
    return { metrics: scoreRun(r.items, r.model.results(), r.model.credits), integrity: null, seconds: (Date.now() - t0) / 1000 };
  }
  const tag = `${seed}${Date.now().toString(36)}`;
  const items = generate({ n, faultRate: rate, seed, tag });
  const { tenantId, memberIds } = await setupTenant(tag);
  const early = (it) => it.fault === 'out_of_order' && it.variant === 'early';
  try {
    await createPending(tenantId, memberIds, items.filter((i) => !early(i)));
    await pool(items, CONC, async (it) => {                           // 2. webhooks (duplicates, early events, late failure notices)
      for (let k = 0; k < it.copies; k++) await sendSuccess(it);
      if (it.fault === 'out_of_order' && it.variant === 'late_failure') await sendFailed(it);
    });
    await createPending(tenantId, memberIds, items.filter(early));     // 3. the pending record appears late; retry held events
    await sweep('1 hour');
    const normal = items.filter((it) => it.fault !== 'delayed_settlement' && it.fault !== 'partial_payment');
    await pool(normal, CONC, sendSettlement);                          // 4. settlement reports
    await sleep(SETTLE_S * 1000);                                      // 5. the (scaled) settlement window passes
    await sweep(`${SETTLE_S} seconds`);
    await pool(items.filter((it) => it.fault === 'delayed_settlement'), CONC, sendSettlement);   // 6. late settlements arrive
    await sweep('1 hour');
    const rows = await fetchAll(() => svc.from('reconciliation_results').select('status, flagged_mismatch, detected_fault, received_at, reconciled_at, transactions!inner(reference)').eq('tenant_id', tenantId).order('id'));
    const results = new Map(rows.map((r) => [r.transactions.reference, r]));
    const entries = await fetchAll(() => svc.from('passbook_entries').select('entry_type, transactions!inner(reference)').eq('tenant_id', tenantId).eq('entry_type', 'contribution').order('seq'));
    const credits = new Map(); for (const e of entries) credits.set(e.transactions.reference, (credits.get(e.transactions.reference) || 0) + 1);
    const integrity = await must(svc.rpc('integrity_violations'), 'integrity');
    return { metrics: scoreRun(items, results, credits), integrity, seconds: (Date.now() - t0) / 1000 };
  } finally {
    if (!KEEP) {
      await svc.from('tenants').delete().eq('id', tenantId);
      await svc.from('webhook_events').delete().like('reference', `%EV-${tag}-%`);
    }
  }
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(2)}%`);
const num = (x, d = 2) => (x == null ? 'n/a' : x.toFixed(d));
const pm = (o, f) => (o.mean == null ? 'n/a' : `${f(o.mean)} ± ${o.sd == null ? 'n/a' : f(o.sd)}`);
const all = [];
if (MODE === 'model') console.log('\n*** MODEL MODE: harness self-test only. These numbers are NOT results for your report. ***\n');
for (const n of SIZES) for (const rate of RATES) {
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    const res = await runOnce(n, rate, SEED0 + r);
    runs.push(res);
    console.log(`n=${n} rate=${rate} run ${r + 1}/${RUNS}: accuracy ${pct(res.metrics.accuracy)}, recall ${pct(res.metrics.recall)}, ${res.seconds.toFixed(1)} s${res.integrity ? ' integrity ' + JSON.stringify(res.integrity) : ''}`);
  }
  const agg = aggregate(runs.map((x) => x.metrics));
  const integrityBad = runs.filter((x) => x.integrity && Object.values(x.integrity).some((v) => Number(v) > 0)).length;
  console.log(`\n### n = ${n}, fault rate = ${rate * 100}% (${RUNS} runs, mean ± SD)\n`);
  console.log('| Metric | Result |\n|---|---|');
  for (const [label, key, f] of [['Reconciliation accuracy', 'accuracy', pct], ['Precision', 'precision', pct], ['Recall', 'recall', pct], ['F1 score', 'f1', pct], ['Time to reconcile, mean (s)', 'timeMean', num], ['Time to reconcile, median (s)', 'timeMedian', num], ['Time to reconcile, p95 (s)', 'timeP95', num], ['Automation rate', 'automationRate', pct], ['Manual-intervention rate', 'manualRate', pct], ['Needing review (count)', 'needsReview', (x) => num(x, 1)], ['Unresolved (count)', 'unresolved', (x) => num(x, 1)], ['Double credits (count)', 'doubleCredits', (x) => num(x, 1)], ['Value at risk (NGN)', 'valueAtRisk', (x) => num(x, 0)]]) console.log(`| ${label} | ${pm(agg[key], f)} |`);
  console.log(`| Runs with an integrity violation | ${MODE === 'model' ? 'not checked' : integrityBad + ' of ' + RUNS} |`);
  console.log('\n| Fault class | Flagged as mismatch | Correct final status |\n|---|---|---|');
  for (const [f, v] of Object.entries(agg.perFault)) console.log(`| ${f} | ${pm(v.recall, pct)} | ${pm(v.correct, pct)} |`);
  console.log('');
  all.push({ n, rate, runs: runs.map((x) => ({ ...x.metrics, seconds: x.seconds, integrity: x.integrity })), aggregate: agg });
}
const file = path.join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}-${MODE}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ mode: MODE, settleWindowSeconds: SETTLE_S, runs: RUNS, results: all }, null, 2));
console.log(`Saved ${file}`);
