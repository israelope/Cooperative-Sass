# Report alignment notes

The project report (Chapters 3 and 4, Appendices A and B) was written before the code. The code is the source of
truth, so **update the report's listings to match this repository**. These are the places where they differ.

| # | Topic | In the report | In this repository | What to do |
|---|-------|---------------|--------------------|-----------|
| 1 | Language | TypeScript (`.ts/.tsx`, type annotations) | JavaScript (`.js`), Next.js App Router | Use the JS listings; change "TypeScript/JavaScript" to "JavaScript (ES2022)" in 4.2 |
| 2 | Backend packages | `@/lib/supabase-server` etc. | `lib/supabase/server.js`, `service.js`, `client.js` | Use real file names in listings |
| 3 | Claim-code generation | JS function `makeClaimCode()` in `lib/import.js` | SQL function `gen_claim_code()` (CSPRNG via `gen_random_uuid`), format `K7P2-9QXA` | Replace Listing 4.x (import) with `supabase/migrations/..._functions.sql` excerpt + `lib/importValidate.js` |
| 4 | Member status values | unclaimed, active, suspended | adds **pending** (self-registered, awaiting approval, FR4) | Update data dictionary Table 3.x |
| 5 | Passbook semantics | `amount` "signed or typed" | `amount >= 0`; `entry_type` decides the sign. Only `opening`/`contribution` (+) and `withdrawal` (-) change `running_balance`; `loan_disbursed` and `repayment` are informational lines | Update data dictionary |
| 6 | Extra columns | not listed | `passbook_entries.seq` (identity, ordering), `.note`; `loans.total_repayable`, `.amount_repaid`; `tenants.bank_code/bank_name/account_number/default_interest_rate`; `transactions.note` | Update ERD/data dictionary |
| 7 | RLS member policy | `members_staff_write FOR ALL` | `members_staff_update` (UPDATE only) + **column-level GRANTs**; INSERTs and ledger writes happen only inside `SECURITY DEFINER` functions | Replace Listing 4.x (RLS) with `..._rls.sql` |
| 8 | Tenant source | JWT `app_metadata` only | JWT `app_metadata` first, falling back to the `profiles` row (`current_tenant_id()`, `current_role_name()`) | Mention in 3.5.3.3 |
| 9 | Receipt upload | Server action uploads the file | Browser compresses the image and uploads directly to the private bucket (RLS restricts the folder to the user's tenant); the server action receives only the storage path | Update 4.3.5 and Listing 4.x |
| 10 | Webhook handler | inline logic + RPC | identical idea: raw-body HMAC check (`lib/signature.js`) then `process_successful_payment()` RPC which returns `credited`, `duplicate`, `mismatch`, `unknown_reference`, `not_pending` | Listing 4.x can be copied from `app/api/webhooks/paystack/route.js` |
| 11 | Verify fallback | mentioned as optional | Implemented: `/api/payments/status?verify=1` asks Paystack and calls the **same** idempotent function (so it works locally without ngrok) | Add one sentence to 4.3.4 |
| 12 | Registration bank details | on the registration form (Wireframe 1) | moved to **Settings > Payout account** (Paystack sub-account is created there) | Edit Wireframe 1 or 4.3.1 |
| 13 | Loan repayments | "online or manual" | **Built both ways**: online through Paystack (`transactions.purpose = 'loan_repayment'`, `loan_id`; credited by the same signed webhook; overpayment goes to savings) and manual by staff | Add `purpose`, `loan_id` to the transactions data dictionary and `transaction_id` to loan_repayments; update the webhook algorithm (Algorithm 3.2) with the loan branch |
| 14 | Withdrawals | in schema/passbook | supported by the ledger function (`withdrawal` type) but **no screen** records withdrawals in this MVP | Mention as a limitation or future work |
| 15 | Payment split and fees | `bearer: 'account'`, flat fee | flat + percentage platform fee (`PLATFORM_FEE_KOBO`, `PLATFORM_FEE_PERCENT`); default bearer is the **cooperative** (`subaccount`) so the platform's fee is clean revenue; fee and Paystack's fee are stored on every transaction (`platform_fee`, `paystack_fee`, `fee_bearer`) | Change `bearer: 'account'` in Listing 4.x to the env-driven values; add the three columns to the data dictionary |
| 16 | Platform owner / super admin | role listed in Table 3.x (user roles) | **Built** under `/platform`: overview, cooperatives, cooperative detail, visitors; suspend/reactivate; `platform_admins` table; created only by script | Add use cases (View platform statistics, Suspend cooperative) to 3.5.4, a Platform Owner actor to Figure 3.6, `platform_admins`, `site_visits` and `tenants.status` to the ERD and data dictionary, and screenshots to 4.8 |
| 17 | Visit analytics | not in report | Cookie-free, IP-free page-view log (`site_visits`), shown on the Visitors page | Describe in 3.7 (privacy, NDPA 2023 data minimisation) |
| 18 | Per-cooperative account numbers | "each cooperative has its own account number" | Each cooperative saves its own bank account; a Paystack **sub-account** per cooperative receives its payments via split settlement. Members pay through Paystack checkout. **No dedicated virtual account number per cooperative/member** | Word 3.5/4.3.4 accordingly, or list dedicated virtual accounts under 5.5 Future Work |
| 19 | Revenue reporting | not in report | **Built**: `/platform/revenue` (gross fees, net revenue, effective rate, per month/day/cooperative, fee-ledger CSV). Revenue = transaction fees only; no subscription billing | Add a "View revenue report" use case and a Revenue wireframe/screenshot; mention subscription billing under Future Work |
| 20 | PDF statements | not in report | **Built**: member statement PDF and cooperative statement PDF (`/api/statements/...`, SQL `cooperative_statement()`) using `pdf-lib` | Add use cases "Download statement" (member) and "Download cooperative statement" (admin); add sample PDF pages to 4.8 |
| 21 | Reconciliation record | Table "Data dictionary: reconciliation_results", FR21 to FR23 | **Built** in migration 008 (`reconciliation_results`, 14 fields exactly as in the data dictionary) and the page Admin > Reconciliation | None; matches Chapter 3 |
| 22 | Where settlement reports and early events are stored | not stated | Settlement notices are rows of `webhook_events` with `event_type = 'settlement'` (reference `settle:<ref>`); events that arrive before their payment is visible are rows with `event_type = 'held'` (reference `held:<ref>`) | Add one sentence to the `webhook_events` row of the data dictionary |
| 23 | Partial payment | "No credit; held for an officer" | The transaction stays **pending** (not failed) with status NEEDS_REVIEW; the officer chooses to accept the amount received, mark it failed, or acknowledge | None |
| 24 | Integrity invariant I1 | "exactly one matching passbook entry (or repayment entry)" | Contributions: exactly one entry; **loan repayments: the linked entries add up to the payment** (an overpayment writes a repayment line and a savings line) | Reword I1 slightly |
| 25 | Algorithm 3.2 step order | idempotency, lookup, checks, credit | Same order in SQL (`process_payment_event`); an early event is stored as `held:` and re-processed by `reconcile_sweep` | None |
| 26 | Simulated gateway | "simulated gateway for fault injection" | `eval/lib/gateway.mjs` + `eval/run-experiment.mjs`; the settlement interface is `POST /api/webhooks/settlement` | None |
| 27 | Cooperative share in the confirmation | "reported by the gateway" | Read from `data.fees_split.subaccount` (kobo). **Confirm the field in Paystack test mode** | Mention as an assumption in 3.3.4 or 3.8.4 |

## Test case IDs mapped to automated tests

| Report test IDs | Where |
|-----------------|-------|
| U1-U4 | `tests/unit/money.test.js` |
| U5 (claim code) | SQL `gen_claim_code()`; check manually with `select public.gen_claim_code();` in the SQL editor (run 10 times) |
| U6-U8 | `tests/unit/importValidate.test.js` |
| Visit tracking helpers | `tests/unit/track.test.js` |
| Fee calculation | `tests/unit/fees.test.js` |
| Statement periods and balances; PDF generation | `tests/unit/statement.test.js`, `tests/unit/pdf.test.js` |
| Online loan repayment reconciliation | `tests/integration/payments.test.js` |
| Six fault classes, exceptions, integrity | `tests/integration/reconciliation.test.js` |
| Fault generator, metrics, harness self-test | `tests/unit/evalKit.test.js` |
| U9, I2, I3 | `tests/unit/signature.test.js`, `scripts/simulate-webhook.mjs` (valid, then `--bad-signature`) |
| I2, I4, I5, I6 | `tests/integration/payments.test.js` |
| T1-T10, plus T11 (platform data protected), T12 (suspension), T13 (members cannot write fee columns), T14 (no repayment for another member's loan), T15 (cooperative statement scoped to own cooperative) | `tests/integration/isolation.test.js` |
| I1, I7-I13, A1-A7 | manual (follow README section 9) |
