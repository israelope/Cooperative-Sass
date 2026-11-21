# CoopLedger: Multi-Tenant SaaS for Cooperative Financial Management

Final-year project MVP, Department of Computer Science, University of Ibadan.
**Stack:** Next.js 14 (App Router, JavaScript) · Tailwind CSS · Supabase (PostgreSQL + Auth + Storage) · Paystack · Vercel.
**Everything runs on free plans.**

> **IMPORTANT: nothing in this project has been run yet.** It was written without access to the internet, so neither
> the app nor any SQL file has been executed against a real Supabase project or Paystack account. The pure logic
> (money maths, import validation, webhook signature, fees, visit tracking) has unit tests that pass in a stand-in
> test runner, and every file passes a syntax check, but **the SQL, the Supabase/Paystack calls and the pages have never
> been run.** Expect to fix some errors on your first run. Send each error message (with the file and line) to whoever is
> helping you and fix them one at a time. Do not use this with real members' money until it has been run, tested and
> reviewed by an experienced developer.

## Start here: first-run checklist

1. Do sections 3 to 6 in order (accounts, Supabase project, Paystack test keys, `npm install`, `.env.local`).
2. In the Supabase SQL Editor run the **eight** migration files in order, one at a time. If one fails, copy the exact error, fix it, and only then run the next.
3. `npm run seed`, then `npm run dev`, then work through the section 7 walkthrough.
4. `npm test` (no database needed), then `npm run test:integration` (needs steps 1 to 3).
5. Fees are **off by default** (`PLATFORM_FEE_KOBO=0`). To see revenue in test mode, set it to `5000` temporarily (section 8).

## What is NOT built yet

Billing and subscriptions (trial dates, "paid until", plans), password reset, email/SMS notifications, a withdrawals screen,
admin two-factor login, dedicated virtual account numbers per cooperative (money reaches each cooperative through its Paystack sub-account instead). The
suggested business model is a monthly/yearly subscription per cooperative with no per-transaction charge to members; the
fee setting exists but is off by default.

---------------------------------------------------------------------

## 1. What it does

| Module | Who | What |
|---|---|---|
| Cooperative registration | President | Creates an isolated workspace + admin login + shareable link `/c/<slug>` |
| Roles | Admin, Bookkeeper, Member | Route guards + role checks in server actions + Row-Level Security |
| Digital passbook | Member | Ruled ledger with running balance, receipts, CSV statement |
| Online payment | Member | Paystack checkout, **split settlement** to the cooperative's sub-account |
| Webhook reconciliation | System | HMAC-verified, atomic, idempotent; credits the passbook automatically |
| Manual payments | Bookkeeper/Admin | Cash/transfer with a compressed receipt photo in a private bucket |
| Loans | Member, Admin | Request, eligibility check, approve/reject, mark paid out; **repay online through Paystack** (settles to the cooperative's own account like any payment) or have an officer record a repayment |
| **Reconciliation engine** | System, Admin, Bookkeeper | Every online payment gets a reconciliation record (expected vs reported amount and split, status, times). Six fault classes are detected (partial payment, duplicate webhook, delayed settlement, failed leg, rounding difference, out-of-order). Officers resolve exceptions on **Admin > Reconciliation** |
| **Evaluation kit** | Developer | Seeded fault-injection experiment with precision, recall, F1 and time-to-reconcile; integrity checks; k6 load, stress, spike and webhook-throughput scripts. See `docs/EVALUATION.md` |
| **PDF statements** | Member, Admin, Bookkeeper | Member statement (optional date range, brought-forward and closing balance, loans) and **cooperative statement** (collections by channel and purpose, every member's savings and loan balance, every payment in the period) |
| Bulk import | Admin | Excel/CSV, validation preview, all-or-nothing import, **claim codes** |
| Self-registration | Member | Join via the cooperative link; staff approve |
| Dashboards | Admin, Member | Totals, 6-month collections chart, recent payments |
| **Platform owner dashboard** | You (super admin) | All cooperatives, members, money transacted, **fees and revenue**, visitor analytics, attention alerts, suspend/reactivate a cooperative |

The platform **never moves money out**. Loan payouts are made by the admin outside the system.

## 2. Folder structure

```
app/                     Next.js routes (pages, server actions, API routes)
  actions/auth.js          login, logout, register cooperative, join, claim account
  admin/                   dashboard, members, payments, record payment, loans, import, settings (+ actions.js)
  member/                  home, passbook, pay, payment status, loans (+ actions.js)
  api/webhooks/paystack/   THE webhook endpoint
  api/payments/            initialize + status (polling / verify fallback)
  api/receipt, export/*, import-template, track (anonymous page views), platform/revenue (fee ledger CSV)
  platform/                platform-owner dashboard: overview, revenue, cooperatives (+ detail), visitors
  c/[slug]/                public cooperative landing + join page
components/              ActionForm, ManualPaymentForm, ImportWizard, PayForm, ...
lib/                     supabase clients, paystack, signature, money, import validation, format
middleware.js            route-level role guard
supabase/migrations/     8 SQL files: schema, functions, RLS, storage, platform, revenue, loan repayment + statements, reconciliation   (docs/all_migrations_combined.sql = all four)
scripts/                 seed.mjs, simulate-webhook.mjs
tests/                   unit/ (no database)  integration/ (needs Supabase + seed)
docs/REPORT_ALIGNMENT.md Differences between this code and the project report (READ THIS)
```

## 3. Prerequisites (all free)

1. **Node.js 22.12 or newer** (https://nodejs.org) and **Git**. Check: `node -v`, `git --version`. Next.js 16 needs Node ≥20.9, Supabase JS needs ≥22, and Vitest 5 needs ≥22.12; this project targets all three.
2. **VS Code** (optional but recommended).
3. A **GitHub** account.
4. A **Supabase** account (https://supabase.com), free plan.
5. A **Paystack** account (https://paystack.com). Stay in **Test mode** (toggle at the top of the dashboard).
6. A **Vercel** account (https://vercel.com), Hobby plan, signed in with GitHub.
7. **ngrok** (https://ngrok.com), free plan, only if you want Paystack to call your *local* machine.
8. **Postman** (optional) for webhook tests.

## 4. Create the Supabase project

1. Supabase dashboard > **New project**. Pick a region close to Nigeria/Europe (e.g. a European one), set a database password and save it.
2. When ready, open **Project Settings > API** (or **API Keys**). Copy:
   * **Project URL**
   * the **anon / publishable** key
   * the **service_role / secret** key (**server only; never commit or expose it**)
   If the dashboard shows both "legacy" and new-style keys, either pair works with this code.
3. **SQL Editor > New query**. Paste and run the eight files in `supabase/migrations/` **in order**
   (or run `docs/all_migrations_combined.sql` once):
   1. `..._schema.sql`  2. `..._functions.sql`  3. `..._rls.sql`  4. `..._storage.sql`  5. `..._platform.sql`  6. `..._revenue.sql`  7. `..._loan_repayment_statements.sql`  8. `..._reconciliation.sql`
   Each must finish with "Success. No rows returned". If one errors, fix it before running the next.
4. Check **Storage**: a private bucket named `receipts` should exist.
5. **Authentication > Providers > Email**: leave enabled. The app creates users as already-confirmed through the
   admin API, so you do **not** depend on Supabase's rate-limited confirmation emails.
6. (Optional) **Authentication > Rate Limits / URL configuration** need no change for local use.

> **Free-plan note:** a free Supabase project **pauses after about a week of inactivity**. Open the dashboard and
> press *Restore/Resume* before a demo or defence. Free limits change, so check supabase.com/pricing.

## 5. Get your Paystack test keys

1. Paystack dashboard (Test mode) > **Settings > API Keys & Webhooks**.
2. Copy the **Test Secret Key** (`sk_test_...`).
3. You will paste the webhook URL here later (section 8).

## 6. Run the project locally

```bash
unzip cooperative-saas-mvp.zip && cd cooperative-saas-mvp
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
```

Edit `.env.local` and fill in the Supabase URL/keys and `PAYSTACK_SECRET_KEY`. Then:

```bash
npm run seed       # creates 2 test cooperatives with users, balances and one claim code each
npm run dev        # http://localhost:3000
```

Seeded logins (password for all: `Passw0rd!123`):

| Cooperative | Role | Email |
|---|---|---|
| Adeola Thrift Society | admin | admin.a@coop.test |
| | bookkeeper | book.a@coop.test |
| | members | member.a1@coop.test, member.a2@coop.test |
| UI Staff Cooperative | admin | admin.b@coop.test |
| | member | member.b1@coop.test |

The seed also creates the platform owner `platform@coop.test` (same password) and ~400 synthetic page views so the
Visitors charts are not empty. The seed prints one **claim code** per cooperative (member numbers A900 / B900) to try
the activation flow.

### Your platform owner (super admin) account

There is deliberately **no public sign-up** for this role. Create your real account with:
```bash
node scripts/create-platform-admin.mjs you@example.com "a-long-strong-password"
```
Log in at `/login`; you are sent to `/platform`. Delete `platform@coop.test` before going live (Supabase > Authentication > Users),
and do not run the seed script against a production project.

**What the platform dashboard shows**
* **Overview:** cooperatives (active/suspended), members (active/pending/unclaimed), total money transacted (all time, this month, today, online vs cash/transfer), savings held, loans outstanding, page views, visitors today, staff accounts, webhooks processed; 12-month charts; top cooperatives; newest cooperatives; recent activity; a *Needs attention* box (stale pending payments, failed payments, cooperatives with no payout account or no members).
* **Revenue:** gross fees, Paystack fees you bear, net revenue (all time, this month, today, 30/90/365 days), effective fee rate, 12-month and daily charts, a month-by-month table, revenue per cooperative, and a **fee ledger CSV** (one row per online payment).
* **Cooperatives:** one row per cooperative with admin, members, savings, amount transacted, last payment, payout status, registration date and a **Suspend / Reactivate** button. A suspended cooperative is locked out immediately, because the database stops recognising its tenant (every RLS policy fails).
* **Cooperative detail:** members (name, number, status, joined), staff, recent activity. Individual balances and passbooks are **not** shown (your report says the platform owner does not read tenants' member data).
* **Visitors:** page views, unique visitors today, daily chart (7/30/90 days), top pages, devices, most visited cooperative pages.

**How visits are counted (privacy):** a small script sends one anonymous ping per page view to `/api/track`. No cookies are set and no IP address is stored; a visitor is a one-way hash of (daily salt + IP + browser) that changes every day. Bots, `/platform` pages and API calls are ignored, and browsers with Do Not Track on are skipped. Run `select public.purge_old_visits(180);` in the SQL editor now and then to stay inside the free storage quota.

## 7. A first walkthrough (also your screenshot checklist)

1. `/register`: register a new cooperative (screenshot: form + dashboard).
2. Admin > **Settings**: enter the cooperative's bank + 10-digit account. This creates the Paystack sub-account.
   *In test mode Paystack may reject made-up account numbers. If so, use test bank details from Paystack's docs, or
   leave it empty and keep `PAYSTACK_ALLOW_NO_SUBACCOUNT=true` (payment still works, without the split).*
3. Admin > **Members**: add a member (note the claim code) or **Bulk import**: download the template, fill, check, import.
4. `/claim`: activate that member with the code. Log in and see the opening balance in the passbook.
5. Member > **Pay contribution**: pay on Paystack's test page (see section 8). The passbook updates by itself.
6. Admin > **Record payment**: record a cash payment with a receipt photo; the member sees it with a receipt link.
7. Member > **Loans**: request; Admin > **Loans**: approve, "I have paid this out", then record repayments.
8. Log in as `admin.b` and confirm none of cooperative A's data appears.

## 8. Test the Paystack payment and webhook

**Where the money goes:** every online payment (contribution or loan repayment) is created with the cooperative's Paystack sub-account, which is built from the bank account the admin saved in **Settings > Payout account**. Paystack settles the cooperative's share into that bank account on Paystack's settlement schedule (not instantly; check their current schedule). In test mode nothing real settles.

**Option A: no tunnel (easiest).** Pay on the Paystack test checkout. The "Confirming your payment" page polls
`/api/payments/status`; after ~6 s it asks Paystack directly (verify fallback) and the same idempotent database
function credits the passbook. You do not need a webhook for this to work locally.

**Option B: real webhook through ngrok.**
```bash
ngrok http 3000                 # copy the https://xxxx.ngrok-free.app URL
```
Paystack dashboard (Test mode) > Settings > API Keys & Webhooks > **Test Webhook URL**:
`https://xxxx.ngrok-free.app/api/webhooks/paystack` > Save. Make a payment and watch **Webhook logs** in the
Paystack dashboard show HTTP 200 (screenshot for Chapter 4). Set `NEXT_PUBLIC_APP_URL` to the ngrok URL while testing
so Paystack's redirect returns to the right place.

**Test card (check Paystack's current "Test cards" docs):** `4084 0840 8408 4081`, any future expiry, CVV `408`,
PIN `0000`, OTP `123456`.

**Simulate webhooks (tests I2 to I5, no real payment):** start a payment so a `pending` transaction exists, copy its
reference, then:
```bash
node scripts/simulate-webhook.mjs CT-xxxxxxxxxxxxxxxx 5000                 # valid  -> 200 "credited"
node scripts/simulate-webhook.mjs CT-xxxxxxxxxxxxxxxx 5000                 # replay -> 200 "duplicate"
node scripts/simulate-webhook.mjs CT-xxxxxxxxxxxxxxxx 5000 --bad-signature # forged -> 401
```

**Loan repayment test:** log in as `member.a1@coop.test` (the seed gives them an active loan), open Loans, pay part of it with the Paystack test card, and watch the loan balance fall and a "Loan repayment (online)" line appear in the passbook. Pay the rest to see the loan become *repaid*.

**PDF statement test:** as a member, Passbook > *Download PDF statement* (try a date range). As `admin.a@coop.test`, Statements > *This month (PDF)*. Screenshots go in Chapter 4.

**Platform dashboard test (screenshots for Chapter 4):** log in as `platform@coop.test`, open Overview, Cooperatives,
a cooperative's detail page and Visitors. Press **Suspend** on UI Staff Cooperative, then try to log in as `admin.b@coop.test`
(you are shown the "suspended" page). Press **Reactivate** and log in again.

### How your platform earns (fees and revenue)

Set your fee in `.env.local` (and in Vercel's environment variables):

| Variable | Meaning | Example |
|---|---|---|
| `PLATFORM_FEE_KOBO` | flat fee per **online** payment, in kobo (default `0` = no fee) | `5000` = N50 |
| `PLATFORM_FEE_PERCENT` | plus this % of the payment | `0.5` |
| `PAYSTACK_BEARER` | who pays Paystack's own processing fee | `subaccount` (cooperative) or `account` (you) |

* Fee = flat + percent, never more than half the payment. It is added to each Paystack transaction as the platform's share (`transaction_charge`); the rest settles to the cooperative's sub-account.
* **Use `PAYSTACK_BEARER=subaccount`** unless you have a reason not to. With `account`, *you* pay Paystack's fee (about 1.5% + N100, check their pricing) out of your own fee, so a small flat fee loses money on larger payments. The Revenue page shows this honestly as net revenue.
* Cash and transfer entries are not charged: the platform never touches that money.
* The fee is written to the transaction by the server when the payment starts. Members cannot write fee columns (test T13). Paystack's processing fee is read from the verified webhook.
* **Net revenue = gross fees - Paystack fees you bear.** These are your platform's records of what it routed to itself; reconcile them against your Paystack settlements. Payments made before migration 6 show a fee of 0. Subscription billing is not part of this MVP, so revenue = transaction fees only.

## 9. Run the automated tests

```bash
npm test                  # unit tests: money maths, import validation, signature, slug/CSV, visit tracking (no database needed)
npm run seed              # (re)create the two test cooperatives
npm run test:integration  # isolation (T1-T15) + payment reconciliation incl. loan repayment + the six fault classes (reconciliation.test.js) (I2,I4,I5,I6) against YOUR Supabase project
```
Put screenshots of the terminal output in Chapter 4.6. Manual cases (I1, I7-I13, A1-A7) follow the walkthrough above.
The integration tests write test rows to your database; run them against a development project, not real data.

### Evaluation (reconciliation, integrity, performance)

See **`docs/EVALUATION.md`**. In short: `npm run eval:selftest` (harness self-test, no database), then against a SEPARATE test
Supabase project `npm run eval -- --n=1000 --rate=0.15 --runs=10`, `npm run eval:integrity`, and the k6 scripts in `eval/k6/`.
Settlement reports are simulated (`/api/webhooks/settlement`); confirm in Paystack test mode that the cooperative's share
appears as `data.fees_split.subaccount` in the payment confirmation, because the split check reads that field.

## 10. Deploy to Vercel (free)

1. Push to GitHub:
   ```bash
   git init && git add . && git commit -m "CoopLedger MVP"
   git branch -M main && git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main
   ```
   `.env.local` is git-ignored. Never commit keys.
2. Vercel > **Add New > Project** > import the repo. Framework is detected as Next.js.
3. **Environment Variables:** add every key from `.env.example` (set `NEXT_PUBLIC_APP_URL` to your Vercel URL, e.g.
   `https://your-app.vercel.app`, and `PAYSTACK_ALLOW_NO_SUBACCOUNT=false` if you want real split enforcement).
4. Deploy. Set `NEXT_PUBLIC_APP_URL` correctly and redeploy if you set it after the first build.
5. Paystack > Test Webhook URL: `https://your-app.vercel.app/api/webhooks/paystack`.
6. Run `npm run seed` locally against the same Supabase project if you want the demo accounts on the live site.
7. Screenshot the live site with the padlock for Section 4.9.

## 11. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Invalid API key` / 401 from Supabase | Wrong key pasted, or `.env.local` not reloaded: restart `npm run dev` |
| `permission denied for function ...` after login | Migration 2 not fully run (the GRANT block at the end). Re-run it |
| `/platform` or Revenue shows empty or errors | Migration 5 or 6 not run, or you are not logged in as a platform admin |
| Visitors page empty | Visits are recorded only after the app has been opened in a normal browser (not bots). Run the seed for demo data |
| `relation "public.members" does not exist` | Migration 1 not run, or run in the wrong project |
| Registration says "Could not create the cooperative" | Check `SUPABASE_SERVICE_ROLE_KEY`; check the Supabase logs |
| Logged in but bounced to `/login` | Account has no role claim. Re-register, or run `npm run seed` |
| Receipt upload fails with "new row violates row-level security" | `..._storage.sql` not run, or you are logged in as a member (only staff upload) |
| Settings: "Paystack could not set up the payout account" | Test mode may reject fake bank details. Use Paystack's test details, or keep `PAYSTACK_ALLOW_NO_SUBACCOUNT=true` and skip it |
| Paystack init error "Invalid key" | Use the **Test** secret key (`sk_test_...`) |
| Payment stays "Confirming…" | Webhook URL not set (local) and verify fallback failing: check the terminal, and that `PAYSTACK_SECRET_KEY` is right |
| Font styles look wrong after a fresh checkout | Fonts are vendored in `app/fonts/`; make sure both `.woff2` files are present. No internet is needed to build |
| Supabase paused | Dashboard > Restore project |
| `npm audit` flags `xlsx` | **Known risk, deliberately retained.** npm only publishes `xlsx@0.18.5`, which has [prototype-pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) and [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) advisories. It parses spreadsheets uploaded by trusted admins only, and the app validates every row before writing. A patched build exists on the SheetJS CDN but is not on npm; switching to it changes how the dependency is installed. Do not expose bulk import to untrusted users |
| Import: leading zeros lost | Format `member_no`/`phone` as **Text** in Excel; phone zeros are repaired automatically |

## 12. Security design (summary, matches Chapter 3.7)

* **RLS on every table**; `tenant_id` comes from the user's token/profile, never from request input.
* **Least privilege:** table-level GRANTs are minimal. Users can only SELECT, update a few member columns, and insert a *pending online* transaction for themselves. All ledger, loan, import and manual-payment writes go through `SECURITY DEFINER` functions that re-check role and tenant.
* **Webhook:** raw-body HMAC-SHA512, constant-time compare; atomic function with `webhook_events` unique key (idempotency), `FOR UPDATE` row lock, amount and currency compared with our own record.
* **Platform data** is read only by server code, after two independent checks (role claim in the token and a row in `platform_admins`). Tenant users cannot call the platform functions or read `platform_admins` / `site_visits` (tests T11, T12).
* **Service-role key** only in server code (`lib/supabase/service.js` imports `server-only`).
* **Receipts:** private bucket, tenant-folder policies, 2 MB / image-only limits, 60-second signed URLs.
* **Claim codes:** CSPRNG, unambiguous alphabet, single use (atomic reserve), rate-limited attempts.
* **CSV exports** neutralise spreadsheet formula injection.

## 13. Known limitations (state them honestly in your report)

* No automatic loan disbursement (by design) and no withdrawal screen.
* PDF statements use a built-in font: amounts are written "NGN 1,234.00" and accents are simplified (e.g. a name with dot-below letters prints as plain letters).
* No SMS/USSD/offline mode; English only.
* Claim-code rate limiting is in-memory (per serverless instance), so it slows guessing but is not a hard cap.
* Passwords for staff accounts created by the admin are set by the admin (no email invite flow, to avoid email limits on free plans).
* Not load-tested; test-mode payments only.
