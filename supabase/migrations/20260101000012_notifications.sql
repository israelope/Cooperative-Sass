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
