// Pure financial helpers. They mirror the SQL functions so they can be unit-tested
// without a database (see tests/unit/money.test.js).

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** How an entry type changes the savings balance. */
export function savingsDelta(type, amount) {
  if (type === 'opening' || type === 'contribution') return amount;
  if (type === 'withdrawal') return -amount;
  return 0; // loan_disbursed, repayment
}

export function nextBalance(prev, type, amount) {
  const next = round2((prev ?? 0) + savingsDelta(type, amount));
  if (next < 0) throw new Error('Insufficient savings balance');
  return next;
}

/** Loan limit = max(0, multiplier x savings - outstanding)   (Equation 4.1) */
export function eligibleLimit({ multiplier, savings, outstanding }) {
  return Math.max(0, round2(multiplier * savings - outstanding));
}

/** Simple interest, annual rate in %. */
export function totalRepayable(principal, ratePct, tenorMonths) {
  return round2(principal + (principal * ratePct * tenorMonths) / 1200);
}
