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
