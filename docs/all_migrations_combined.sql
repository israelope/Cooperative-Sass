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

-- =====================================================================
-- 010  MONEY SAFETY: harden the reconciliation engine.
-- Run AFTER migrations 1 to 9. Replaces functions from 008; safe to apply
-- to an existing database.
-- =====================================================================

-- A case flagged NEEDS_REVIEW was never credited, so its old event must not
-- keep the idempotency key reserved: a corrected retry has to be able through.
delete from public.webhook_events e
 where e.event_type = 'charge.success'
   and exists (
     select 1 from public.reconciliation_results rr
       join public.transactions t on t.id = rr.transaction_id
      where t.reference = e.reference and rr.status = 'NEEDS_REVIEW'
   );

-- ---------- settlement: never auto-match without a verified share ----------
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

  leg_ok := coalesce((ev ->> 'leg_ok')::boolean, true);
  if ev -> 'share' is null or not leg_ok then
    update public.reconciliation_results
       set flagged_mismatch = true, detected_fault = 'failed_leg', status = 'NEEDS_REVIEW'
     where id = rr.id;
    return 'needs_review';
  end if;

  shr := (ev ->> 'share')::numeric;
  if shr is null or rr.expected_share is null or abs(shr - rr.expected_share) > p_tolerance then
    update public.reconciliation_results
       set received_share = shr, flagged_mismatch = true, detected_fault = 'failed_leg', status = 'NEEDS_REVIEW'
     where id = rr.id;
    return 'needs_review';
  end if;

  update public.reconciliation_results
     set received_share = shr,
         status = case when flagged_mismatch then 'AUTO_RESOLVED' else 'AUTO_MATCHED' end,
         reconciled_at = now()
   where id = rr.id;
  return 'settled';
end $$;

-- ---------- payment event: validate BEFORE reserving the idempotency key ----------
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
  -- 1. Lock the transaction. A success that arrives early is held, not rejected.
  select * into t from public.transactions where reference = p_reference for update;
  if not found then
    insert into public.webhook_events(reference, event_type, payload)
    values ('held:' || p_reference, 'held', p_payload)
    on conflict (reference) do update set payload = excluded.payload;
    return 'held';
  end if;

  -- 2. Reject invalid amounts BEFORE writing the idempotency key. A corrected
  --    retry can then be processed instead of being reported as a duplicate.
  if p_amount is null or p_amount <= 0
     or upper(coalesce(p_currency, '')) <> 'NGN' or p_amount <> t.amount then
    if upper(coalesce(p_currency, '')) = 'NGN' and p_amount is not null and p_amount < t.amount then
      fault := 'partial_payment';
    end if;
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

  -- 3. An already processed transaction is a duplicate delivery.
  if t.status <> 'pending' then
    update public.reconciliation_results
       set flagged_mismatch = true,
           detected_fault = coalesce(detected_fault, 'duplicate_webhook'),
           status = case when status = 'AUTO_MATCHED' then 'AUTO_RESOLVED' else status end
     where transaction_id = t.id;
    return 'duplicate';
  end if;

  -- 4. Idempotency. A retry whose reported amount differs replaces the old
  --    payload so a corrected event is not blocked by the bad one.
  insert into public.webhook_events(reference, event_type, payload)
  values (p_reference, 'charge.success', p_payload)
  on conflict (reference) do update set payload = excluded.payload
    where (webhook_events.payload -> 'data' ->> 'amount')::numeric
          is distinct from (p_payload -> 'data' ->> 'amount')::numeric;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    update public.reconciliation_results
       set flagged_mismatch = true, detected_fault = coalesce(detected_fault, 'duplicate_webhook')
     where transaction_id = t.id;
    return 'duplicate';
  end if;

  -- 5. Values reported by the gateway and the cooperative's expected share.
  if fees_raw ~ '^[0-9]+(\.[0-9]+)?$' then ps_fee := round(fees_raw::numeric / 100, 2); end if;
  if share_raw ~ '^[0-9]+(\.[0-9]+)?$' then recv_share := round(share_raw::numeric / 100, 2); end if;
  if t.fee_bearer is not null then
    exp_share := t.amount - t.platform_fee - case when t.fee_bearer = 'subaccount' then ps_fee else 0 end;
  end if;

  -- 6. Split check.
  if p_retry then fault := 'out_of_order'; end if;
  if recv_share is not null and exp_share is not null then
    d := abs(recv_share - exp_share);
    if d > p_tolerance then
      fault := 'failed_leg'; st := 'NEEDS_REVIEW';
    elsif d > 0 then
      fault := 'rounding_diff'; st := 'AUTO_RESOLVED';
    end if;
  end if;

  -- 7. Credit the member on confirmation, not on settlement.
  update public.transactions set status = 'success', paid_at = now(), paystack_fee = ps_fee where id = t.id;
  perform public.apply_payment_credit(t);

  -- 8. Reconciliation record.
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

  -- 9. A settlement notice may already have arrived.
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

-- ---------- a failed notice must not swallow a held success ----------
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
    if exists (select 1 from public.webhook_events where reference = 'held:' || p_reference and event_type = 'held') then
      insert into public.reconciliation_results(tenant_id, transaction_id, expected_amount, status, flagged_mismatch, detected_fault)
      values (t.tenant_id, t.id, t.amount, 'NEEDS_REVIEW', true, 'out_of_order')
      on conflict (transaction_id) do update
         set status = 'NEEDS_REVIEW', flagged_mismatch = true,
             detected_fault = coalesce(detected_fault, 'out_of_order');
      return 'deferred';
    end if;
    update public.transactions set status = 'failed' where id = t.id;
    return 'failed';
  end if;
  return 'not_pending';
end $$;

-- ---------- sweep: only retire held events that were actually handled ----------
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
    if res in ('credited', 'needs_review') then
      update public.webhook_events set event_type = 'held_done' where id = ev.id;
      retried := retried + 1;
    end if;
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

-- ---------- officer decisions: acknowledging keeps an uncredited case open ----------
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
  elsif p_action = 'acknowledge' and t.status = 'pending' then
    -- A note is not a payment decision. Keep the case open until the payment is resolved.
    update public.reconciliation_results
       set resolution_note = trim(p_note), resolved_by = auth.uid()
     where id = rr.id;
    insert into public.audit_logs(tenant_id, actor_id, action, details)
    values (tid, auth.uid(), 'reconciliation.acknowledged', jsonb_build_object('record', rr.id, 'note', trim(p_note)));
    return 'acknowledged';
  end if;

  update public.reconciliation_results
     set status = 'RESOLVED_MANUALLY', resolution_note = trim(p_note), resolved_by = auth.uid(), reconciled_at = now()
   where id = rr.id;
  insert into public.audit_logs(tenant_id, actor_id, action, details)
  values (tid, auth.uid(), 'reconciliation.resolved', jsonb_build_object('record', rr.id, 'action', p_action));
  return 'resolved';
end $$;

-- ---------- explicit terminal failure from the verify fallback ----------
create or replace function public.mark_transaction_failed(p_reference text) returns text
language plpgsql security definer set search_path = public as $$
declare t public.transactions%rowtype;
begin
  select * into t from public.transactions where reference = p_reference for update;
  if not found then return 'unknown_reference'; end if;
  if t.status <> 'pending' then return t.status; end if;
  update public.transactions set status = 'failed' where id = t.id;
  insert into public.audit_logs(tenant_id, action, details)
  values (t.tenant_id, 'payment.verify_failed', jsonb_build_object('reference', p_reference));
  return 'failed';
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in
                  ('apply_settlement','process_payment_event','process_successful_payment',
                   'process_failed_notice','reconcile_sweep','mark_transaction_failed')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;


-- =====================================================================
-- 011  ROLE AUTHORITY: the profiles row wins over a stale JWT claim.
-- Run AFTER migrations 1 to 10. Safe to apply to an existing database.
-- Supabase cannot refresh a different users JWT server-side, so after a role
-- change the token keeps the old claim until that person signs in again.
-- These helpers are used by every RLS policy and security-definer function.
-- =====================================================================

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select t.id
    from public.tenants t
   where t.status = 'active'
     and t.id = coalesce(
           (select p.tenant_id from public.profiles p where p.id = auth.uid()),
           nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
         )
$$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    'member'
  )
$$;

create or replace function public.set_staff_role(p_user_id uuid, p_role text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_caller uuid := auth.uid();
  t        public.profiles%rowtype;
  v_admins int;
begin
  if public.current_role_name() <> 'admin'
     or not exists (select 1 from public.profiles where id = v_caller and role = 'admin') then
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
  if t.role = p_role then return 'unchanged'; end if;

  if t.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins from public.profiles
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

  
-- 012 notifications  
-- =====================================================================
-- 012  IN-APP NOTIFICATIONS (no email, no SMS, no external service).
-- Members see notices addressed to them; staff see cooperative-wide notices.
-- All writes go through service-role-only helpers so a client cannot forge one.
-- =====================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  audience    text not null check (audience in ('member', 'staff')),
  member_id   uuid references public.members(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null check (char_length(body) between 1 and 1000),
  href        text,
  category    text not null default 'general'
                check (category in ('general', 'payment', 'loan', 'contribution', 'announcement', 'cashbook')),
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, dedupe_key),
  constraint notifications_target check (
    (audience = 'member' and member_id is not null) or
    (audience = 'staff' and member_id is null)
  )
);

create index notifications_member_inbox on public.notifications(tenant_id, member_id, read_at, created_at desc);
create index notifications_staff_inbox on public.notifications(tenant_id, audience, read_at, created_at desc);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
revoke insert, delete, truncate, update on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_member_select on public.notifications for select to authenticated
  using (tenant_id = public.current_tenant_id() and audience = 'member'
         and member_id in (select id from public.members where user_id = auth.uid()));

create policy notifications_staff_select on public.notifications for select to authenticated
  using (tenant_id = public.current_tenant_id() and audience = 'staff'
         and public.current_role_name() in ('admin', 'bookkeeper'));

create policy notifications_member_read on public.notifications for update to authenticated
  using (tenant_id = public.current_tenant_id() and audience = 'member'
         and member_id in (select id from public.members where user_id = auth.uid()))
  with check (tenant_id = public.current_tenant_id() and audience = 'member'
              and member_id in (select id from public.members where user_id = auth.uid()));

create policy notifications_staff_read on public.notifications for update to authenticated
  using (tenant_id = public.current_tenant_id() and audience = 'staff'
         and public.current_role_name() in ('admin', 'bookkeeper'))
  with check (tenant_id = public.current_tenant_id() and audience = 'staff'
              and public.current_role_name() in ('admin', 'bookkeeper'));

-- The single writer. Duplicate keys are ignored, which makes webhook retries
-- and daily cron runs safe to repeat.
create or replace function public.create_notification(
  p_tenant uuid, p_audience text, p_title text, p_body text,
  p_href text default null, p_category text default 'general',
  p_member uuid default null, p_dedupe_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_audience not in ('member', 'staff') then raise exception 'Invalid notification audience'; end if;
  if p_audience = 'member' and p_member is null then raise exception 'A member notice needs a member'; end if;
  if p_audience = 'staff' and p_member is not null then raise exception 'A staff notice cannot target a member'; end if;

  insert into public.notifications(tenant_id, audience, member_id, title, body, href, category, dedupe_key)
  values (p_tenant, p_audience, p_member, left(p_title, 160), left(p_body, 1000),
          p_href, p_category, p_dedupe_key)
  on conflict (tenant_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Called by the Paystack webhook after reconciliation, and by the manual-payment action.
create or replace function public.notify_payment(p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.transactions%rowtype; m public.members%rowtype;
begin
  select * into t from public.transactions where reference = p_reference;
  if not found or t.status <> 'success' then return; end if;
  select * into m from public.members where id = t.member_id;
  if not found then return; end if;

  perform public.create_notification(
    t.tenant_id, 'member',
    case when t.purpose = 'loan_repayment' then 'Loan repayment received' else 'Contribution received' end,
    '₦' || trim(to_char(t.amount, '999,999,999,999.00')) || ' has been added to your account. Thank you.',
    case when t.purpose = 'loan_repayment' then '/member/loans' else '/member/passbook' end,
    'payment', m.id, 'payment:' || p_reference || ':member');

  perform public.create_notification(
    t.tenant_id, 'staff', 'Payment received',
    m.full_name || ' (' || m.member_no || ') paid ₦' || trim(to_char(t.amount, '999,999,999,999.00')) || '.',
    '/admin/payments', 'payment', null, 'payment:' || p_reference || ':staff');
end $$;

-- The manual-payment function returns a transaction id rather than a reference.
create or replace function public.notify_transaction(p_txn_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_reference text;
begin
  select reference into v_reference from public.transactions where id = p_txn_id;
  if v_reference is not null then perform public.notify_payment(v_reference); end if;
end $$;

-- Called after loan actions. p_event: requested | approved | rejected | activated | repayment
create or replace function public.notify_loan(p_loan_id uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.loans%rowtype; m public.members%rowtype; v_title text; v_body text; v_href text;
begin
  select * into l from public.loans where id = p_loan_id;
  if not found then return; end if;
  select * into m from public.members where id = l.member_id;
  if not found then return; end if;

  v_href := '/member/loans';
  v_title := case p_event
    when 'approved' then 'Your loan was approved'
    when 'rejected' then 'Your loan request was not approved'
    when 'activated' then 'Your loan is now active'
    when 'repayment' then 'Repayment recorded'
    else v_title end;
  v_body := case p_event
    when 'approved' then '₦' || trim(to_char(l.principal, '999,999,999,999.00')) || ' was approved. The cooperative will pay it out to you directly.'
    when 'rejected' then 'Your request for ₦' || trim(to_char(l.principal, '999,999,999,999.00')) || ' was not approved. Ask an officer for details.'
    when 'activated' then 'Your loan of ₦' || trim(to_char(l.principal, '999,999,999,999.00')) || ' is active. You can now make repayments.'
    when 'repayment' then 'A repayment towards your loan has been recorded. Check your loans page for the new balance.'
    else v_body end;

  if p_event = 'requested' then
    perform public.create_notification(
      l.tenant_id, 'staff', 'New loan request',
      m.full_name || ' requested ₦' || trim(to_char(l.principal, '999,999,999,999.00')) || '.',
      '/admin/loans', 'loan', null, 'loan:' || p_loan_id::text || ':staff');
  elsif p_event in ('approved', 'rejected', 'activated', 'repayment') then
    perform public.create_notification(
      l.tenant_id, 'member', v_title, v_body, v_href, 'loan', m.id,
      'loan:' || p_loan_id::text || ':' || p_event || ':' ||
      case when p_event = 'repayment' then l.amount_repaid::text
           else coalesce(l.approved_at::text, l.created_at::text) end);
  end if;
end $$;

-- Admin announcement: one notice per active member. p_key comes from the app so
-- a retried submit cannot create a duplicate broadcast.
create or replace function public.broadcast_announcement(
  p_tenant_hint uuid, p_title text, p_body text, p_href text, p_key text
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_count int := 0; r record;
begin
  -- The caller (a server action) has already checked admin role; this function is
  -- service-role-only, so no client can call it directly.
  if p_tenant_hint is null then raise exception 'Tenant is required'; end if;
  v_tenant := p_tenant_hint;
  for r in select id from public.members where tenant_id = v_tenant and status = 'active'
  loop
    if public.create_notification(v_tenant, 'member', p_title, p_body, p_href,
                                  'announcement', r.id, 'announcement:' || p_key || ':' || r.id::text) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- Permission lock-down: creates are internal only; reading and marking read are the user's.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('create_notification', 'notify_payment', 'notify_transaction', 'notify_loan', 'broadcast_announcement')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
-- 013 contribution plans  
-- =====================================================================
-- 013  SAVINGS SCHEDULES + IN-APP REMINDERS.
-- Reminders only: the member still pays through the existing /member/pay page.
-- Automatic debit can be added later through Paystack authorisations.
-- =====================================================================

create table public.contribution_plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  member_id     uuid not null unique references public.members(id) on delete cascade,
  amount        numeric(14,2) not null check (amount >= 100),
  frequency     text not null check (frequency in ('weekly', 'monthly')),
  -- monthly: day of month 1-28; weekly: 0=Sunday ... 6=Saturday. Exactly one is set.
  due_dom       int,
  due_dow       int,
  next_due_on   date not null,
  last_due_on   date,
  missed_count  int not null default 0,
  status        text not null default 'active' check (status in ('active', 'paused')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contribution_plan_day check (
    (frequency = 'monthly' and due_dom between 1 and 28 and due_dow is null) or
    (frequency = 'weekly' and due_dow between 0 and 6 and due_dom is null)
  )
);

create index contribution_plans_due on public.contribution_plans(tenant_id, status, next_due_on);

alter table public.contribution_plans enable row level security;

revoke all on public.contribution_plans from anon;
revoke insert, update, delete, truncate on public.contribution_plans from authenticated;
grant select on public.contribution_plans to authenticated;

create policy contribution_plans_member_select on public.contribution_plans for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

create policy contribution_plans_staff_select on public.contribution_plans for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and public.current_role_name() in ('admin', 'bookkeeper'));

-- Next date strictly after p_from. Used by the UI preview and by the cron sweep.
create or replace function public.next_contribution_due(
  p_frequency text, p_dom int, p_dow int, p_from date default current_date
) returns date
language sql immutable set search_path = public as $$
  select case
    when p_frequency = 'monthly' then
      case when d < p_from then (d + interval '1 month')::date else d end
    else p_from + ((p_dow - extract(dow from p_from)::int + 7) % 7)
  end
  from (select (date_trunc('month', p_from)::date + (coalesce(p_dom, 1) - 1)) as d) x
$$;

-- Member: create or update their own plan.
create or replace function public.save_contribution_plan(
  p_amount numeric, p_frequency text, p_dom int, p_dow int
) returns date
language plpgsql security definer set search_path = public as $$
declare v_member public.members%rowtype; v_due date;
begin
  if public.current_role_name() <> 'member' then raise exception 'Only a member can set a savings plan'; end if;
  select * into v_member from public.members where user_id = auth.uid() and tenant_id = public.current_tenant_id();
  if not found or v_member.status <> 'active' then raise exception 'Your membership is not active'; end if;
  if p_amount is null or p_amount < 100 then raise exception 'The minimum scheduled amount is ₦100'; end if;
  if p_frequency not in ('weekly', 'monthly') then raise exception 'Choose weekly or monthly'; end if;
  if p_frequency = 'monthly' and (p_dom is null or p_dom not between 1 and 28)
     then raise exception 'Choose a monthly date between 1 and 28'; end if;
  if p_frequency = 'weekly' and (p_dow is null or p_dow not between 0 and 6)
     then raise exception 'Choose a weekly day'; end if;

  v_due := public.next_contribution_due(p_frequency, p_dom, p_dow, current_date);
  insert into public.contribution_plans(tenant_id, member_id, amount, frequency, due_dom, due_dow, next_due_on)
  values (v_member.tenant_id, v_member.id, p_amount, p_frequency, p_dom, p_dow, v_due)
  on conflict (member_id) do update set
    amount = excluded.amount, frequency = excluded.frequency, due_dom = excluded.due_dom,
    due_dow = excluded.due_dow, next_due_on = excluded.next_due_on,
    status = 'active', updated_at = now()
  returning next_due_on into v_due;
  return v_due;
end $$;

create or replace function public.set_contribution_plan_status(p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active', 'paused') then raise exception 'Invalid status'; end if;
  update public.contribution_plans
     set status = p_status, updated_at = now(),
         next_due_on = case when p_status = 'active' and next_due_on < current_date
                            then current_date else next_due_on end
   where member_id in (select id from public.members where user_id = auth.uid())
     and tenant_id = public.current_tenant_id();
end $$;

-- Daily Vercel Cron sweep. Idempotent: each due date produces at most one notice.
create or replace function public.generate_contribution_notifications() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_next date; v_created int := 0; v_overdue int := 0;
begin
  for r in
    select cp.*, m.full_name
      from public.contribution_plans cp
      join public.members m on m.id = cp.member_id
     where cp.status = 'active' and cp.next_due_on <= current_date and m.status = 'active'
  loop
    perform public.create_notification(
      r.tenant_id, 'member', 'Your contribution is due',
      'Your ' || r.frequency || ' contribution of ₦' || trim(to_char(r.amount, '999,999,999,999.00')) || ' is due today. Pay in one tap from the app.',
      '/member/pay', 'contribution', r.member_id,
      'contribution_due:' || r.id::text || ':' || r.next_due_on::text);
    v_created := v_created + 1;

    if r.next_due_on < current_date - interval '2 days' then
      perform public.create_notification(
        r.tenant_id, 'member', 'Contribution overdue',
        'Your contribution due on ' || to_char(r.next_due_on, 'DD Mon YYYY') || ' is overdue. Please pay when you can.',
        '/member/pay', 'contribution', r.member_id,
        'contribution_overdue:' || r.id::text || ':' || r.next_due_on::text);
      v_overdue := v_overdue + 1;
    end if;

    v_next := case
      when r.frequency = 'weekly' then r.next_due_on + 7
      else public.next_contribution_due('monthly', r.due_dom, null, r.next_due_on + 1)
    end;
    update public.contribution_plans
       set next_due_on = v_next, last_due_on = r.next_due_on,
           missed_count = case when r.next_due_on < current_date - interval '2 days'
                               then missed_count + 1 else missed_count end,
           updated_at = now()
     where id = r.id;
  end loop;

  return jsonb_build_object('due', v_created, 'overdue', v_overdue);
end $$;

create or replace function public.nudge_contribution(p_member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_name text;
begin
  select tenant_id, full_name into v_tenant, v_name from public.members where id = p_member_id;
  if not found then return; end if;
  perform public.create_notification(
    v_tenant, 'member', 'A reminder from your cooperative',
    'Hello ' || v_name || ', your officers would like you to complete your contribution. Tap to pay.',
    '/member/pay', 'contribution', p_member_id,
    'nudge:' || p_member_id::text || ':' || current_date::text);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('generate_contribution_notifications', 'nudge_contribution')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('next_contribution_due', 'save_contribution_plan', 'set_contribution_plan_status')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
-- 014 cashbook  
-- =====================================================================
-- 014  CASHBOOK: cooperative income, expenses and transfers.
-- Member money already lives in transactions/passbook_entries, so the
-- summary UNIONs those rows instead of duplicating them. Transfers are
-- excluded from net movement because they only move money between accounts.
-- =====================================================================

create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 80),
  kind            text not null check (kind in ('bank', 'cash')),
  opening_balance numeric(14,2) not null default 0,
  is_default      boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, name)
);

create unique index cash_accounts_one_default on public.cash_accounts(tenant_id) where is_default;

create table public.cashbook_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  account_id     uuid not null references public.cash_accounts(id) on delete restrict,
  kind           text not null check (kind in ('income', 'expense', 'transfer_in', 'transfer_out')),
  category       text not null check (char_length(category) between 2 and 60),
  amount         numeric(14,2) not null check (amount > 0),
  entry_date     date not null default current_date,
  note           text,
  reference      text,
  recorded_by    uuid references auth.users(id) on delete set null,
  transfer_group uuid,
  created_at     timestamptz not null default now()
);

create index cashbook_entries_list on public.cashbook_entries(tenant_id, entry_date desc);
create index cashbook_entries_account on public.cashbook_entries(account_id);

alter table public.cash_accounts enable row level security;
alter table public.cashbook_entries enable row level security;

revoke all on public.cash_accounts, public.cashbook_entries from anon;
revoke insert, update, delete, truncate on public.cash_accounts, public.cashbook_entries from authenticated;
grant select on public.cash_accounts, public.cashbook_entries to authenticated;

create policy cash_accounts_staff_select on public.cash_accounts for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and public.current_role_name() in ('admin', 'bookkeeper'));

create policy cashbook_entries_staff_select on public.cashbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and public.current_role_name() in ('admin', 'bookkeeper'));

create or replace function public.create_cash_account(
  p_name text, p_kind text, p_opening numeric default 0, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_first boolean;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter an account name'; end if;
  if p_kind not in ('bank', 'cash') then raise exception 'Choose bank or cash'; end if;
  if coalesce(p_opening, 0) < 0 then raise exception 'Opening balance cannot be negative'; end if;
  select not exists (select 1 from public.cash_accounts where tenant_id = v_tenant) into v_first;

  insert into public.cash_accounts(tenant_id, name, kind, opening_balance, is_default, note)
  values (v_tenant, trim(p_name), p_kind, coalesce(p_opening, 0), v_first, p_note)
  returning id into v_id;
  perform public.log_audit('cashbook.account_created', jsonb_build_object('account_id', v_id, 'name', trim(p_name)));
  return v_id;
end $$;

create or replace function public.add_cashbook_entry(
  p_account_id uuid, p_kind text, p_category text, p_amount numeric,
  p_entry_date date default current_date, p_note text default null, p_reference text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_acc public.cash_accounts%rowtype; v_id uuid;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if p_kind not in ('income', 'expense') then raise exception 'Choose income or expense'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if char_length(trim(coalesce(p_category, ''))) < 2 then raise exception 'Enter a category'; end if;
  select * into v_acc from public.cash_accounts where id = p_account_id and tenant_id = v_tenant;
  if not found then raise exception 'Account not found'; end if;

  insert into public.cashbook_entries(tenant_id, account_id, kind, category, amount, entry_date, note, reference, recorded_by)
  values (v_tenant, v_acc.id, p_kind, trim(p_category), p_amount, coalesce(p_entry_date, current_date), p_note, p_reference, auth.uid())
  returning id into v_id;
  perform public.log_audit('cashbook.entry_added', jsonb_build_object('entry_id', v_id, 'kind', p_kind, 'amount', p_amount));
  return v_id;
end $$;

create or replace function public.add_cash_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric,
  p_entry_date date default current_date, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_group uuid := gen_random_uuid();
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if p_from_account = p_to_account then raise exception 'Choose two different accounts'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_from_account and tenant_id = v_tenant)
     or not exists (select 1 from public.cash_accounts where id = p_to_account and tenant_id = v_tenant) then
    raise exception 'Account not found';
  end if;

  insert into public.cashbook_entries(tenant_id, account_id, kind, category, amount, entry_date, note, recorded_by, transfer_group)
  values (v_tenant, p_from_account, 'transfer_out', 'Transfer', p_amount, coalesce(p_entry_date, current_date), p_note, auth.uid(), v_group),
         (v_tenant, p_to_account, 'transfer_in', 'Transfer', p_amount, coalesce(p_entry_date, current_date), p_note, auth.uid(), v_group);
  perform public.log_audit('cashbook.transfer_added', jsonb_build_object('transfer_group', v_group, 'amount', p_amount));
  return v_group;
end $$;

create or replace function public.set_default_cash_account(p_account_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if public.current_role_name() <> 'admin' then raise exception 'Only an admin can change the default account'; end if;
  update public.cash_accounts set is_default = false where tenant_id = v_tenant;
  update public.cash_accounts set is_default = true
   where id = p_account_id and tenant_id = v_tenant;
  if not found then raise exception 'Account not found'; end if;
end $$;

create or replace function public.delete_cashbook_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.cashbook_entries%rowtype;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  select * into e from public.cashbook_entries where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Entry not found'; end if;
  if e.transfer_group is not null then
    delete from public.cashbook_entries where tenant_id = e.tenant_id and transfer_group = e.transfer_group;
  else
    delete from public.cashbook_entries where id = e.id;
  end if;
  perform public.log_audit('cashbook.entry_deleted', jsonb_build_object('entry_id', e.id));
end $$;

-- One read for the whole screen: account balances, six-month movement and
-- this month's manual categories. Member income and loan payouts are included
-- so the totals agree with the passbook without writing extra ledger rows.
create or replace function public.cashbook_summary() returns jsonb
language sql stable set search_path = public as $$
  with txn as (
    select paid_at::date as d, amount
      from public.transactions
     where tenant_id = public.current_tenant_id() and status = 'success'
  ), payouts as (
    select approved_at::date as d, principal as amount
      from public.loans
     where tenant_id = public.current_tenant_id() and status in ('active', 'repaid')
  ), withdrawals as (
    select entry_date::date as d, amount
      from public.passbook_entries
     where tenant_id = public.current_tenant_id() and entry_type = 'withdrawal'
  ), manual as (
    select entry_date as d, amount, kind, category, account_id
      from public.cashbook_entries
     where tenant_id = public.current_tenant_id()
  ), months as (
    select (date_trunc('month', now()) - (n || ' months')::interval)::date as m
      from generate_series(0, 5) n
  ), series as (
    select to_char(m.m, 'Mon') as month,
      (select coalesce(sum(amount), 0) from txn where date_trunc('month', txn.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from manual where kind = 'income' and date_trunc('month', manual.d::timestamp) = m.m) as income,
      (select coalesce(sum(amount), 0) from payouts where date_trunc('month', payouts.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from withdrawals where date_trunc('month', withdrawals.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from manual where kind = 'expense' and date_trunc('month', manual.d::timestamp) = m.m) as expense
    from months m
  ), accounts as (
    select a.id, a.name, a.kind, a.is_default,
      a.opening_balance
      + coalesce((select sum(x.amount) from manual x where x.account_id = a.id and x.kind in ('income', 'transfer_in')), 0)
      - coalesce((select sum(x.amount) from manual x where x.account_id = a.id and x.kind in ('expense', 'transfer_out')), 0)
      + case when a.is_default then
          coalesce((select sum(amount) from txn), 0)
          - coalesce((select sum(amount) from payouts), 0)
          - coalesce((select sum(amount) from withdrawals), 0)
        else 0 end as balance
    from public.cash_accounts a
   where a.tenant_id = public.current_tenant_id()
  ), current_categories as (
    select category, kind, sum(amount) as total
      from manual
     where date_trunc('month', manual.d::timestamp) = date_trunc('month', now())
     group by category, kind
  )
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'kind', kind, 'is_default', is_default, 'balance', balance
      ) order by is_default desc, name) from accounts), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object(
        'month', month, 'income', income, 'expense', expense, 'net', income - expense
      )) from series), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'category', category, 'kind', kind, 'total', total
      ) order by total desc) from current_categories), '[]'::jsonb)
  )
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('create_cash_account', 'add_cashbook_entry', 'add_cash_transfer',
                                'set_default_cash_account', 'delete_cashbook_entry', 'cashbook_summary')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
-- 015 savings goals  
-- =====================================================================
-- 015  MEMBER SAVINGS GOALS + CONSISTENCY STREAK.
-- Progress is derived from the passbook; the goal itself stores no balance,
-- so it can never disagree with the member's savings.
-- =====================================================================

create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  member_id     uuid not null unique references public.members(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 120),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date   date,
  achieved_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.savings_goals enable row level security;

revoke all on public.savings_goals from anon;
revoke insert, update, delete, truncate on public.savings_goals from authenticated;
grant select on public.savings_goals to authenticated;

create policy savings_goals_member_select on public.savings_goals for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

create or replace function public.save_savings_goal(
  p_title text, p_target numeric, p_target_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_member public.members%rowtype; v_id uuid;
begin
  if public.current_role_name() <> 'member' then raise exception 'Only a member can set a savings goal'; end if;
  select * into v_member from public.members where user_id = auth.uid() and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Member record not found'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Give your goal a name'; end if;
  if p_target is null or p_target <= 0 then raise exception 'Enter a target greater than zero'; end if;
  if p_target_date is not null and p_target_date <= current_date then
    raise exception 'Choose a date in the future';
  end if;

  insert into public.savings_goals(tenant_id, member_id, title, target_amount, target_date)
  values (v_member.tenant_id, v_member.id, trim(p_title), p_target, p_target_date)
  on conflict (member_id) do update set
    title = excluded.title, target_amount = excluded.target_amount,
    target_date = excluded.target_date, achieved_at = null
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_savings_goal() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.savings_goals
   where member_id in (select id from public.members where user_id = auth.uid())
     and tenant_id = public.current_tenant_id();
end $$;

-- Consecutive months with a contribution, counting back from this month
-- (or from last month when this month has not been paid yet).
create or replace function public.member_savings_streak(p_member_id uuid) returns int
language plpgsql stable set search_path = public as $$
declare m date := date_trunc('month', now())::date; n int := 0; has_entry boolean;
begin
  select exists(
    select 1 from public.passbook_entries
     where member_id = p_member_id and entry_type = 'contribution'
       and date_trunc('month', entry_date)::date = m
  ) into has_entry;
  if not has_entry then m := (m - interval '1 month')::date; end if;

  loop
    select exists(
      select 1 from public.passbook_entries
       where member_id = p_member_id and entry_type = 'contribution'
         and date_trunc('month', entry_date)::date = m
    ) into has_entry;
    exit when not has_entry;
    n := n + 1;
    m := (m - interval '1 month')::date;
    exit when n >= 120;
  end loop;
  return n;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('save_savings_goal', 'delete_savings_goal', 'member_savings_streak')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
