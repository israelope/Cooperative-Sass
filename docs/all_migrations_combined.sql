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
-- =====================================================================
-- 002  FUNCTIONS: helpers, atomic ledger writes, reconciliation, loans
-- All SECURITY DEFINER functions pin search_path and re-check the caller's
-- tenant and role themselves (they bypass RLS by design).
-- =====================================================================

-- ---------- identity helpers (used by RLS policies) ----------
create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    (select p.tenant_id from public.profiles p where p.id = auth.uid())
  )
$$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    (select p.role from public.profiles p where p.id = auth.uid())
  )
$$;

-- ---------- claim codes: 8 chars, unambiguous alphabet, CSPRNG source ----------
create or replace function public.gen_claim_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 chars, no 0/O/1/I/L
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + (get_byte(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 0) % 31), 1);
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end $$;

-- ---------- audit ----------
create or replace function public.log_audit(p_action text, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_role_name() not in ('admin','bookkeeper') then
    raise exception 'Not allowed';
  end if;
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (public.current_tenant_id(), auth.uid(), p_action, p_details);
end $$;

-- ---------- the ONLY writer of passbook_entries ----------
-- Locks the member row so concurrent writes cannot corrupt the running balance.
create or replace function public.append_passbook_entry(
  p_tenant uuid, p_member uuid, p_txn uuid, p_type text,
  p_amount numeric, p_date timestamptz, p_note text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  prev numeric(14,2);
  delta numeric(14,2);
  newbal numeric(14,2);
begin
  perform 1 from public.members where id = p_member and tenant_id = p_tenant for update;
  if not found then raise exception 'Member does not belong to this cooperative'; end if;

  select running_balance into prev from public.passbook_entries
   where member_id = p_member order by seq desc limit 1;
  prev := coalesce(prev, 0);

  delta := case
             when p_type in ('opening','contribution') then p_amount
             when p_type = 'withdrawal' then -p_amount
             else 0 end;
  newbal := prev + delta;
  if newbal < 0 then raise exception 'Insufficient savings balance'; end if;

  insert into public.passbook_entries(tenant_id, member_id, transaction_id, entry_type, amount, running_balance, note, entry_date)
  values (p_tenant, p_member, p_txn, p_type, p_amount, newbal, p_note, coalesce(p_date, now()));
  return newbal;
end $$;

-- ---------- RECONCILIATION: atomic and idempotent (service role only) ----------
create or replace function public.process_successful_payment(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  inserted int;
begin
  -- 1. Idempotency: a duplicate event hits the unique key and is ignored
  insert into public.webhook_events(reference, event_type, payload)
  values (p_reference, 'charge.success', p_payload)
  on conflict (reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  -- 2. Lock the pending transaction
  select * into t from public.transactions where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if t.status <> 'pending' then return 'not_pending'; end if;

  -- 3. Validate amount and currency against OUR record, never trust the payload alone
  if t.amount <> p_amount or upper(coalesce(p_currency,'')) <> 'NGN' then
    update public.transactions set status = 'failed', note = 'Amount/currency mismatch' where id = t.id;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.mismatch', jsonb_build_object('reference', p_reference, 'expected', t.amount, 'received', p_amount));
    return 'mismatch';
  end if;

  -- 4. Mark success and write the passbook entry (tenant_id comes from OUR transaction row)
  update public.transactions set status = 'success', paid_at = now() where id = t.id;
  perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Online payment');
  insert into public.audit_logs(tenant_id, action, details)
  values (t.tenant_id, 'payment.reconciled', jsonb_build_object('reference', p_reference, 'amount', t.amount));
  return 'credited';
end $$;

-- ---------- member creation (internal) ----------
create or replace function public.create_member_internal(
  p_tenant uuid, p_member_no text, p_full_name text, p_phone text, p_email text,
  p_open_savings numeric, p_open_loan numeric, p_date date
) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
  mid uuid;
  tries int := 0;
begin
  loop
    code := public.gen_claim_code();
    begin
      insert into public.members(tenant_id, member_no, full_name, phone, email, status, claim_code)
      values (p_tenant, p_member_no, p_full_name, nullif(p_phone,''), nullif(p_email,''), 'unclaimed', code)
      returning id into mid;
      exit;
    exception when unique_violation then
      if exists (select 1 from public.members where tenant_id = p_tenant and member_no = p_member_no) then
        raise exception 'Duplicate member number: %', p_member_no;
      end if;
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;

  if coalesce(p_open_savings, 0) > 0 then
    perform public.append_passbook_entry(p_tenant, mid, null, 'opening', p_open_savings, p_date::timestamptz, 'Opening balance (cut-off ' || p_date || ')');
  end if;
  if coalesce(p_open_loan, 0) > 0 then
    insert into public.loans(tenant_id, member_id, principal, interest_rate, tenor_months, total_repayable, amount_repaid, status, approved_at)
    values (p_tenant, mid, p_open_loan, 0, 1, p_open_loan, 0, 'active', now());
  end if;
  return code;
end $$;

-- ---------- add one member (staff) ----------
create or replace function public.add_member(
  p_member_no text, p_full_name text, p_phone text, p_email text, p_opening_savings numeric
) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_member_no,''))) = 0 or char_length(trim(coalesce(p_full_name,''))) < 3 then
    raise exception 'Member number and full name are required';
  end if;
  code := public.create_member_internal(public.current_tenant_id(), trim(p_member_no), trim(p_full_name),
            p_phone, p_email, coalesce(p_opening_savings,0), 0, current_date);
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (public.current_tenant_id(), auth.uid(), 'member.added', jsonb_build_object('member_no', p_member_no));
  return code;
end $$;

-- ---------- bulk import (admin): all-or-nothing in one transaction ----------
create or replace function public.import_members(p_rows jsonb, p_cutoff date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  code text;
  result jsonb := '[]'::jsonb;
  tid uuid := public.current_tenant_id();
begin
  if public.current_role_name() <> 'admin' then raise exception 'Only a cooperative admin can import members'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No rows to import'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Too many rows (max 2000 per import)'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    code := public.create_member_internal(
      tid, r->>'member_no', r->>'full_name', r->>'phone', r->>'email',
      coalesce((r->>'opening_savings')::numeric, 0), coalesce((r->>'opening_loan_balance')::numeric, 0),
      coalesce(p_cutoff, current_date));
    result := result || jsonb_build_object('member_no', r->>'member_no', 'full_name', r->>'full_name', 'claim_code', code);
  end loop;

  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'members.imported', jsonb_build_object('count', jsonb_array_length(p_rows), 'cutoff', p_cutoff));
  return result;
end $$;

-- ---------- manual (cash / transfer) payment with receipt evidence ----------
create or replace function public.record_manual_payment(
  p_member_id uuid, p_amount numeric, p_channel text, p_receipt_path text, p_paid_on date, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid := public.current_tenant_id();
  m public.members%rowtype;
  txn_id uuid;
begin
  if public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  if p_channel not in ('cash','transfer') then raise exception 'Channel must be cash or transfer'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_receipt_path is null or left(p_receipt_path, 37) <> tid::text || '/' then
    raise exception 'A receipt image is required';
  end if;

  select * into m from public.members where id = p_member_id and tenant_id = tid;
  if not found then raise exception 'Member not found in your cooperative'; end if;
  if m.status not in ('active','unclaimed') then raise exception 'Member is not active'; end if;

  insert into public.transactions(tenant_id, member_id, reference, amount, channel, status, receipt_url, note, recorded_by, paid_at)
  values (tid, p_member_id, 'MAN-' || substr(replace(gen_random_uuid()::text,'-',''), 1, 16), p_amount, p_channel,
          'success', p_receipt_path, p_note, auth.uid(), coalesce(p_paid_on, current_date)::timestamptz)
  returning id into txn_id;

  perform public.append_passbook_entry(tid, p_member_id, txn_id, 'contribution', p_amount,
            coalesce(p_paid_on, current_date)::timestamptz, initcap(p_channel) || ' payment');
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'payment.manual', jsonb_build_object('member_id', p_member_id, 'amount', p_amount, 'channel', p_channel));
  return txn_id;
end $$;

-- ---------- loan summary: savings, outstanding, limit (SECURITY INVOKER: RLS applies) ----------
create or replace function public.member_summary(p_member_id uuid)
returns table (savings numeric, outstanding numeric, multiplier numeric, loan_limit numeric)
language sql stable set search_path = public as $$
  select s.savings, o.outstanding, t.loan_multiplier,
         greatest(0, round(t.loan_multiplier * s.savings - o.outstanding, 2))
  from (select coalesce(sum(case when entry_type in ('opening','contribution') then amount
                                 when entry_type = 'withdrawal' then -amount else 0 end), 0) as savings
          from public.passbook_entries where member_id = p_member_id) s,
       (select coalesce(sum(total_repayable - amount_repaid), 0) as outstanding
          from public.loans where member_id = p_member_id and status in ('approved','active')) o,
       (select loan_multiplier from public.tenants
         where id = (select tenant_id from public.members where id = p_member_id)) t
$$;

-- ---------- loans ----------
create or replace function public.request_loan(p_amount numeric, p_tenor int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m public.members%rowtype;
  lim numeric;
  rate numeric;
  lid uuid;
begin
  select * into m from public.members where user_id = auth.uid() and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Member record not found'; end if;
  if m.status <> 'active' then raise exception 'Your membership is not active'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid amount'; end if;
  if p_tenor is null or p_tenor < 1 or p_tenor > 120 then raise exception 'Enter a duration between 1 and 120 months'; end if;
  if exists (select 1 from public.loans where member_id = m.id and status = 'requested') then
    raise exception 'You already have a loan request waiting for a decision';
  end if;
  select loan_limit into lim from public.member_summary(m.id);
  if p_amount > coalesce(lim, 0) then raise exception 'Amount exceeds your eligible limit'; end if;
  select default_interest_rate into rate from public.tenants where id = m.tenant_id;
  insert into public.loans(tenant_id, member_id, principal, interest_rate, tenor_months, status)
  values (m.tenant_id, m.id, p_amount, rate, p_tenor, 'requested') returning id into lid;
  return lid;
end $$;

create or replace function public.decide_loan(p_loan_id uuid, p_approve boolean, p_interest numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.loans%rowtype;
  lim numeric;
  tid uuid := public.current_tenant_id();
begin
  if public.current_role_name() <> 'admin' then raise exception 'Only a cooperative admin can decide loans'; end if;
  select * into l from public.loans where id = p_loan_id and tenant_id = tid for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status <> 'requested' then raise exception 'This loan has already been decided'; end if;

  if p_approve then
    if p_interest is null or p_interest < 0 then raise exception 'Enter an interest rate'; end if;
    select loan_limit into lim from public.member_summary(l.member_id);
    if l.principal > coalesce(lim, 0) then raise exception 'Request now exceeds the member''s eligible limit'; end if;
    update public.loans set status = 'approved', interest_rate = p_interest,
           total_repayable = round(l.principal + l.principal * p_interest / 100 * l.tenor_months / 12, 2),
           approved_by = auth.uid(), approved_at = now() where id = l.id;
  else
    update public.loans set status = 'rejected', approved_by = auth.uid(), approved_at = now() where id = l.id;
  end if;
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), case when p_approve then 'loan.approved' else 'loan.rejected' end, jsonb_build_object('loan_id', l.id));
end $$;

-- Admin confirms the money was transferred OUTSIDE the platform, then activates the loan.
create or replace function public.activate_loan(p_loan_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.loans%rowtype;
  tid uuid := public.current_tenant_id();
begin
  if public.current_role_name() <> 'admin' then raise exception 'Only a cooperative admin can activate loans'; end if;
  select * into l from public.loans where id = p_loan_id and tenant_id = tid for update;
  if not found or l.status <> 'approved' then raise exception 'Only approved loans can be activated'; end if;
  update public.loans set status = 'active' where id = l.id;
  perform public.append_passbook_entry(tid, l.member_id, null, 'loan_disbursed', l.principal, now(), 'Loan disbursed (paid outside the platform)');
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'loan.activated', jsonb_build_object('loan_id', l.id));
end $$;

create or replace function public.record_repayment(p_loan_id uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.loans%rowtype;
  tid uuid := public.current_tenant_id();
  remaining numeric;
begin
  if public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  select * into l from public.loans where id = p_loan_id and tenant_id = tid for update;
  if not found or l.status <> 'active' then raise exception 'Repayments can only be recorded on active loans'; end if;
  remaining := l.total_repayable - l.amount_repaid;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid amount'; end if;
  if p_amount > remaining then raise exception 'Amount is more than the outstanding balance'; end if;

  insert into public.loan_repayments(tenant_id, loan_id, amount, recorded_by) values (tid, l.id, p_amount, auth.uid());
  update public.loans set amount_repaid = amount_repaid + p_amount,
         status = case when amount_repaid + p_amount >= total_repayable then 'repaid' else 'active' end
   where id = l.id;
  perform public.append_passbook_entry(tid, l.member_id, null, 'repayment', p_amount, now(), 'Loan repayment');
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'loan.repayment', jsonb_build_object('loan_id', l.id, 'amount', p_amount));
end $$;

-- ---------- dashboard numbers (SECURITY INVOKER: RLS limits everything to the caller's tenant) ----------
create or replace function public.admin_stats() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'members_active',   (select count(*) from public.members where status = 'active'),
    'members_unclaimed',(select count(*) from public.members where status = 'unclaimed'),
    'members_pending',  (select count(*) from public.members where status = 'pending'),
    'total_savings',    (select coalesce(sum(case when entry_type in ('opening','contribution') then amount
                                                  when entry_type = 'withdrawal' then -amount else 0 end), 0)
                           from public.passbook_entries),
    'month_collections',(select coalesce(sum(amount), 0) from public.transactions
                          where status = 'success' and paid_at >= date_trunc('month', now())),
    'pending_loans',    (select count(*) from public.loans where status = 'requested'),
    'active_loans',     (select count(*) from public.loans where status = 'active'),
    'outstanding_loans',(select coalesce(sum(total_repayable - amount_repaid), 0) from public.loans where status in ('approved','active')),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'total', coalesce(x.total, 0)) order by m), '[]'::jsonb)
                  from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
                  left join (select date_trunc('month', paid_at) as mm, sum(amount) as total
                               from public.transactions where status = 'success' group by 1) x on x.mm = m)
  )
$$;

-- =====================================================================
-- EXECUTE PERMISSIONS
-- Internal / trusted functions: service role only.  User-facing: signed-in users only.
-- (Supabase grants EXECUTE to anon/authenticated by default, so revoke explicitly.)
-- =====================================================================
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('append_passbook_entry','process_successful_payment','create_member_internal','gen_claim_code')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('current_tenant_id','current_role_name','log_audit','add_member','import_members',
                                'record_manual_payment','member_summary','request_loan','decide_loan',
                                'activate_loan','record_repayment','admin_stats')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
-- =====================================================================
-- 003  ROW-LEVEL SECURITY + TABLE PRIVILEGES
-- Defence in depth: (1) table privileges are minimal, (2) RLS filters rows,
-- (3) ledger writes happen only through trusted SECURITY DEFINER functions.
-- =====================================================================

alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.members          enable row level security;
alter table public.transactions     enable row level security;
alter table public.passbook_entries enable row level security;
alter table public.loans            enable row level security;
alter table public.loan_repayments  enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.webhook_events   enable row level security;   -- no policies => service role only

-- ---------- table privileges ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke all on public.webhook_events from authenticated;
grant select on public.tenants, public.profiles, public.members, public.transactions,
                public.passbook_entries, public.loans, public.loan_repayments, public.audit_logs to authenticated;
grant insert on public.transactions to authenticated;                                  -- members start online payments
grant update (full_name, phone, email, status) on public.members to authenticated;     -- staff edit/approve/suspend
grant update (name, loan_multiplier, default_interest_rate) on public.tenants to authenticated;

-- ---------- tenants ----------
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.current_tenant_id());
create policy tenants_admin_update on public.tenants for update to authenticated
  using (id = public.current_tenant_id() and public.current_role_name() = 'admin')
  with check (id = public.current_tenant_id());

-- ---------- profiles (read-only for users) ----------
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_select on public.profiles for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));

-- ---------- members ----------
create policy members_staff_select on public.members for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy members_self_select on public.members for select to authenticated
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());
create policy members_staff_update on public.members for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'))
  with check (tenant_id = public.current_tenant_id());

-- ---------- transactions ----------
create policy transactions_staff_select on public.transactions for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy transactions_self_select on public.transactions for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));
-- A member may only create a PENDING ONLINE transaction for themselves.
-- It becomes 'success' only through the signed webhook (service role).
create policy transactions_member_insert_pending on public.transactions for insert to authenticated
  with check (tenant_id = public.current_tenant_id()
              and channel = 'online' and status = 'pending'
              and member_id in (select id from public.members where user_id = auth.uid() and status = 'active'));

-- ---------- passbook (read-only; written by append_passbook_entry) ----------
create policy passbook_staff_select on public.passbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy passbook_self_select on public.passbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

-- ---------- loans & repayments (read-only; written by loan functions) ----------
create policy loans_staff_select on public.loans for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy loans_self_select on public.loans for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

create policy repayments_staff_select on public.loan_repayments for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy repayments_self_select on public.loan_repayments for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and loan_id in (select l.id from public.loans l
                          join public.members m on m.id = l.member_id where m.user_id = auth.uid()));

-- ---------- audit logs: admin read-only ----------
create policy audit_admin_select on public.audit_logs for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() = 'admin');
-- =====================================================================
-- 004  STORAGE: private "receipts" bucket, one folder per tenant (<tenant_id>/<file>)
-- Free-plan friendly: 2 MB cap per file, images only (the app compresses before upload).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types,
                               public = false;

drop policy if exists receipts_staff_insert on storage.objects;
drop policy if exists receipts_select on storage.objects;

-- Staff may upload only into their own tenant's folder
create policy receipts_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] = public.current_tenant_id()::text
              and public.current_role_name() in ('admin','bookkeeper'));

-- Staff read their tenant's receipts; a member reads a receipt only if it belongs to one of
-- their own transactions (the sub-select is itself filtered by RLS on public.transactions).
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] = public.current_tenant_id()::text
         and (public.current_role_name() in ('admin','bookkeeper')
              or exists (select 1 from public.transactions t where t.receipt_url = storage.objects.name)));
-- =====================================================================
-- 005  PLATFORM OWNER (super admin): cooperative suspension, visit analytics,
--      platform-wide statistics. Run AFTER migrations 1 to 4.
-- The platform owner is NOT a member of any tenant. Platform data is read only by the
-- server (service role) after the caller is verified as a platform admin.
-- =====================================================================

-- ---------- tenant status (suspend / reactivate a cooperative) ----------
alter table public.tenants
  add column if not exists status text not null default 'active' check (status in ('active','suspended')),
  add column if not exists suspended_at timestamptz;

-- A suspended cooperative loses ALL database access at once: current_tenant_id() returns NULL,
-- so every RLS policy (tenant_id = current_tenant_id()) evaluates to false.
create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select t.id
    from public.tenants t
   where t.status = 'active'
     and t.id = coalesce(
           nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
           (select p.tenant_id from public.profiles p where p.id = auth.uid()))
$$;

-- ---------- who is a platform admin ----------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;     -- no policies: service role only
revoke all on public.platform_admins from anon, authenticated;

-- ---------- privacy-friendly visit log (no cookies, no raw IP addresses) ----------
-- visitor_hash = SHA-256(daily salt + IP + user-agent), so it cannot be reversed or followed across days.
create table if not exists public.site_visits (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  path         text not null,
  tenant_slug  text,
  visitor_hash text not null,
  device       text not null default 'desktop' check (device in ('mobile','desktop','tablet'))
);
create index if not exists site_visits_created_idx on public.site_visits(created_at desc);
create index if not exists site_visits_hash_idx on public.site_visits(created_at, visitor_hash);
alter table public.site_visits enable row level security;           -- no policies: service role only
revoke all on public.site_visits from anon, authenticated;

-- Housekeeping for the free storage quota. Run occasionally, e.g.  select public.purge_old_visits(180);
create or replace function public.purge_old_visits(p_days int default 180) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from public.site_visits where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- platform-wide numbers ----------
create or replace function public.platform_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'coops_total',      (select count(*) from public.tenants),
    'coops_active',     (select count(*) from public.tenants where status = 'active'),
    'coops_suspended',  (select count(*) from public.tenants where status = 'suspended'),
    'coops_no_payout',  (select count(*) from public.tenants where paystack_subaccount_code is null),
    'coops_no_members', (select count(*) from public.tenants t where not exists (select 1 from public.members m where m.tenant_id = t.id)),
    'members_total',    (select count(*) from public.members),
    'members_active',   (select count(*) from public.members where status = 'active'),
    'members_pending',  (select count(*) from public.members where status = 'pending'),
    'members_unclaimed',(select count(*) from public.members where status = 'unclaimed'),
    'staff_accounts',   (select count(*) from public.profiles where role in ('admin','bookkeeper')),
    'total_transacted', (select coalesce(sum(amount), 0) from public.transactions where status = 'success'),
    'txn_count',        (select count(*) from public.transactions where status = 'success'),
    'online_total',     (select coalesce(sum(amount), 0) from public.transactions where status = 'success' and channel = 'online'),
    'manual_total',     (select coalesce(sum(amount), 0) from public.transactions where status = 'success' and channel in ('cash','transfer')),
    'month_transacted', (select coalesce(sum(amount), 0) from public.transactions where status = 'success' and coalesce(paid_at, created_at) >= date_trunc('month', now())),
    'today_transacted', (select coalesce(sum(amount), 0) from public.transactions where status = 'success' and coalesce(paid_at, created_at) >= date_trunc('day', now())),
    'failed_7d',        (select count(*) from public.transactions where status = 'failed' and created_at > now() - interval '7 days'),
    'stale_pending',    (select count(*) from public.transactions where status = 'pending' and channel = 'online' and created_at < now() - interval '1 day'),
    'total_savings',    (select coalesce(sum(case when entry_type in ('opening','contribution') then amount
                                                  when entry_type = 'withdrawal' then -amount else 0 end), 0) from public.passbook_entries),
    'loans_active',     (select count(*) from public.loans where status = 'active'),
    'loans_outstanding',(select coalesce(sum(total_repayable - amount_repaid), 0) from public.loans where status in ('approved','active')),
    'webhook_events',   (select count(*) from public.webhook_events),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
                  'month', to_char(m, 'Mon YY'),
                  'transacted', coalesce((select sum(amount) from public.transactions
                                           where status = 'success' and date_trunc('month', coalesce(paid_at, created_at)) = m), 0),
                  'new_coops',   (select count(*) from public.tenants where date_trunc('month', created_at) = m),
                  'new_members', (select count(*) from public.members where date_trunc('month', created_at) = m)
                ) order by m), '[]'::jsonb)
                from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m),
    'top_coops', (select coalesce(jsonb_agg(to_jsonb(q) order by q.total desc), '[]'::jsonb)
                    from (select t.id, t.name, t.slug, coalesce(sum(tr.amount), 0) as total, count(tr.id) as txns
                            from public.tenants t
                            left join public.transactions tr on tr.tenant_id = t.id and tr.status = 'success'
                           group by t.id order by total desc limit 5) q)
  )
$$;

-- ---------- one row per cooperative ----------
create or replace function public.platform_cooperatives() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  from (
    select t.id, t.name, t.slug, t.status, t.created_at, t.bank_name,
           (t.paystack_subaccount_code is not null) as payout_set,
           (select count(*) from public.members m where m.tenant_id = t.id) as members_total,
           (select count(*) from public.members m where m.tenant_id = t.id and m.status = 'active') as members_active,
           (select coalesce(sum(case when pb.entry_type in ('opening','contribution') then pb.amount
                                     when pb.entry_type = 'withdrawal' then -pb.amount else 0 end), 0)
              from public.passbook_entries pb where pb.tenant_id = t.id) as total_savings,
           (select coalesce(sum(tr.amount), 0) from public.transactions tr where tr.tenant_id = t.id and tr.status = 'success') as total_transacted,
           (select max(tr.paid_at) from public.transactions tr where tr.tenant_id = t.id and tr.status = 'success') as last_payment_at,
           (select pf.full_name from public.profiles pf where pf.tenant_id = t.id and pf.role = 'admin' order by pf.created_at limit 1) as admin_name
      from public.tenants t
  ) q
$$;

-- ---------- visit analytics ----------
create or replace function public.visit_stats(p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with params as (select greatest(1, least(coalesce(p_days, 30), 365)) as n),
  days as (select generate_series(current_date - ((select n from params) - 1), current_date, interval '1 day')::date as d),
  v as (select * from public.site_visits where created_at >= current_date - ((select n from params) - 1))
  select jsonb_build_object(
    'views',        (select count(*) from v),
    'views_today',  (select count(*) from public.site_visits where created_at >= current_date),
    'unique_today', (select count(distinct visitor_hash) from public.site_visits where created_at >= current_date),
    'visitor_days', (select count(*) from (select distinct created_at::date as d, visitor_hash from v) q),
    'daily', (select jsonb_agg(jsonb_build_object(
                'date', to_char(d, 'DD Mon'),
                'views',   (select count(*) from v where v.created_at::date = days.d),
                'uniques', (select count(distinct v.visitor_hash) from v where v.created_at::date = days.d)) order by d)
                from days),
    'top_pages',  (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                     from (select path, count(*) as views from v group by path order by views desc limit 10) p),
    'devices',    (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                     from (select device, count(*) as views from v group by device order by views desc) p),
    'coop_pages', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                     from (select tenant_slug, count(*) as views from v where tenant_slug is not null group by tenant_slug order by views desc limit 10) p)
  )
$$;

-- ---------- only the service role (server) may run these ----------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('platform_stats','platform_cooperatives','visit_stats','purge_old_visits')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
-- =====================================================================
-- 006  PLATFORM REVENUE: record the platform fee and Paystack's processing fee on every payment.
-- Run AFTER migrations 1 to 5.  Payments made before this migration show a fee of 0 (nothing was recorded).
-- =====================================================================

alter table public.transactions
  add column if not exists platform_fee numeric(14,2) not null default 0 check (platform_fee >= 0),   -- the platform's cut sent to Paystack as transaction_charge
  add column if not exists paystack_fee numeric(14,2) not null default 0 check (paystack_fee >= 0),   -- Paystack's processing fee, taken from the webhook
  add column if not exists fee_bearer   text check (fee_bearer in ('account','subaccount'));          -- who pays Paystack's fee: the platform or the cooperative

-- Members may only create a pending online transaction. They must NOT be able to write fee columns
-- (that would let them distort revenue), so INSERT is now granted per column.
revoke insert on public.transactions from authenticated;
grant insert (tenant_id, member_id, reference, amount, channel, status) on public.transactions to authenticated;

-- ---------- reconciliation now also records Paystack's fee ----------
create or replace function public.process_successful_payment(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  inserted int;
  fees_raw text := p_payload -> 'data' ->> 'fees';
  ps_fee numeric(14,2) := 0;
begin
  insert into public.webhook_events(reference, event_type, payload)
  values (p_reference, 'charge.success', p_payload)
  on conflict (reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  select * into t from public.transactions where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if t.status <> 'pending' then return 'not_pending'; end if;

  if t.amount <> p_amount or upper(coalesce(p_currency,'')) <> 'NGN' then
    update public.transactions set status = 'failed', note = 'Amount/currency mismatch' where id = t.id;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.mismatch', jsonb_build_object('reference', p_reference, 'expected', t.amount, 'received', p_amount));
    return 'mismatch';
  end if;

  -- Paystack reports fees in kobo
  if fees_raw ~ '^[0-9]+(\.[0-9]+)?$' then ps_fee := round(fees_raw::numeric / 100, 2); end if;

  update public.transactions set status = 'success', paid_at = now(), paystack_fee = ps_fee where id = t.id;
  perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Online payment');
  insert into public.audit_logs(tenant_id, action, details)
  values (t.tenant_id, 'payment.reconciled', jsonb_build_object('reference', p_reference, 'amount', t.amount));
  return 'credited';
end $$;

-- ---------- per-cooperative list now includes fees earned from each cooperative ----------
create or replace function public.platform_cooperatives() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  from (
    select t.id, t.name, t.slug, t.status, t.created_at, t.bank_name,
           (t.paystack_subaccount_code is not null) as payout_set,
           (select count(*) from public.members m where m.tenant_id = t.id) as members_total,
           (select count(*) from public.members m where m.tenant_id = t.id and m.status = 'active') as members_active,
           (select coalesce(sum(case when pb.entry_type in ('opening','contribution') then pb.amount
                                     when pb.entry_type = 'withdrawal' then -pb.amount else 0 end), 0)
              from public.passbook_entries pb where pb.tenant_id = t.id) as total_savings,
           (select coalesce(sum(tr.amount), 0) from public.transactions tr where tr.tenant_id = t.id and tr.status = 'success') as total_transacted,
           (select coalesce(sum(tr.platform_fee), 0) from public.transactions tr where tr.tenant_id = t.id and tr.status = 'success') as fees_earned,
           (select max(tr.paid_at) from public.transactions tr where tr.tenant_id = t.id and tr.status = 'success') as last_payment_at,
           (select pf.full_name from public.profiles pf where pf.tenant_id = t.id and pf.role = 'admin' order by pf.created_at limit 1) as admin_name
      from public.tenants t
  ) q
$$;

-- ---------- revenue numbers ----------
-- gross = platform_fee. borne = Paystack's fee ONLY when the platform is the fee bearer ('account').
-- net revenue = gross - borne.
create or replace function public.revenue_stats(p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with params as (select greatest(1, least(coalesce(p_days, 30), 365)) as n),
  t as (
    select tr.id, tr.tenant_id, tr.amount, tr.channel,
           tr.platform_fee as gross,
           case when tr.fee_bearer = 'account' then tr.paystack_fee else 0 end as borne,
           coalesce(tr.paid_at, tr.created_at) as ts
      from public.transactions tr where tr.status = 'success'
  ),
  days as (select generate_series(current_date - ((select n from params) - 1), current_date, interval '1 day')::date as d)
  select jsonb_build_object(
    'all_gross',         (select coalesce(sum(gross), 0) from t),
    'all_borne',         (select coalesce(sum(borne), 0) from t),
    'all_net',           (select coalesce(sum(gross - borne), 0) from t),
    'all_online_volume', (select coalesce(sum(amount), 0) from t where channel = 'online'),
    'all_online_count',  (select count(*) from t where channel = 'online'),
    'fee_free_volume',   (select coalesce(sum(amount), 0) from t where channel in ('cash','transfer')),
    'month_gross',       (select coalesce(sum(gross), 0) from t where ts >= date_trunc('month', now())),
    'month_net',         (select coalesce(sum(gross - borne), 0) from t where ts >= date_trunc('month', now())),
    'today_gross',       (select coalesce(sum(gross), 0) from t where ts >= date_trunc('day', now())),
    'today_net',         (select coalesce(sum(gross - borne), 0) from t where ts >= date_trunc('day', now())),
    'range_gross',       (select coalesce(sum(gross), 0) from t where ts >= current_date - ((select n from params) - 1)),
    'range_borne',       (select coalesce(sum(borne), 0) from t where ts >= current_date - ((select n from params) - 1)),
    'range_net',         (select coalesce(sum(gross - borne), 0) from t where ts >= current_date - ((select n from params) - 1)),
    'range_online_volume',(select coalesce(sum(amount), 0) from t where channel = 'online' and ts >= current_date - ((select n from params) - 1)),
    'range_payments',    (select count(*) from t where channel = 'online' and ts >= current_date - ((select n from params) - 1)),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
                  'month', to_char(m, 'Mon YY'),
                  'online_volume', coalesce((select sum(amount) from t where channel = 'online' and date_trunc('month', ts) = m), 0),
                  'payments',      (select count(*) from t where channel = 'online' and date_trunc('month', ts) = m),
                  'gross',         coalesce((select sum(gross) from t where date_trunc('month', ts) = m), 0),
                  'borne',         coalesce((select sum(borne) from t where date_trunc('month', ts) = m), 0),
                  'net',           coalesce((select sum(gross - borne) from t where date_trunc('month', ts) = m), 0)
                ) order by m), '[]'::jsonb)
                from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m),
    'daily', (select jsonb_agg(jsonb_build_object(
                  'date', to_char(d, 'DD Mon'),
                  'gross', coalesce((select sum(gross) from t where ts::date = days.d), 0),
                  'net',   coalesce((select sum(gross - borne) from t where ts::date = days.d), 0)) order by d)
                from days),
    'by_coop', (select coalesce(jsonb_agg(to_jsonb(q) order by q.net desc), '[]'::jsonb)
                  from (select tn.id, tn.name, tn.slug,
                               count(t.id) filter (where t.channel = 'online') as payments,
                               coalesce(sum(t.amount) filter (where t.channel = 'online'), 0) as online_volume,
                               coalesce(sum(t.gross), 0) as gross,
                               coalesce(sum(t.borne), 0) as borne,
                               coalesce(sum(t.gross - t.borne), 0) as net
                          from public.tenants tn
                          left join t on t.tenant_id = tn.id and t.ts >= current_date - ((select n from params) - 1)
                         group by tn.id order by net desc limit 100) q)
  )
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('revenue_stats')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
-- =====================================================================
-- 007  ONLINE LOAN REPAYMENT + COOPERATIVE STATEMENT DATA
-- Run AFTER migrations 1 to 6.
-- A loan repayment is a normal Paystack payment: it settles to the SAME cooperative sub-account
-- (the bank account saved in Settings) and is credited by the SAME signed, idempotent webhook.
-- =====================================================================

alter table public.transactions
  add column if not exists purpose text not null default 'contribution' check (purpose in ('contribution','loan_repayment')),
  add column if not exists loan_id uuid references public.loans(id) on delete set null;

alter table public.loan_repayments
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null;   -- set for online repayments

create index if not exists transactions_loan_idx on public.transactions(loan_id) where loan_id is not null;

-- A member may start a PENDING ONLINE payment for themselves: either a contribution, or a repayment of
-- one of THEIR OWN ACTIVE loans. Fee columns remain unwritable by members (column-level grant).
drop policy if exists transactions_member_insert_pending on public.transactions;
create policy transactions_member_insert_pending on public.transactions for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and channel = 'online' and status = 'pending'
    and member_id in (select id from public.members where user_id = auth.uid() and status = 'active')
    and (
      (purpose = 'contribution' and loan_id is null)
      or (purpose = 'loan_repayment' and loan_id in (
            select l.id from public.loans l join public.members m on m.id = l.member_id
             where m.user_id = auth.uid() and l.status = 'active'))
    )
  );

revoke insert on public.transactions from authenticated;
grant insert (tenant_id, member_id, reference, amount, channel, status, purpose, loan_id) on public.transactions to authenticated;

-- ---------- reconciliation: contributions AND loan repayments ----------
create or replace function public.process_successful_payment(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  l public.loans%rowtype;
  inserted int;
  fees_raw text := p_payload -> 'data' ->> 'fees';
  ps_fee numeric(14,2) := 0;
  remaining numeric(14,2);
  applied numeric(14,2);
  extra numeric(14,2);
begin
  insert into public.webhook_events(reference, event_type, payload)
  values (p_reference, 'charge.success', p_payload)
  on conflict (reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  select * into t from public.transactions where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if t.status <> 'pending' then return 'not_pending'; end if;

  if t.amount <> p_amount or upper(coalesce(p_currency,'')) <> 'NGN' then
    update public.transactions set status = 'failed', note = 'Amount/currency mismatch' where id = t.id;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.mismatch', jsonb_build_object('reference', p_reference, 'expected', t.amount, 'received', p_amount));
    return 'mismatch';
  end if;

  if fees_raw ~ '^[0-9]+(\.[0-9]+)?$' then ps_fee := round(fees_raw::numeric / 100, 2); end if;
  update public.transactions set status = 'success', paid_at = now(), paystack_fee = ps_fee where id = t.id;

  if t.purpose = 'loan_repayment' and t.loan_id is not null then
    select * into l from public.loans where id = t.loan_id and tenant_id = t.tenant_id for update;
    if found and l.status = 'active' then
      remaining := l.total_repayable - l.amount_repaid;
      applied := least(t.amount, remaining);
      extra := t.amount - applied;
      if applied > 0 then
        insert into public.loan_repayments(tenant_id, loan_id, amount, transaction_id, paid_at)
        values (t.tenant_id, l.id, applied, t.id, now());
        update public.loans
           set amount_repaid = amount_repaid + applied,
               status = case when amount_repaid + applied >= total_repayable then 'repaid' else 'active' end
         where id = l.id;
        perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'repayment', applied, now(), 'Loan repayment (online)');
      end if;
      -- Money has already been paid, so anything above the balance still owed is never lost: it goes to savings.
      if extra > 0 then
        perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', extra, now(), 'Overpayment credited to savings');
      end if;
    else
      perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Payment credited to savings (loan not active)');
    end if;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'loan.repayment_online', jsonb_build_object('reference', p_reference, 'amount', t.amount, 'loan_id', t.loan_id));
  else
    perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Online payment');
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.reconciled', jsonb_build_object('reference', p_reference, 'amount', t.amount));
  end if;
  return 'credited';
end $$;

-- ---------- data for the cooperative PDF statement (admin / bookkeeper of ONE cooperative) ----------
-- SECURITY INVOKER: row-level security limits every row to the caller's own cooperative.
create or replace function public.cooperative_statement(p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  tid uuid := public.current_tenant_id();
  res jsonb;
begin
  if tid is null or public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;
  if p_to - p_from > 800 then raise exception 'The period is too long (maximum about two years)'; end if;

  res := (
    with pay as (
      select coalesce(tr.paid_at, tr.created_at) as ts, m.member_no, m.full_name, tr.purpose, tr.channel, tr.amount, tr.reference
        from public.transactions tr join public.members m on m.id = tr.member_id
       where tr.status = 'success'
         and coalesce(tr.paid_at, tr.created_at) >= p_from and coalesce(tr.paid_at, tr.created_at) < p_to + 1
      union all
      select rp.paid_at, m.member_no, m.full_name, 'loan_repayment', 'recorded', rp.amount, 'REPAY-' || upper(substr(rp.id::text, 1, 8))
        from public.loan_repayments rp
        join public.loans l on l.id = rp.loan_id
        join public.members m on m.id = l.member_id
       where rp.transaction_id is null and rp.paid_at >= p_from and rp.paid_at < p_to + 1
    ),
    bal as (select distinct on (member_id) member_id, running_balance from public.passbook_entries order by member_id, seq desc),
    owed as (select member_id, sum(total_repayable - amount_repaid) as outstanding from public.loans where status in ('approved','active') group by member_id)
    select jsonb_build_object(
      'coop',   (select jsonb_build_object('name', name, 'slug', slug) from public.tenants where id = tid),
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'summary', jsonb_build_object(
        'members_total',     (select count(*) from public.members),
        'members_active',    (select count(*) from public.members where status = 'active'),
        'total_savings',     (select coalesce(sum(running_balance), 0) from bal),
        'loans_active',      (select count(*) from public.loans where status = 'active'),
        'loans_outstanding', (select coalesce(sum(outstanding), 0) from owed),
        'collected',         (select coalesce(sum(amount), 0) from pay),
        'payments_count',    (select count(*) from pay),
        'online',            (select coalesce(sum(amount), 0) from pay where channel = 'online'),
        'cash',              (select coalesce(sum(amount), 0) from pay where channel = 'cash'),
        'transfer',          (select coalesce(sum(amount), 0) from pay where channel = 'transfer'),
        'recorded',          (select coalesce(sum(amount), 0) from pay where channel = 'recorded'),
        'contributions',     (select coalesce(sum(amount), 0) from pay where purpose = 'contribution'),
        'repayments',        (select coalesce(sum(amount), 0) from pay where purpose = 'loan_repayment')
      ),
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'member_no', m.member_no, 'full_name', m.full_name, 'status', m.status,
                    'savings', coalesce(b.running_balance, 0), 'outstanding', coalesce(o.outstanding, 0)) order by m.member_no), '[]'::jsonb)
                   from public.members m left join bal b on b.member_id = m.id left join owed o on o.member_id = m.id),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', ts, 'member_no', member_no, 'member', full_name, 'purpose', purpose,
                    'channel', channel, 'amount', amount, 'reference', reference) order by ts), '[]'::jsonb) from pay)
    )
  );
  return res;
end $$;

revoke all on function public.cooperative_statement(date, date) from public, anon;
grant execute on function public.cooperative_statement(date, date) to authenticated, service_role;
-- =====================================================================
-- 008  RECONCILIATION ENGINE (Chapter 3, Sections 3.8.2 and 3.8.4)
-- Run AFTER migrations 1 to 7.
-- Every online payment gets a reconciliation record. The webhook function now
--   * detects the six fault classes (partial payment, duplicate webhook, delayed settlement,
--     failed leg, rounding difference, out-of-order notification),
--   * records the decision, its status and its times,
--   * tracks settlement of the cooperative's share,
--   * leaves officers an exception list with a recorded resolution.
-- Settlement notices and held (early) events are stored in webhook_events:
--   event_type 'settlement' (reference 'settle:<ref>'), 'held' (reference 'held:<ref>').
-- ASSUMPTION TO CONFIRM IN PAYSTACK TEST MODE: the cooperative's share in a payment
-- confirmation is read from data.fees_split.subaccount (in kobo). If it is absent, the split
-- check is skipped for that payment.
-- =====================================================================

create table public.reconciliation_results (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  transaction_id  uuid not null unique references public.transactions(id) on delete cascade,
  expected_amount numeric(14,2) not null,
  expected_share  numeric(14,2),
  received_amount numeric(14,2),
  received_share  numeric(14,2),
  status          text not null check (status in ('AUTO_MATCHED','AUTO_RESOLVED','AWAITING_SETTLEMENT','NEEDS_REVIEW','RESOLVED_MANUALLY','UNRESOLVED')),
  flagged_mismatch boolean not null default false,
  detected_fault  text check (detected_fault in ('partial_payment','duplicate_webhook','delayed_settlement','failed_leg','rounding_diff','out_of_order')),
  received_at     timestamptz not null default now(),
  reconciled_at   timestamptz,
  resolution_note text,
  resolved_by     uuid references auth.users(id) on delete set null
);
create index on public.reconciliation_results(tenant_id, status);
create index on public.reconciliation_results(tenant_id, received_at desc);

alter table public.reconciliation_results enable row level security;
revoke all on public.reconciliation_results from anon, authenticated;
grant select on public.reconciliation_results to authenticated;
create policy recon_staff_select on public.reconciliation_results for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));

-- ---------- credit logic (moved out of the webhook function so officers can reuse it) ----------
create or replace function public.apply_payment_credit(t public.transactions) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.loans%rowtype;
  remaining numeric(14,2);
  applied numeric(14,2);
  extra numeric(14,2);
begin
  if t.purpose = 'loan_repayment' and t.loan_id is not null then
    select * into l from public.loans where id = t.loan_id and tenant_id = t.tenant_id for update;
    if found and l.status = 'active' then
      remaining := l.total_repayable - l.amount_repaid;
      applied := least(t.amount, remaining);
      extra := t.amount - applied;
      if applied > 0 then
        insert into public.loan_repayments(tenant_id, loan_id, amount, transaction_id, paid_at)
        values (t.tenant_id, l.id, applied, t.id, now());
        update public.loans
           set amount_repaid = amount_repaid + applied,
               status = case when amount_repaid + applied >= total_repayable then 'repaid' else 'active' end
         where id = l.id;
        perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'repayment', applied, now(), 'Loan repayment (online)');
      end if;
      if extra > 0 then
        perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', extra, now(), 'Overpayment credited to savings');
      end if;
    else
      perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Payment credited to savings (loan not active)');
    end if;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'loan.repayment_online', jsonb_build_object('reference', t.reference, 'amount', t.amount, 'loan_id', t.loan_id));
  else
    perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Online payment');
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.reconciled', jsonb_build_object('reference', t.reference, 'amount', t.amount));
  end if;
end $$;

-- ---------- settlement: compare the gateway's settlement report with the confirmed payment ----------
create or replace function public.apply_settlement(p_reference text, p_tolerance numeric default 0.01) returns text
language plpgsql security definer set search_path = public as $$
declare
  rr public.reconciliation_results%rowtype;
  ev jsonb;
  shr numeric;
  leg_ok boolean;
begin
  select r.* into rr
    from public.reconciliation_results r join public.transactions t on t.id = r.transaction_id
   where t.reference = p_reference for update of r;
  select payload into ev from public.webhook_events where reference = 'settle:' || p_reference and event_type = 'settlement';
  if ev is null or rr.id is null then return 'held'; end if;
  if rr.status <> 'AWAITING_SETTLEMENT' then return 'ignored'; end if;

  shr := (ev ->> 'share')::numeric;
  leg_ok := coalesce((ev ->> 'leg_ok')::boolean, true);
  if not leg_ok or (shr is not null and rr.expected_share is not null and abs(shr - rr.expected_share) > p_tolerance) then
    update public.reconciliation_results
       set received_share = shr, flagged_mismatch = true, detected_fault = 'failed_leg', status = 'NEEDS_REVIEW'
     where id = rr.id;
    return 'needs_review';
  end if;
  update public.reconciliation_results
     set received_share = coalesce(received_share, shr),
         status = case when flagged_mismatch then 'AUTO_RESOLVED' else 'AUTO_MATCHED' end,
         reconciled_at = now()
   where id = rr.id;
  return 'settled';
end $$;

-- ---------- the reconciliation function (Algorithm 3.2) ----------
create or replace function public.process_payment_event(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb,
  p_retry boolean default false, p_tolerance numeric default 0.01
) returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  inserted int;
  fees_raw text := p_payload -> 'data' ->> 'fees';
  share_raw text := p_payload -> 'data' -> 'fees_split' ->> 'subaccount';
  ps_fee numeric(14,2) := 0;
  recv_share numeric(14,2);
  exp_share numeric(14,2);
  d numeric := 0;
  fault text := null;
  st text := null;
begin
  -- 1. idempotency: a repeated event hits the unique key
  insert into public.webhook_events(reference, event_type, payload)
  values (p_reference, 'charge.success', p_payload)
  on conflict (reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    update public.reconciliation_results rr
       set flagged_mismatch = true,
           detected_fault = coalesce(rr.detected_fault, 'duplicate_webhook'),
           status = case when rr.status = 'AUTO_MATCHED' then 'AUTO_RESOLVED' else rr.status end
     where rr.transaction_id = (select id from public.transactions where reference = p_reference);
    return 'duplicate';
  end if;

  -- 2. lock the pending transaction; if it is not visible yet, HOLD the event (out-of-order)
  select * into t from public.transactions where reference = p_reference for update;
  if not found then
    delete from public.webhook_events where reference = p_reference and event_type = 'charge.success';
    insert into public.webhook_events(reference, event_type, payload)
    values ('held:' || p_reference, 'held', p_payload)
    on conflict (reference) do nothing;
    return 'held';
  end if;
  if t.status <> 'pending' then return 'not_pending'; end if;

  -- 3. values reported by the gateway (kobo -> naira) and the expected cooperative share
  if fees_raw ~ '^[0-9]+(\.[0-9]+)?$' then ps_fee := round(fees_raw::numeric / 100, 2); end if;
  if share_raw ~ '^[0-9]+(\.[0-9]+)?$' then recv_share := round(share_raw::numeric / 100, 2); end if;
  if t.fee_bearer is not null then
    exp_share := t.amount - t.platform_fee - case when t.fee_bearer = 'subaccount' then ps_fee else 0 end;
  end if;

  -- 4. amount and currency: on failure NOTHING is credited and an officer decides
  if upper(coalesce(p_currency, '')) <> 'NGN' or p_amount <> t.amount then
    if upper(coalesce(p_currency, '')) = 'NGN' and p_amount < t.amount then fault := 'partial_payment'; end if;
    insert into public.reconciliation_results(tenant_id, transaction_id, expected_amount, expected_share,
                                              received_amount, received_share, status, flagged_mismatch, detected_fault)
    values (t.tenant_id, t.id, t.amount, exp_share, p_amount, recv_share, 'NEEDS_REVIEW', true, fault)
    on conflict (transaction_id) do update
       set received_amount = excluded.received_amount, received_share = excluded.received_share,
           status = 'NEEDS_REVIEW', flagged_mismatch = true, detected_fault = excluded.detected_fault;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.mismatch', jsonb_build_object('reference', p_reference, 'expected', t.amount, 'received', p_amount));
    return 'needs_review';
  end if;

  -- 5. split check on the cooperative's share
  if p_retry then fault := 'out_of_order'; end if;
  if recv_share is not null and exp_share is not null then
    d := abs(recv_share - exp_share);
    if d > p_tolerance then
      fault := 'failed_leg'; st := 'NEEDS_REVIEW';
    elsif d > 0 then
      fault := 'rounding_diff'; st := 'AUTO_RESOLVED';
    end if;
  end if;

  -- 6. the member is credited when the payment is CONFIRMED (not when it is settled)
  update public.transactions set status = 'success', paid_at = now(), paystack_fee = ps_fee where id = t.id;
  perform public.apply_payment_credit(t);

  -- 7. final status and the reconciliation record
  if st is null then
    if t.fee_bearer is null then st := 'AUTO_MATCHED'; else st := 'AWAITING_SETTLEMENT'; end if;
  end if;
  insert into public.reconciliation_results(tenant_id, transaction_id, expected_amount, expected_share,
                                            received_amount, received_share, status, flagged_mismatch, detected_fault, reconciled_at)
  values (t.tenant_id, t.id, t.amount, exp_share, p_amount, recv_share, st, fault is not null, fault,
          case when st in ('AUTO_MATCHED', 'AUTO_RESOLVED') then now() else null end)
  on conflict (transaction_id) do update
     set received_amount = excluded.received_amount, received_share = excluded.received_share, status = excluded.status,
         flagged_mismatch = excluded.flagged_mismatch, detected_fault = excluded.detected_fault, reconciled_at = excluded.reconciled_at;

  -- 8. a settlement notice may already have arrived
  if st = 'AWAITING_SETTLEMENT' then perform public.apply_settlement(p_reference, p_tolerance); end if;
  return 'credited';
end $$;

-- the name the webhook route and the verify fallback already call
create or replace function public.process_successful_payment(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = public as $$
begin
  return public.process_payment_event(p_reference, p_amount, p_currency, p_payload, false, 0.01);
end $$;

-- ---------- settlement report from the gateway (real job or simulated gateway) ----------
create or replace function public.record_settlement(
  p_reference text, p_share numeric, p_leg_ok boolean, p_tolerance numeric default 0.01
) returns text
language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  insert into public.webhook_events(reference, event_type, payload)
  values ('settle:' || p_reference, 'settlement', jsonb_build_object('share', p_share, 'leg_ok', coalesce(p_leg_ok, true)))
  on conflict (reference) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;
  return public.apply_settlement(p_reference, p_tolerance);
end $$;

-- ---------- a failure notice that arrives after the payment already succeeded ----------
create or replace function public.process_failed_notice(p_reference text) returns text
language plpgsql security definer set search_path = public as $$
declare t public.transactions%rowtype;
begin
  select * into t from public.transactions where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if t.status = 'success' then
    update public.reconciliation_results rr
       set flagged_mismatch = true,
           detected_fault = coalesce(rr.detected_fault, 'out_of_order'),
           status = case when rr.status = 'AUTO_MATCHED' then 'AUTO_RESOLVED' else rr.status end
     where rr.transaction_id = t.id;
    return 'ignored_late_failure';
  end if;
  if t.status = 'pending' then
    update public.transactions set status = 'failed' where id = t.id;
    return 'failed';
  end if;
  return 'not_pending';
end $$;

-- ---------- periodic sweep: retry held events, flag late settlements, report what is stuck ----------
create or replace function public.reconcile_sweep(
  p_settle_window interval default interval '48 hours',
  p_final_window  interval default interval '7 days',
  p_review_window interval default interval '14 days',
  p_tolerance numeric default 0.01
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  retried int := 0;
  delayed int := 0;
  unresolved_settle int := 0;
  unresolved_review int := 0;
  res text;
begin
  for ev in
    select e.id, substr(e.reference, 6) as ref, e.payload
      from public.webhook_events e
     where e.event_type = 'held'
       and exists (select 1 from public.transactions t where t.reference = substr(e.reference, 6))
  loop
    res := public.process_payment_event(ev.ref, (ev.payload -> 'data' ->> 'amount')::numeric / 100,
                                        ev.payload -> 'data' ->> 'currency', ev.payload, true, p_tolerance);
    update public.webhook_events set event_type = 'held_done' where id = ev.id;
    retried := retried + 1;
  end loop;

  update public.reconciliation_results
     set flagged_mismatch = true, detected_fault = coalesce(detected_fault, 'delayed_settlement')
   where status = 'AWAITING_SETTLEMENT' and received_at < now() - p_settle_window and not flagged_mismatch;
  get diagnostics delayed = row_count;

  update public.reconciliation_results
     set status = 'UNRESOLVED', reconciled_at = now()
   where status = 'AWAITING_SETTLEMENT' and received_at < now() - p_final_window;
  get diagnostics unresolved_settle = row_count;

  update public.reconciliation_results
     set status = 'UNRESOLVED', reconciled_at = now()
   where status = 'NEEDS_REVIEW' and received_at < now() - p_review_window;
  get diagnostics unresolved_review = row_count;

  return jsonb_build_object('held_retried', retried, 'delayed_flagged', delayed,
                            'unresolved_settlement', unresolved_settle, 'unresolved_review', unresolved_review);
end $$;

-- ---------- an officer records a decision on an exception ----------
create or replace function public.resolve_reconciliation(p_id uuid, p_action text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare
  rr public.reconciliation_results%rowtype;
  t public.transactions%rowtype;
  tid uuid := public.current_tenant_id();
begin
  if tid is null or public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  if p_action not in ('acknowledge','accept_received','mark_failed') then raise exception 'Unknown action'; end if;
  if p_note is null or char_length(trim(p_note)) < 3 then raise exception 'Write a short note explaining your decision'; end if;

  select * into rr from public.reconciliation_results where id = p_id and tenant_id = tid for update;
  if not found then raise exception 'Record not found'; end if;
  if rr.status not in ('NEEDS_REVIEW','UNRESOLVED') then raise exception 'This record does not need review'; end if;
  select * into t from public.transactions where id = rr.transaction_id for update;

  if p_action = 'accept_received' then
    if t.status <> 'pending' or rr.received_amount is null or rr.received_amount <= 0 then
      raise exception 'There is no received amount to accept for this payment';
    end if;
    update public.transactions set amount = rr.received_amount, status = 'success', paid_at = now() where id = t.id;
    t.amount := rr.received_amount;
    perform public.apply_payment_credit(t);
  elsif p_action = 'mark_failed' then
    if t.status <> 'pending' then raise exception 'Only a pending payment can be marked as failed'; end if;
    update public.transactions set status = 'failed', note = 'Marked failed after review' where id = t.id;
  end if;

  update public.reconciliation_results
     set status = 'RESOLVED_MANUALLY', resolution_note = trim(p_note), resolved_by = auth.uid(), reconciled_at = now()
   where id = rr.id;
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'reconciliation.resolved', jsonb_build_object('record', rr.id, 'action', p_action));
  return 'resolved';
end $$;

-- ---------- summaries ----------
create or replace function public.reconciliation_summary() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.reconciliation_results),
    'by_status', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                    from (select status, count(*) as n from public.reconciliation_results group by status) s),
    'by_fault', (select coalesce(jsonb_object_agg(f.detected_fault, f.n), '{}'::jsonb)
                   from (select detected_fault, count(*) as n from public.reconciliation_results
                          where detected_fault is not null group by detected_fault) f),
    'automation_rate', (select case when count(*) = 0 then null
                                    else round(100.0 * count(*) filter (where status in ('AUTO_MATCHED','AUTO_RESOLVED')) / count(*), 2) end
                          from public.reconciliation_results),
    'needs_attention', (select count(*) from public.reconciliation_results where status in ('NEEDS_REVIEW','UNRESOLVED'))
  )
$$;

create or replace function public.platform_reconciliation_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.reconciliation_results),
    'by_status', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                    from (select status, count(*) as n from public.reconciliation_results group by status) s),
    'needs_attention', (select count(*) from public.reconciliation_results where status in ('NEEDS_REVIEW','UNRESOLVED')),
    'unmatched_events', (select count(*) from public.webhook_events where event_type = 'held')
  )
$$;

-- ---------- integrity invariants I1 to I6 (Chapter 3, Table of integrity invariants) ----------
create or replace function public.integrity_violations() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'I1', (select count(*) from public.transactions t
            where t.channel = 'online' and t.status = 'success'
              and ( (t.purpose = 'contribution'
                       and (select count(*) from public.passbook_entries pe where pe.transaction_id = t.id) <> 1)
                 or (select coalesce(sum(pe.amount), 0) from public.passbook_entries pe where pe.transaction_id = t.id) <> t.amount )),
    'I2', (select count(*) from (select distinct on (member_id) member_id, running_balance
                                   from public.passbook_entries order by member_id, seq desc) lst
             join (select member_id, sum(case when entry_type in ('opening','contribution') then amount
                                              when entry_type = 'withdrawal' then -amount else 0 end) as s
                     from public.passbook_entries group by member_id) calc using (member_id)
            where lst.running_balance <> calc.s),
    'I3', (select count(*) from public.passbook_entries where running_balance < 0),
    'I4', (select count(*) from public.loans l
            where l.amount_repaid <> coalesce((select sum(r.amount) from public.loan_repayments r where r.loan_id = l.id), 0)
              and exists (select 1 from public.loan_repayments r2 where r2.loan_id = l.id)),
    'I5', (select count(*) from (select reference from public.transactions group by reference having count(*) > 1) d),
    'I6', (select (select count(*) from public.transactions t join public.members m on m.id = t.member_id where t.tenant_id <> m.tenant_id)
                + (select count(*) from public.passbook_entries pe join public.members m on m.id = pe.member_id where pe.tenant_id <> m.tenant_id)
                + (select count(*) from public.reconciliation_results rr join public.transactions t on t.id = rr.transaction_id where rr.tenant_id <> t.tenant_id))
  )
$$;

-- ---------- permissions ----------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('apply_payment_credit','apply_settlement','process_payment_event','record_settlement',
                                'process_failed_notice','reconcile_sweep','platform_reconciliation_summary','integrity_violations')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('resolve_reconciliation','reconciliation_summary')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- 009  STAFF ROLES: admin-controlled role changes within one cooperative.
-- Called with the caller's own session so their JWT role and tenant are checked.
-- =====================================================================

create or replace function public.set_staff_role(p_user_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_caller uuid := auth.uid();
  t        public.profiles%rowtype;
  v_admins int;
begin
  if public.current_role_name() <> 'admin' then
    raise exception 'Only an admin can change staff roles.';
  end if;

  if v_tenant is null then
    raise exception 'No active cooperative is associated with this account.';
  end if;

  if p_role not in ('admin', 'bookkeeper', 'member') then
    raise exception 'Invalid role.';
  end if;

  if p_user_id = v_caller then
    raise exception 'You cannot change your own role.';
  end if;

  select * into t from public.profiles where id = p_user_id for update;
  if not found or t.tenant_id <> v_tenant then
    raise exception 'That person is not on your team.';
  end if;

  if t.role = p_role then
    return 'unchanged';
  end if;

  if t.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins
      from public.profiles
     where tenant_id = v_tenant and role = 'admin';
    if v_admins <= 1 then
      raise exception 'A cooperative must keep at least one admin.';
    end if;
  end if;

  if p_role = 'member' and not exists (
    select 1 from public.members m
     where m.user_id = p_user_id and m.tenant_id = v_tenant
  ) then
    raise exception 'That person has no member record. Add them as a member first.';
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (v_tenant, v_caller, 'staff.role_changed',
          jsonb_build_object('user_id', p_user_id, 'from', t.role, 'to', p_role));

  return p_role;
end $$;

revoke all on function public.set_staff_role(uuid, text) from public, anon;
grant execute on function public.set_staff_role(uuid, text) to authenticated;
