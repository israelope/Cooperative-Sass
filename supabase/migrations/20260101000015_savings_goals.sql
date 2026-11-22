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
