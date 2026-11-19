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
