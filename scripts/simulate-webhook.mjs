// Sends a Paystack-style charge.success webhook to your running app, signed with your secret key.
// Use it to produce evidence for test cases I2 to I6 without making a real payment.
//
//   node scripts/simulate-webhook.mjs <reference> <amountNaira> [--bad-signature] [--url=http://localhost:3000/api/webhooks/paystack]
//
// <reference> must belong to a PENDING transaction (start a payment on the Pay page first,
// then copy the reference shown on the "Confirming your payment" page or in Admin > Payments).
import crypto from 'crypto';
import { loadEnv } from './loadEnv.mjs';

loadEnv();
const args = process.argv.slice(2);
const [reference, amount] = args.filter((a) => !a.startsWith('--'));
const bad = args.includes('--bad-signature');
const url = (args.find((a) => a.startsWith('--url=')) || '--url=http://localhost:3000/api/webhooks/paystack').slice(6);
const secret = process.env.PAYSTACK_SECRET_KEY;

if (!reference || !amount || !secret) {
  console.error('Usage: node scripts/simulate-webhook.mjs <reference> <amountNaira> [--bad-signature] [--url=...]\nAlso needs PAYSTACK_SECRET_KEY in .env.local');
  process.exit(1);
}

const body = JSON.stringify({ event: 'charge.success', data: { reference, amount: Math.round(Number(amount) * 100), currency: 'NGN', status: 'success' } });
const signature = crypto.createHmac('sha512', bad ? 'wrong-secret' : secret).update(body).digest('hex');

const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature }, body });
console.log(`HTTP ${res.status}`, await res.text());
