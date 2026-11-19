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
