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
