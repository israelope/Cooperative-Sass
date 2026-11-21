-- =====================================================================
-- 009  STAFF ROLES: admin-controlled role changes within one cooperative.
-- Run AFTER migrations 1 to 8.
--
-- Called with the CALLER'S OWN Supabase session (not the service role), so
-- current_role_name() / current_tenant_id() come from their JWT claims.
-- SECURITY DEFINER lets the function write profiles despite the select-only
-- RLS policy; every authorisation decision is re-checked here.
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

  -- A cooperative must always keep at least one admin.
  if t.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins
      from public.profiles
     where tenant_id = v_tenant and role = 'admin';
    if v_admins <= 1 then
      raise exception 'A cooperative must keep at least one admin.';
    end if;
  end if;

  -- Without a member record the person would be trapped by requireMember().
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
