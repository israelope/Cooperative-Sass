import { generate } from './faults.mjs';
import { Model } from './model.mjs';

/** Runs the delivery phases of the experiment against the in-memory model (harness self-test only). */
export function runModelExperiment({ n, faultRate, seed }) {
  const items = generate({ n, faultRate, seed, tag: `m${seed}` });
  const m = new Model();
  for (const it of items) if (!(it.fault === 'out_of_order' && it.variant === 'early')) m.createPending(it);
  for (const it of items) {
    for (let k = 0; k < it.copies; k++) m.webhook(it.reference, it.receivedKobo, it.shareKobo);
    if (it.fault === 'out_of_order' && it.variant === 'late_failure') m.failedNotice(it.reference);
  }
  for (const it of items) if (it.fault === 'out_of_order' && it.variant === 'early') m.createPending(it);
  m.sweep();
  for (const it of items) {
    if (it.fault === 'delayed_settlement' || it.fault === 'partial_payment') continue;
    const short = it.fault === 'failed_leg' && it.legMode === 'short_share';
    m.settlement(it.reference, short ? it.expectedShareKobo - Math.round(it.expectedShareKobo * 0.05) : it.expectedShareKobo, !(it.fault === 'failed_leg' && it.legMode === 'leg_failed'));
  }
  m.sweep({ flagDelayed: true });
  for (const it of items) if (it.fault === 'delayed_settlement') m.settlement(it.reference, it.expectedShareKobo, true);
  return { items, model: m };
}
