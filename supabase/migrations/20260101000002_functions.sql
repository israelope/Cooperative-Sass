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
