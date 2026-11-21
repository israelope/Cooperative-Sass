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
