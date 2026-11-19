// A JavaScript model of the SQL reconciliation rules (migration 008). It exists ONLY to self-test the
// harness and the scorer without a database. Its results are NOT evidence for the report.
const TOL = 1;   // 1 kobo
export class Model {
  constructor() { this.t = new Map(); this.rec = new Map(); this.events = new Set(); this.held = new Map(); this.settle = new Map(); this.credits = new Map(); this.clock = 0; }
  tick() { return (this.clock += 1); }
  createPending(it) { this.t.set(it.reference, { ...it, status: 'pending' }); }
  webhook(ref, amountKobo, shareKobo, retry = false) {
    if (this.events.has(ref)) {
      const r = this.rec.get(ref);
      if (r) { r.flagged = true; r.fault ||= 'duplicate_webhook'; if (r.status === 'AUTO_MATCHED') r.status = 'AUTO_RESOLVED'; }
      return 'duplicate';
    }
    this.events.add(ref);
    const tx = this.t.get(ref);
    if (!tx) { this.events.delete(ref); this.held.set(ref, { amountKobo, shareKobo }); return 'held'; }
    if (tx.status !== 'pending') return 'not_pending';
    const exp = tx.expectedShareKobo, now = this.tick();
    if (amountKobo !== tx.amountKobo) {
      this.rec.set(ref, { status: 'NEEDS_REVIEW', flagged: true, fault: amountKobo < tx.amountKobo ? 'partial_payment' : null, received_at: now, reconciled_at: null });
      return 'needs_review';
    }
    let fault = retry ? 'out_of_order' : null, st = null;
    const d = Math.abs(shareKobo - exp);
    if (d > TOL) { fault = 'failed_leg'; st = 'NEEDS_REVIEW'; } else if (d > 0) { fault = 'rounding_diff'; st = 'AUTO_RESOLVED'; }
    tx.status = 'success'; this.credits.set(ref, (this.credits.get(ref) || 0) + 1);
    st ||= 'AWAITING_SETTLEMENT';
    this.rec.set(ref, { status: st, flagged: fault != null, fault, received_at: now, reconciled_at: st === 'AUTO_RESOLVED' ? this.tick() : null, exp });
    if (st === 'AWAITING_SETTLEMENT') this.applySettlement(ref);
    return 'credited';
  }
  failedNotice(ref) {
    const tx = this.t.get(ref); if (!tx) return 'unknown_reference';
    const r = this.rec.get(ref);
    if (tx.status === 'success' && r) { r.flagged = true; r.fault ||= 'out_of_order'; if (r.status === 'AUTO_MATCHED') r.status = 'AUTO_RESOLVED'; return 'ignored_late_failure'; }
    if (tx.status === 'pending') { tx.status = 'failed'; return 'failed'; }
    return 'not_pending';
  }
  settlement(ref, shareKobo, legOk) {
    if (this.settle.has(ref)) return 'duplicate';
    this.settle.set(ref, { shareKobo, legOk }); return this.applySettlement(ref);
  }
  applySettlement(ref) {
    const r = this.rec.get(ref), s = this.settle.get(ref);
    if (!r || !s) return 'held';
    if (r.status !== 'AWAITING_SETTLEMENT') return 'ignored';
    if (!s.legOk || Math.abs(s.shareKobo - r.exp) > TOL) { r.flagged = true; r.fault = 'failed_leg'; r.status = 'NEEDS_REVIEW'; return 'needs_review'; }
    r.status = r.flagged ? 'AUTO_RESOLVED' : 'AUTO_MATCHED'; r.reconciled_at = this.tick(); return 'settled';
  }
  sweep({ flagDelayed = false } = {}) {
    for (const [ref, h] of [...this.held]) if (this.t.has(ref)) { this.held.delete(ref); this.webhook(ref, h.amountKobo, h.shareKobo, true); }
    if (flagDelayed) for (const r of this.rec.values()) if (r.status === 'AWAITING_SETTLEMENT' && !r.flagged) { r.flagged = true; r.fault = 'delayed_settlement'; }
  }
  results() {
    const m = new Map();
    for (const [ref, r] of this.rec) m.set(ref, { status: r.status, flagged_mismatch: r.flagged, detected_fault: r.fault, received_at: r.received_at, reconciled_at: r.reconciled_at });
    return m;
  }
}
