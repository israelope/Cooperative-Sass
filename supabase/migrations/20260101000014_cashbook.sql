-- =====================================================================
-- 014  CASHBOOK: cooperative income, expenses and transfers.
-- Member money already lives in transactions/passbook_entries, so the
-- summary UNIONs those rows instead of duplicating them. Transfers are
-- excluded from net movement because they only move money between accounts.
-- =====================================================================

create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 80),
  kind            text not null check (kind in ('bank', 'cash')),
  opening_balance numeric(14,2) not null default 0,
  is_default      boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, name)
);

create unique index cash_accounts_one_default on public.cash_accounts(tenant_id) where is_default;

create table public.cashbook_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  account_id     uuid not null references public.cash_accounts(id) on delete restrict,
  kind           text not null check (kind in ('income', 'expense', 'transfer_in', 'transfer_out')),
  category       text not null check (char_length(category) between 2 and 60),
  amount         numeric(14,2) not null check (amount > 0),
  entry_date     date not null default current_date,
  note           text,
  reference      text,
  recorded_by    uuid references auth.users(id) on delete set null,
  transfer_group uuid,
  created_at     timestamptz not null default now()
);

create index cashbook_entries_list on public.cashbook_entries(tenant_id, entry_date desc);
create index cashbook_entries_account on public.cashbook_entries(account_id);

alter table public.cash_accounts enable row level security;
alter table public.cashbook_entries enable row level security;

revoke all on public.cash_accounts, public.cashbook_entries from anon;
revoke insert, update, delete, truncate on public.cash_accounts, public.cashbook_entries from authenticated;
grant select on public.cash_accounts, public.cashbook_entries to authenticated;

create policy cash_accounts_staff_select on public.cash_accounts for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and public.current_role_name() in ('admin', 'bookkeeper'));

create policy cashbook_entries_staff_select on public.cashbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and public.current_role_name() in ('admin', 'bookkeeper'));

create or replace function public.create_cash_account(
  p_name text, p_kind text, p_opening numeric default 0, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_first boolean;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter an account name'; end if;
  if p_kind not in ('bank', 'cash') then raise exception 'Choose bank or cash'; end if;
  if coalesce(p_opening, 0) < 0 then raise exception 'Opening balance cannot be negative'; end if;
  select not exists (select 1 from public.cash_accounts where tenant_id = v_tenant) into v_first;

  insert into public.cash_accounts(tenant_id, name, kind, opening_balance, is_default, note)
  values (v_tenant, trim(p_name), p_kind, coalesce(p_opening, 0), v_first, p_note)
  returning id into v_id;
  perform public.log_audit('cashbook.account_created', jsonb_build_object('account_id', v_id, 'name', trim(p_name)));
  return v_id;
end $$;

create or replace function public.add_cashbook_entry(
  p_account_id uuid, p_kind text, p_category text, p_amount numeric,
  p_entry_date date default current_date, p_note text default null, p_reference text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_acc public.cash_accounts%rowtype; v_id uuid;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if p_kind not in ('income', 'expense') then raise exception 'Choose income or expense'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if char_length(trim(coalesce(p_category, ''))) < 2 then raise exception 'Enter a category'; end if;
  select * into v_acc from public.cash_accounts where id = p_account_id and tenant_id = v_tenant;
  if not found then raise exception 'Account not found'; end if;

  insert into public.cashbook_entries(tenant_id, account_id, kind, category, amount, entry_date, note, reference, recorded_by)
  values (v_tenant, v_acc.id, p_kind, trim(p_category), p_amount, coalesce(p_entry_date, current_date), p_note, p_reference, auth.uid())
  returning id into v_id;
  perform public.log_audit('cashbook.entry_added', jsonb_build_object('entry_id', v_id, 'kind', p_kind, 'amount', p_amount));
  return v_id;
end $$;

create or replace function public.add_cash_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric,
  p_entry_date date default current_date, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_group uuid := gen_random_uuid();
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  if p_from_account = p_to_account then raise exception 'Choose two different accounts'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_from_account and tenant_id = v_tenant)
     or not exists (select 1 from public.cash_accounts where id = p_to_account and tenant_id = v_tenant) then
    raise exception 'Account not found';
  end if;

  insert into public.cashbook_entries(tenant_id, account_id, kind, category, amount, entry_date, note, recorded_by, transfer_group)
  values (v_tenant, p_from_account, 'transfer_out', 'Transfer', p_amount, coalesce(p_entry_date, current_date), p_note, auth.uid(), v_group),
         (v_tenant, p_to_account, 'transfer_in', 'Transfer', p_amount, coalesce(p_entry_date, current_date), p_note, auth.uid(), v_group);
  perform public.log_audit('cashbook.transfer_added', jsonb_build_object('transfer_group', v_group, 'amount', p_amount));
  return v_group;
end $$;

create or replace function public.set_default_cash_account(p_account_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if public.current_role_name() <> 'admin' then raise exception 'Only an admin can change the default account'; end if;
  update public.cash_accounts set is_default = false where tenant_id = v_tenant;
  update public.cash_accounts set is_default = true
   where id = p_account_id and tenant_id = v_tenant;
  if not found then raise exception 'Account not found'; end if;
end $$;

create or replace function public.delete_cashbook_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.cashbook_entries%rowtype;
begin
  if public.current_role_name() not in ('admin', 'bookkeeper') then raise exception 'Not allowed'; end if;
  select * into e from public.cashbook_entries where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Entry not found'; end if;
  if e.transfer_group is not null then
    delete from public.cashbook_entries where tenant_id = e.tenant_id and transfer_group = e.transfer_group;
  else
    delete from public.cashbook_entries where id = e.id;
  end if;
  perform public.log_audit('cashbook.entry_deleted', jsonb_build_object('entry_id', e.id));
end $$;

-- One read for the whole screen: account balances, six-month movement and
-- this month's manual categories. Member income and loan payouts are included
-- so the totals agree with the passbook without writing extra ledger rows.
create or replace function public.cashbook_summary() returns jsonb
language sql stable set search_path = public as $$
  with txn as (
    select paid_at::date as d, amount
      from public.transactions
     where tenant_id = public.current_tenant_id() and status = 'success'
  ), payouts as (
    select approved_at::date as d, principal as amount
      from public.loans
     where tenant_id = public.current_tenant_id() and status in ('active', 'repaid')
  ), withdrawals as (
    select entry_date::date as d, amount
      from public.passbook_entries
     where tenant_id = public.current_tenant_id() and entry_type = 'withdrawal'
  ), manual as (
    select entry_date as d, amount, kind, category, account_id
      from public.cashbook_entries
     where tenant_id = public.current_tenant_id()
  ), months as (
    select (date_trunc('month', now()) - (n || ' months')::interval)::date as m
      from generate_series(0, 5) n
  ), series as (
    select to_char(m.m, 'Mon') as month,
      (select coalesce(sum(amount), 0) from txn where date_trunc('month', txn.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from manual where kind = 'income' and date_trunc('month', manual.d::timestamp) = m.m) as income,
      (select coalesce(sum(amount), 0) from payouts where date_trunc('month', payouts.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from withdrawals where date_trunc('month', withdrawals.d::timestamp) = m.m)
      + (select coalesce(sum(amount), 0) from manual where kind = 'expense' and date_trunc('month', manual.d::timestamp) = m.m) as expense
    from months m
  ), accounts as (
    select a.id, a.name, a.kind, a.is_default,
      a.opening_balance
      + coalesce((select sum(x.amount) from manual x where x.account_id = a.id and x.kind in ('income', 'transfer_in')), 0)
      - coalesce((select sum(x.amount) from manual x where x.account_id = a.id and x.kind in ('expense', 'transfer_out')), 0)
      + case when a.is_default then
          coalesce((select sum(amount) from txn), 0)
          - coalesce((select sum(amount) from payouts), 0)
          - coalesce((select sum(amount) from withdrawals), 0)
        else 0 end as balance
    from public.cash_accounts a
   where a.tenant_id = public.current_tenant_id()
  ), current_categories as (
    select category, kind, sum(amount) as total
      from manual
     where date_trunc('month', manual.d::timestamp) = date_trunc('month', now())
     group by category, kind
  )
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'kind', kind, 'is_default', is_default, 'balance', balance
      ) order by is_default desc, name) from accounts), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object(
        'month', month, 'income', income, 'expense', expense, 'net', income - expense
      )) from series), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'category', category, 'kind', kind, 'total', total
      ) order by total desc) from current_categories), '[]'::jsonb)
  )
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('create_cash_account', 'add_cashbook_entry', 'add_cash_transfer',
                                'set_default_cash_account', 'delete_cashbook_entry', 'cashbook_summary')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
