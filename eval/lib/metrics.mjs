// Metrics of Chapter 3, Section 3.10.5.3. Pure functions: no database needed.
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const sd = (a) => {
  if (a.length < 2) return a.length ? 0 : null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
export const median = (a) => percentile(a, 50);
const ratio = (a, b) => (b === 0 ? null : a / b);

export function confusion(rows) {            // rows: { mismatch, flagged }
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const r of rows) {
    if (r.mismatch && r.flagged) c.tp++;
    else if (!r.mismatch && r.flagged) c.fp++;
    else if (r.mismatch && !r.flagged) c.fn++;
    else c.tn++;
  }
  return c;
}
export function prf(c) {
  const precision = ratio(c.tp, c.tp + c.fp);
  const recall = ratio(c.tp, c.tp + c.fn);
  const f1 = precision == null || recall == null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/**
 * items: generator output (with .expected). results: Map reference -> row from reconciliation_results
 * { status, flagged_mismatch, detected_fault, received_at, reconciled_at }. credits: Map reference -> number of credit entries.
 */
export function scoreRun(items, results, credits = new Map()) {
  const rows = []; let correct = 0, doubleCredits = 0, valueAtRisk = 0;
  const perFault = {}; const times = [];
  const counts = { AUTO_MATCHED: 0, AUTO_RESOLVED: 0, AWAITING_SETTLEMENT: 0, NEEDS_REVIEW: 0, RESOLVED_MANUALLY: 0, UNRESOLVED: 0, MISSING: 0 };
  for (const it of items) {
    const r = results.get(it.reference);
    const status = r ? r.status : 'MISSING';
    const flagged = !!(r && r.flagged_mismatch);
    counts[status] = (counts[status] || 0) + 1;
    const dbl = (credits.get(it.reference) || 0) > 1; if (dbl) doubleCredits++;
    const ok = status === it.expected.status && !dbl;
    if (ok) correct++;
    rows.push({ mismatch: it.expected.mismatch, flagged });
    if (it.expected.mismatch && !flagged) valueAtRisk += it.amountKobo / 100;
    const f = (perFault[it.fault] ||= { n: 0, flagged: 0, correct: 0 });
    f.n++; if (flagged) f.flagged++; if (ok) f.correct++;
    if (r && r.reconciled_at && r.received_at) times.push((new Date(r.reconciled_at) - new Date(r.received_at)) / 1000);
  }
  const c = confusion(rows);
  const n = items.length;
  const manual = counts.NEEDS_REVIEW + counts.UNRESOLVED + counts.RESOLVED_MANUALLY;
  return {
    n, accuracy: ratio(correct, n), ...prf(c), confusion: c,
    timeMean: mean(times), timeMedian: median(times), timeP95: percentile(times, 95), timeP99: percentile(times, 99), timedCases: times.length,
    automationRate: ratio(counts.AUTO_MATCHED + counts.AUTO_RESOLVED, n), manualRate: ratio(manual, n),
    unresolved: counts.UNRESOLVED, needsReview: counts.NEEDS_REVIEW, missing: counts.MISSING, doubleCredits, valueAtRisk,
    statusCounts: counts,
    perFault: Object.fromEntries(Object.entries(perFault).map(([k, v]) => [k, { n: v.n, recall: ratio(v.flagged, v.n), correct: ratio(v.correct, v.n) }])),
  };
}

const SCALARS = ['accuracy', 'precision', 'recall', 'f1', 'timeMean', 'timeMedian', 'timeP95', 'timeP99', 'automationRate', 'manualRate', 'unresolved', 'needsReview', 'missing', 'doubleCredits', 'valueAtRisk'];
/** Mean and standard deviation of every scalar metric over repeated runs. */
export function aggregate(runs) {
  const out = {};
  for (const k of SCALARS) {
    const v = runs.map((r) => r[k]).filter((x) => x != null && Number.isFinite(x));
    out[k] = { mean: mean(v), sd: sd(v), runs: v.length };
  }
  const faults = new Set(runs.flatMap((r) => Object.keys(r.perFault)));
  out.perFault = {};
  for (const f of faults) {
    const rec = runs.map((r) => r.perFault[f]?.recall).filter((x) => x != null);
    const cor = runs.map((r) => r.perFault[f]?.correct).filter((x) => x != null);
    out.perFault[f] = { recall: { mean: mean(rec), sd: sd(rec) }, correct: { mean: mean(cor), sd: sd(cor) } };
  }
  return out;
}
