import 'server-only';
import { dedupeBanks } from '@/lib/banks';

const BASE = 'https://api.paystack.co';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new Error(json.message || `Paystack error (${res.status})`);
  return json.data;
}

/** amountKobo; for a split payment pass subaccount, feeKobo (platform cut) and bearer ('subaccount' | 'account'). */
export function initializeTransaction({ email, amountKobo, reference, callbackUrl, subaccount, feeKobo = 0, bearer = 'subaccount' }) {
  const body = { email, amount: amountKobo, reference, currency: 'NGN', callback_url: callbackUrl };
  if (subaccount) {
    body.subaccount = subaccount;
    if (feeKobo > 0) body.transaction_charge = feeKobo;   // the platform's flat share, in kobo
    body.bearer = bearer;                                 // who pays Paystack's processing fee
  }
  return call('/transaction/initialize', { method: 'POST', body });
}

export const verifyTransaction = (reference) => call(`/transaction/verify/${encodeURIComponent(reference)}`);

export function createSubaccount({ businessName, bankCode, accountNumber }) {
  return call('/subaccount', {
    method: 'POST',
    body: { business_name: businessName, settlement_bank: bankCode, account_number: accountNumber, percentage_charge: 0 },
  });
}

export function updateSubaccount(code, { businessName, bankCode, accountNumber }) {
  return call(`/subaccount/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: { business_name: businessName, settlement_bank: bankCode, account_number: accountNumber },
  });
}

export async function listBanks() {
  try {
    const data = await call('/bank?country=nigeria&perPage=200');
    return dedupeBanks(data).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
