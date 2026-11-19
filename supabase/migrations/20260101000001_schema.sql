-- =====================================================================
-- 001  SCHEMA: shared-database, shared-schema multi-tenant design.
-- Every business table carries tenant_id. Isolation is enforced by RLS (003).
-- =====================================================================

create table public.tenants (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(name) between 3 and 120),
  slug                     text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  plan                     text not null default 'basic',
  loan_multiplier          numeric(4,2) not null default 2.00 check (loan_multiplier >= 0),
  default_interest_rate    numeric(5,2) not null default 5.00 check (default_interest_rate >= 0),
  bank_code                text,
  bank_name                text,
  account_number           text,
  paystack_subaccount_code text,
  created_at               timestamptz not null default now()
);

create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role      text not null check (role in ('admin','bookkeeper','member')),
  full_name text,
  created_at timestamptz not null default now()
);

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid unique references auth.users(id) on delete set null,
  member_no   text not null,
  full_name   text not null,
  phone       text,
  email       text,
  claim_code  text unique,
  claimed_at  timestamptz,
  -- unclaimed = imported/added by staff, account not yet activated
  -- pending   = self-registered, waiting for staff approval
  status      text not null default 'active' check (status in ('unclaimed','pending','active','suspended')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, member_no)
);

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  reference   text not null unique,
  amount      numeric(14,2) not null check (amount > 0),
  channel     text not null check (channel in ('online','cash','transfer')),
  status      text not null default 'pending' check (status in ('pending','success','failed')),
  receipt_url text,                       -- storage path inside the private "receipts" bucket
  note        text,
  recorded_by uuid references auth.users(id) on delete set null,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Append-only member ledger. Only the savings-affecting types change running_balance:
--   opening, contribution  => + amount     withdrawal => - amount
--   loan_disbursed, repayment are informational (balance unchanged)
create table public.passbook_entries (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  transaction_id  uuid references public.transactions(id) on delete set null,
  entry_type      text not null check (entry_type in ('opening','contribution','withdrawal','loan_disbursed','repayment')),
  amount          numeric(14,2) not null check (amount >= 0),
  running_balance numeric(14,2) not null check (running_balance >= 0),
  note            text,
  entry_date      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table public.loans (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  principal       numeric(14,2) not null check (principal > 0),
  interest_rate   numeric(5,2) not null default 0 check (interest_rate >= 0),   -- simple interest, % per year
  tenor_months    int not null default 1 check (tenor_months between 1 and 120),
  total_repayable numeric(14,2),           -- set when approved: principal + simple interest
  amount_repaid   numeric(14,2) not null default 0,
  status          text not null default 'requested' check (status in ('requested','approved','rejected','active','repaid')),
  approved_by     uuid references auth.users(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table public.loan_repayments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  loan_id    uuid not null references public.loans(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  recorded_by uuid references auth.users(id) on delete set null,
  paid_at    timestamptz not null default now()
);

create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  actor_id   uuid,
  action     text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- Idempotency store for gateway events (no tenant column: written only by the service role).
create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz not null default now()
);

-- Indexes that support the RLS predicates and common queries
create index on public.profiles(tenant_id);
create index on public.members(tenant_id);
create index on public.members(user_id);
create index on public.transactions(tenant_id, member_id);
create index on public.transactions(tenant_id, created_at desc);
create index on public.passbook_entries(tenant_id, member_id, seq);
create index on public.loans(tenant_id, member_id);
create index on public.loan_repayments(tenant_id, loan_id);
create index on public.audit_logs(tenant_id, created_at desc);
