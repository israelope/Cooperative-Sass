/** Pure bank-list helpers shared by the server and the browser form. */

/**
 * Paystack sometimes returns more than one entry for the same bank code.
 * The code is what we send back to Paystack, so keeping two options with the
 * same value makes the displayed bank name ambiguous and produces duplicate
 * React keys. Keep the first entry for each code and drop empty codes.
 */
export function dedupeBanks(banks) {
  const seen = new Set();
  const result = [];
  for (const bank of banks || []) {
    const code = String(bank?.code ?? '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ code, name: String(bank?.name ?? '').trim() });
  }
  return result;
}
