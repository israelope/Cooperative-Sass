// Seeds TWO test cooperatives so you can demonstrate and test tenant isolation.
// Usage: npm run seed      (needs .env.local with the Supabase URL and service key)
// Safe to re-run: it deletes and recreates only the seeded cooperatives/users.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './loadEnv.mjs';
import { upsertPlatformAdmin } from './platformAdmin.mjs';

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export const PASSWORD = 'Passw0rd!123';
const PLATFORM_EMAIL = 'platform@coop.test';

const PLAN = [
  { slug: 'adeola-thrift', name: 'Adeola Thrift Society', people: [
    { email: 'admin.a@coop.test', name: 'Adeola Admin', role: 'admin' },
    { email: 'book.a@coop.test', name: 'Bisi Bookkeeper', role: 'bookkeeper' },
    { email: 'member.a1@coop.test', name: 'Tunde Member', role: 'member', no: 'A001', savings: 150000 },
    { email: 'member.a2@coop.test', name: 'Funke Member', role: 'member', no: 'A002', savings: 90000 },
  ] },
  { slug: 'ui-staff-coop', name: 'UI Staff Cooperative', people: [
    { email: 'admin.b@coop.test', name: 'Bola Admin', role: 'admin' },
    { email: 'member.b1@coop.test', name: 'Kemi Member', role: 'member', no: 'B001', savings: 200000 },
  ] },
];

async function wipe() {
  await admin.from('tenants').delete().in('slug', PLAN.map((t) => t.slug));   // cascades to all tenant rows
  await admin.from('site_visits').delete().like('visitor_hash', 'seed-%');
  const emails = new Set([PLATFORM_EMAIL, ...PLAN.flatMap((t) => t.people.map((p) => p.email))]);
  for (let page = 1; page < 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!data?.users?.length) break;
    for (const u of data.users) if (emails.has(u.email)) await admin.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
  }
}

async function run() {
  await wipe();
  const out = [];
  for (const t of PLAN) {
    const { data: tenant, error } = await admin.from('tenants').insert({ name: t.name, slug: t.slug }).select().single();
    if (error) throw error;
    for (const p of t.people) {
      const { data: created, error: uErr } = await admin.auth.admin.createUser({
        email: p.email, password: PASSWORD, email_confirm: true,
        app_metadata: { tenant_id: tenant.id, role: p.role }, user_metadata: { full_name: p.name },
      });
      if (uErr) throw uErr;
      await admin.from('profiles').insert({ id: created.user.id, tenant_id: tenant.id, role: p.role, full_name: p.name });
      if (p.role === 'member') {
        const { data: m, error: mErr } = await admin.from('members').insert({
          tenant_id: tenant.id, user_id: created.user.id, member_no: p.no, full_name: p.name, email: p.email, phone: '08012345678', status: 'active',
        }).select().single();
        if (mErr) throw mErr;
        await ledger(tenant.id, m.id, p.savings);
        if (p.no === 'A001') await seedLoan(tenant.id, m.id);
      }
      out.push([t.name, p.role, p.email]);
    }
    // One imported member who has not claimed an account yet (to demo the claim-code flow)
    const { data: code, error: cErr } = await admin.rpc('create_member_internal', {
      p_tenant: tenant.id, p_member_no: t.slug === 'adeola-thrift' ? 'A900' : 'B900', p_full_name: 'Unclaimed Person',
      p_phone: '08123456789', p_email: '', p_open_savings: 50000, p_open_loan: 0, p_date: new Date().toISOString().slice(0, 10),
    });
    if (cErr) throw cErr;
    out.push([t.name, 'claim code (member ' + (t.slug === 'adeola-thrift' ? 'A900' : 'B900') + ')', code]);
  }
  await upsertPlatformAdmin(admin, PLATFORM_EMAIL, PASSWORD);
  out.push(['(platform)', 'platform owner', PLATFORM_EMAIL]);
  await seedVisits();
  console.log('\nSeed complete. All accounts use the password:', PASSWORD, '\n');
  console.table(out.map(([coop, role, who]) => ({ cooperative: coop, role, login_or_code: who })));
}

// Opening balance + three monthly contributions, written through the ledger function.
async function ledger(tenantId, memberId, opening) {
  await admin.rpc('append_passbook_entry', { p_tenant: tenantId, p_member: memberId, p_txn: null, p_type: 'opening', p_amount: opening, p_date: new Date(Date.now() - 120 * 864e5).toISOString(), p_note: 'Opening balance' });
  for (let i = 3; i >= 1; i--) {
    const when = new Date(Date.now() - i * 30 * 864e5).toISOString();
    const { data: txn } = await admin.from('transactions').insert({
      tenant_id: tenantId, member_id: memberId, reference: 'SEED-' + memberId.slice(0, 8) + '-' + i, amount: 20000,
      channel: i === 2 ? 'cash' : 'online', status: 'success', paid_at: when, receipt_url: null, note: 'Seed data',
      platform_fee: i === 2 ? 0 : 50, paystack_fee: i === 2 ? 0 : 400, fee_bearer: i === 2 ? null : 'subaccount',
    }).select().single();
    await admin.rpc('append_passbook_entry', { p_tenant: tenantId, p_member: memberId, p_txn: txn.id, p_type: 'contribution', p_amount: 20000, p_date: when, p_note: (i === 2 ? 'Cash' : 'Online') + ' payment' });
  }
}

// An active loan so you can try online repayment and see it on the PDF statement.
async function seedLoan(tenantId, memberId) {
  await admin.from('loans').insert({ tenant_id: tenantId, member_id: memberId, principal: 50000, interest_rate: 5, tenor_months: 6, total_repayable: 51250, amount_repaid: 0, status: 'active', approved_at: new Date().toISOString() });
  await admin.rpc('append_passbook_entry', { p_tenant: tenantId, p_member: memberId, p_txn: null, p_type: 'loan_disbursed', p_amount: 50000, p_date: new Date().toISOString(), p_note: 'Loan disbursed (paid outside the platform)' });
}

// ~400 synthetic page views over 30 days so the Visitors charts have something to show (clearly marked 'seed-').
async function seedVisits() {
  const pages = ['/', '/', '/', '/login', '/register', '/claim', '/:slug', '/:slug'];
  const slugs = ['adeola-thrift', 'ui-staff-coop'];
  const rows = [];
  for (let i = 0; i < 400; i++) {
    const path = pages[Math.floor(Math.random() * pages.length)];
    const when = new Date(Date.now() - Math.random() * 30 * 864e5).toISOString();
    rows.push({ created_at: when, path, tenant_slug: path === '/:slug' ? slugs[i % 2] : null, visitor_hash: 'seed-' + Math.floor(Math.random() * 120) + '-' + when.slice(0, 10), device: Math.random() < 0.7 ? 'mobile' : 'desktop' });
  }
  await admin.from('site_visits').insert(rows);
}

run().catch((e) => { console.error('Seed failed:', e.message || e); process.exit(1); });
