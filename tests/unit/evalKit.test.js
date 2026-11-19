import { describe, it, expect } from 'vitest';
import { generate, FAULTS, EXPECTED, paystackFeeKobo } from '../../eval/lib/faults.mjs';
import { confusion, prf, percentile, mean, sd, scoreRun, aggregate } from '../../eval/lib/metrics.mjs';
import { Model } from '../../eval/lib/model.mjs';
import { runModelExperiment } from '../../eval/lib/modelRun.mjs';

describe('fault generator', () => {
  it('is reproducible for the same seed and differs for another', () => {
    const a = generate({ n: 200, faultRate: 0.3, seed: 7 }), b = generate({ n: 200, faultRate: 0.3, seed: 7 }), c = generate({ n: 200, faultRate: 0.3, seed: 8 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
  });
  it('injects about the requested fault rate and uses all six faults', () => {
    const items = generate({ n: 5000, faultRate: 0.15, seed: 1 });
    const faulty = items.filter((x) => x.fault !== 'none').length;
    expect(Math.abs(faulty / 5000 - 0.15) < 0.02).toBe(true);
    expect(new Set(items.map((x) => x.fault).filter((f) => f !== 'none')).size).toBe(FAULTS.length);
  });
  it('labels every transaction with ground truth and keeps the split arithmetic exact', () => {
    for (const it of generate({ n: 300, faultRate: 0.5, seed: 3 })) {
      expect(it.expected).toBe(EXPECTED[it.fault]);
      expect(it.expectedShareKobo).toBe(it.amountKobo - it.platformFeeKobo - paystackFeeKobo(it.amountKobo));
    }
  });
});

describe('metrics', () => {
  it('computes precision, recall and F1 from a confusion matrix', () => {
    const rows = [...Array(8).fill({ mismatch: true, flagged: true }), ...Array(2).fill({ mismatch: true, flagged: false }), ...Array(1).fill({ mismatch: false, flagged: true }), ...Array(89).fill({ mismatch: false, flagged: false })];
    const c = confusion(rows);
    expect(c).toEqual({ tp: 8, fp: 1, fn: 2, tn: 89 });
    const m = prf(c);
    expect(Math.abs(m.precision - 8 / 9) < 1e-9).toBe(true);
    expect(Math.abs(m.recall - 0.8) < 1e-9).toBe(true);
    expect(Math.abs(m.f1 - (2 * (8 / 9) * 0.8) / (8 / 9 + 0.8)) < 1e-9).toBe(true);
  });
  it('computes percentiles, mean and standard deviation', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(4.8);
    expect(mean([2, 4])).toBe(3);
    expect(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.001).toBe(true);
  });
  it('counts a missing record as wrong and a missed mismatch as value at risk', () => {
    const items = generate({ n: 20, faultRate: 1, seed: 2 });
    const s = scoreRun(items, new Map());
    expect(s.accuracy).toBe(0);
    expect(s.missing).toBe(20);
    expect(s.recall).toBe(0);
    expect(s.valueAtRisk > 0).toBe(true);
  });
});

describe('reference model (harness self-test, not evidence)', () => {
  it('handles each of the six faults as Table 3.15 says', () => {
    const run = runModelExperiment({ n: 600, faultRate: 0.5, seed: 11 });
    const s = scoreRun(run.items, run.model.results(), run.model.credits);
    expect(s.accuracy).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.doubleCredits).toBe(0);
  });
  it('aggregates repeated runs', () => {
    const runs = [1, 2, 3].map((seed) => { const r = runModelExperiment({ n: 300, faultRate: 0.15, seed }); return scoreRun(r.items, r.model.results(), r.model.credits); });
    const a = aggregate(runs);
    expect(a.accuracy.mean).toBe(1);
    expect(a.perFault.partial_payment.recall.mean).toBe(1);
  });
});
