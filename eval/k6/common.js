// Shared helpers for the k6 scripts. Install k6 from https://k6.io and run, for example:
//   k6 run -e BASE_URL=http://localhost:3000 -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... eval/k6/load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

export const BASE = __ENV.BASE_URL || 'http://localhost:3000';
export const SUPABASE_URL = __ENV.SUPABASE_URL;
export const ANON = __ENV.SUPABASE_ANON_KEY;
export const SECRET = __ENV.PAYSTACK_SECRET_KEY;
export const EMAIL = __ENV.TEST_EMAIL || 'member.a1@coop.test';      // a seeded member (npm run seed)
export const PASSWORD = __ENV.TEST_PASSWORD || 'Passw0rd!123';

export const thresholds = { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<2000'] };   // Table of non-functional targets

/** Signs in once per test and returns the access token (RLS-filtered requests use it). */
export function setupLogin() {
  const res = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: EMAIL, password: PASSWORD }), { headers: { apikey: ANON, 'Content-Type': 'application/json' } });
  check(res, { 'login ok': (r) => r.status === 200 });
  return { token: res.json('access_token') };
}

/** A member's typical visit: public pages, then passbook and summary through the database with RLS applied. */
export function journey(data) {
  const h = { apikey: ANON, Authorization: `Bearer ${data.token}` };
  let r = http.get(`${BASE}/`); check(r, { 'home 200': (x) => x.status === 200 });
  r = http.get(`${BASE}/login`); check(r, { 'login page 200': (x) => x.status === 200 });
  r = http.get(`${SUPABASE_URL}/rest/v1/passbook_entries?select=entry_date,entry_type,amount,running_balance&order=seq.desc&limit=20`, { headers: h });
  check(r, { 'passbook 200': (x) => x.status === 200 });
  r = http.get(`${SUPABASE_URL}/rest/v1/members?select=id&limit=1`, { headers: h });
  const id = r.status === 200 && r.json().length ? r.json()[0].id : null;
  if (id) { r = http.post(`${SUPABASE_URL}/rest/v1/rpc/member_summary`, JSON.stringify({ p_member_id: id }), { headers: { ...h, 'Content-Type': 'application/json' } }); check(r, { 'summary 200': (x) => x.status === 200 }); }
  sleep(1);
}

export function signedPost(url, payload) {
  const body = JSON.stringify(payload);
  return http.post(url, body, { headers: { 'Content-Type': 'application/json', 'x-paystack-signature': crypto.hmac('sha512', SECRET, body, 'hex') } });
}
