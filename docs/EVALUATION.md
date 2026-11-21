# Evaluation kit (Chapter 3, Section 3.10; results go in Chapter 4)

> **Nothing here has been run yet.** The SQL, the scripts and the k6 files were written without access to a database or
> to k6. Run everything against a **separate test Supabase project**, never your live one. The reconciliation numbers
> in your report must come from `npm run eval` against that project, **not** from `--mode=model`.

## What each part measures

| Dimension (Section) | Tool in this repository | Command |
|---|---|---|
| 3.10.3 Functional correctness | Vitest unit and integration tests, manual walkthrough | `npm test`, `npm run test:integration` |
| 3.10.4 Isolation and security | `tests/integration/isolation.test.js` (T1 to T15), forged-signature checks | `npm run test:integration`, `node scripts/simulate-webhook.mjs ... --bad-signature` |
| 3.10.5 Reconciliation accuracy | `eval/run-experiment.mjs` (fault injection + scoring) | `npm run eval -- ...` |
| 3.10.6 Financial integrity | SQL function `integrity_violations()` | `npm run eval:integrity` |
| 3.10.7 Performance and scalability | k6 scripts in `eval/k6/` | `k6 run eval/k6/load.js` |
| 3.10.8 Usability | SUS questionnaire (report Appendix F) | by hand |

## 1. Set up the test project

1. Create a second Supabase project (free) for testing. Run the **eleven** migrations in order (or `docs/all_migrations_combined.sql`).
2. Create `.env.local` with the keys listed in README section 6 and point it at the TEST project. Set `PAYSTACK_SECRET_KEY` to your test secret.
3. `npm run seed` (creates the two isolation-test cooperatives).

## 2. The reconciliation experiment (Section 3.10.5)

Self-test of the harness (no database; numbers are **not** evidence):

```bash
npm run eval:selftest
```

The real experiment (database functions called directly, fastest):

```bash
npm run eval -- --n=1000 --rate=0.15 --runs=10 --mode=rpc --settle-window=5
npm run eval -- --n=1000,5000,10000 --rate=0.05,0.15,0.30 --runs=10      # the full grid of Chapter 3
```

Through the running application instead (signed HTTP webhooks, as in Chapter 3): start `npm run dev`, then add
`--mode=http --url=http://localhost:3000`.

What a run does (Algorithm "Fault-injection experiment and scoring"):

1. Creates a throw-away cooperative with 20 members and `n` pending payments (a NGN 50 platform fee, the cooperative bearing Paystack's fee).
2. Generates ground truth from a seed: a fraction of payments get one of the six faults.
3. The simulated gateway sends signed events and settlement reports, applying each fault.
4. The scorer compares `reconciliation_results` with the ground truth and prints Markdown tables: accuracy, precision, recall, F1,
   reconciliation time (mean, median, p95), automation and manual-intervention rates, unresolved cases, double credits, value at risk,
   and per-fault results, as mean ± standard deviation over the runs. It also runs the integrity checks.
5. Saves a JSON file in `eval/results/` and deletes the test cooperative (use `--keep=true` to inspect it).

Time scaling: the settlement window is `--settle-window` seconds (default 5) instead of the real 48 hours. State this in Chapter 3/4
(Threats to validity) and, if you can, repeat a small run with real windows.

## 3. Integrity checks (Section 3.10.6)

```bash
npm run eval:integrity     # I1 to I6; exits with code 1 if any invariant is violated
```
Run it after every experiment and after every load test. **I7** (a PDF statement's closing balance equals the passbook balance) is checked by hand: download a statement and compare.

## 4. Load, stress and spike tests (Section 3.10.7) with k6

Install k6 (https://k6.io). Seed the test project first (`npm run seed`) so the test member `member.a1@coop.test` exists.

```bash
k6 run -e BASE_URL=http://localhost:3000 -e SUPABASE_URL=https://YOUR-TEST.supabase.co -e SUPABASE_ANON_KEY=... eval/k6/smoke.js
k6 run ... eval/k6/load.js        # 50 virtual users
k6 run ... eval/k6/stress.js      # 50 -> 300 virtual users
k6 run ... eval/k6/spike.js       # 20 -> 200 -> 20
npm run eval:prepare-load -- --count=3000
k6 run -e RATE=10 -e BASE_URL=... -e PAYSTACK_SECRET_KEY=... eval/k6/webhook.js   # RATE = 5, 10, 20, 50 events per second
```

* The journeys call the public pages and the database through the REST API with a member's token, so **Row-Level Security is part of what is measured**. They do not log into the Next.js pages (session cookies are awkward in k6).
* k6 reports throughput (`http_reqs`), response time (`avg`, `med`, `p(95)`, `p(99)`) and error rate (`http_req_failed`). Copy them into the Chapter 4 tables.
* CPU and memory: read them from your machine's monitor (local run) or the Vercel and Supabase dashboards (hosted run); note which you used.
* Database query performance: in the Supabase SQL editor run `explain analyze` on the passbook query, and read `pg_stat_statements` after a test.
* **Free tiers will throttle you.** Start with the smoke test, then raise the load until you see errors, and report that limit; do not hammer a project you care about.
* Horizontal scaling: if you can run 1, 2 and 4 copies of the app behind a load balancer, repeat `load.js` for each and report the scaling efficiency; otherwise report it as "not controllable on this hosting".

## 5. Assumptions and limits (say these in the report)

* **Settlement reports are simulated.** Paystack's test mode produces no real settlements. `POST /api/webhooks/settlement` is the interface that a real settlement job would call. The experiment's simulated gateway uses it.
* **The cooperative's share in the payment confirmation** is read from `data.fees_split.subaccount` (kobo). **Confirm this field name in Paystack test mode** (look at a real `charge.success` event in the dashboard's webhook log). If it is absent, the split check is skipped for that payment.
* The six faults are a defined fault model; the results describe behaviour on that model only.
* The model mode (`--mode=model`) reproduces the rules in JavaScript to test the harness. It always scores 100% and proves nothing about the database.
