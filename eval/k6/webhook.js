// Webhook throughput: constant arrival of signed charge.success events.  Run `npm run eval:prepare-load` first.
//   k6 run -e RATE=10 -e BASE_URL=... -e PAYSTACK_SECRET_KEY=... eval/k6/webhook.js        (RATE: 5, 10, 20, 50 events/s)
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { BASE, signedPost } from './common.js';
import exec from 'k6/execution';

const refs = new SharedArray('refs', () => JSON.parse(open('./refs.json')));
const RATE = Number(__ENV.RATE || 10);
export const options = {
  scenarios: { webhooks: { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: __ENV.DURATION || '1m', preAllocatedVUs: 50, maxVUs: 400 } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<2000'] },
};
export default function () {
  const r = refs[exec.scenario.iterationInTest % refs.length];
  const res = signedPost(`${BASE}/api/webhooks/paystack`, { event: 'charge.success', data: { reference: r.reference, amount: r.amountKobo, currency: 'NGN', status: 'success', fees: r.feeKobo, fees_split: { subaccount: r.shareKobo } } });
  check(res, { 'acknowledged (200)': (x) => x.status === 200 });
}
