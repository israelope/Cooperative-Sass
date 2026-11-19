import * as XLSX from 'xlsx';
import { normaliseHeader, REQUIRED_COLUMNS } from '@/lib/importValidate';

/** Reads the first sheet of an .xlsx / .xls / .csv upload into row objects with normalised headers. */
export function parseSpreadsheet(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('The file has no sheets.');
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const rows = raw.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[normaliseHeader(k)] = typeof v === 'string' ? v.trim() : v;
    return o;
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (rows.length && missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}. Use the template.`);
  return rows;
}
