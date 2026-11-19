// Pure validation for bulk-import rows (unit-tested). No spreadsheet library needed here.
export const REQUIRED_COLUMNS = ['member_no', 'full_name', 'phone', 'opening_savings'];
export const MAX_ROWS = 2000;

const PHONE_RE = /^(\+234|234|0)[789][01]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Excel often drops the leading zero of phone numbers: 8012345678 -> 08012345678 */
export function normalisePhone(v) {
  let s = String(v ?? '').trim().replace(/[\s()-]/g, '');
  if (/^[789][01]\d{8}$/.test(s)) s = '0' + s;
  return s;
}

function parseMoney(v) {
  if (v === '' || v == null) return { ok: true, value: 0 };
  const s = String(v).replace(/[,\s₦]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  return { ok: true, value: Number(s) };
}

/**
 * rows: array of objects keyed by (already normalised) column names.
 * Returns { valid: [...], errors: ['Row 3: ...'] }. Commit only when errors is empty.
 */
export function validateRows(rows) {
  const errors = [];
  const valid = [];
  const seen = new Set();

  if (!Array.isArray(rows) || rows.length === 0) return { valid, errors: ['The file has no data rows.'] };
  if (rows.length > MAX_ROWS) return { valid, errors: [`Too many rows (${rows.length}). The limit is ${MAX_ROWS} per import.`] };

  rows.forEach((r, i) => {
    const line = i + 2; // row 1 is the header
    const rowErrors = [];
    const member_no = String(r.member_no ?? '').trim();
    const full_name = String(r.full_name ?? '').trim();
    const phone = normalisePhone(r.phone);
    const email = String(r.email ?? '').trim();
    const savings = parseMoney(r.opening_savings);
    const loan = parseMoney(r.opening_loan_balance);

    if (!member_no) rowErrors.push('member_no is required');
    else if (seen.has(member_no.toLowerCase())) rowErrors.push(`duplicate member_no "${member_no}" in the file`);
    if (full_name.length < 3) rowErrors.push('full_name must be at least 3 characters');
    if (!PHONE_RE.test(phone)) rowErrors.push('phone is not a valid Nigerian mobile number');
    if (email && !EMAIL_RE.test(email)) rowErrors.push('email is not valid');
    if (!savings.ok) rowErrors.push('opening_savings must be a number with at most 2 decimals');
    if (!loan.ok) rowErrors.push('opening_loan_balance must be a number with at most 2 decimals');

    if (rowErrors.length) errors.push(`Row ${line}: ${rowErrors.join('; ')}`);
    else {
      seen.add(member_no.toLowerCase());
      valid.push({
        member_no, full_name, phone, email,
        opening_savings: savings.value,
        opening_loan_balance: loan.value,
      });
    }
  });
  return { valid, errors };
}
