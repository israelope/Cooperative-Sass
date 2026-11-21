// Pure helpers for statements (unit-tested): period parsing, brought-forward / closing balance, presets.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = 'Africa/Lagos';

/** YYYY-MM-DD of a timestamp in Nigerian time. */
export function lagosDate(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** A real calendar date, not just a YYYY-MM-DD shaped string. */
export function isValidDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Reads ?from=&to= . Returns { from, to } (either may be null) or { error }. */
export function parsePeriod(searchParams) {
  const from = searchParams.get('from') || null;
  const to = searchParams.get('to') || null;
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) return { error: 'Dates must be real dates like 2026-01-31.' };
  if (from && to && to < from) return { error: 'The end date is before the start date.' };
  return { from, to };
}

/**
 * entries: ascending by seq: { entry_date, entry_type, amount, running_balance, note }.
 * Returns the balance brought forward, the rows inside the period and the closing balance.
 */
export function splitStatement(entries, from, to) {
  let broughtForward = 0;
  const rows = [];
  for (const e of entries || []) {
    const d = lagosDate(e.entry_date);
    if (from && d < from) broughtForward = Number(e.running_balance);
    else if (to && d > to) continue;
    else rows.push(e);
  }
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : broughtForward;
  return { broughtForward, rows, closing };
}

/** Quick periods for the Statements page. `now` is a Date. */
export function presetPeriods(now = new Date()) {
  const [y, m] = lagosDate(now).split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();      // mm is 1-based; day 0 of next month
  const thisMonth = { from: `${y}-${pad(m)}-01`, to: lagosDate(now) };
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const lastMonth = { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last(py, pm))}` };
  const thisYear = { from: `${y}-01-01`, to: lagosDate(now) };
  return { thisMonth, lastMonth, thisYear };
}

export const PURPOSE_LABEL = { contribution: 'Contribution', loan_repayment: 'Loan repayment' };
