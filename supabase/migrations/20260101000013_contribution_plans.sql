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
