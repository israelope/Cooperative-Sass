-- =====================================================================
-- 007  ONLINE LOAN REPAYMENT + COOPERATIVE STATEMENT DATA
-- Run AFTER migrations 1 to 6.
-- A loan repayment is a normal Paystack payment: it settles to the SAME cooperative sub-account
-- (the bank account saved in Settings) and is credited by the SAME signed, idempotent webhook.
-- =====================================================================

alter table public.transactions
  add column if not exists purpose text not null default 'contribution' check (purpose in ('contribution','loan_repayment')),
  add column if not exists loan_id uuid references public.loans(id) on delete set null;

alter table public.loan_repayments
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null;   -- set for online repayments

create index if not exists transactions_loan_idx on public.transactions(loan_id) where loan_id is not null;

-- A member may start a PENDING ONLINE payment for themselves: either a contribution, or a repayment of
-- one of THEIR OWN ACTIVE loans. Fee columns remain unwritable by members (column-level grant).
drop policy if exists transactions_member_insert_pending on public.transactions;
create policy transactions_member_insert_pending on public.transactions for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and channel = 'online' and status = 'pending'
    and member_id in (select id from public.members where user_id = auth.uid() and status = 'active')
    and (
      (purpose = 'contribution' and loan_id is null)
      or (purpose = 'loan_repayment' and loan_id in (
            select l.id from public.loans l join public.members m on m.id = l.member_id
             where m.user_id = auth.uid() and l.status = 'active'))
    )
  );

revoke insert on public.transactions from authenticated;
grant insert (tenant_id, member_id, reference, amount, channel, status, purpose, loan_id) on public.transactions to authenticated;

-- ---------- reconciliation: contributions AND loan repayments ----------
create or replace function public.process_successful_payment(
  p_reference text, p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  l public.loans%rowtype;
  inserted int;
  fees_raw text := p_payload -> 'data' ->> 'fees';
  ps_fee numeric(14,2) := 0;
  remaining numeric(14,2);
  applied numeric(14,2);
  extra numeric(14,2);
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

  if fees_raw ~ '^[0-9]+(\.[0-9]+)?$' then ps_fee := round(fees_raw::numeric / 100, 2); end if;
  update public.transactions set status = 'success', paid_at = now(), paystack_fee = ps_fee where id = t.id;

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
      -- Money has already been paid, so anything above the balance still owed is never lost: it goes to savings.
      if extra > 0 then
        perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', extra, now(), 'Overpayment credited to savings');
      end if;
    else
      perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Payment credited to savings (loan not active)');
    end if;
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'loan.repayment_online', jsonb_build_object('reference', p_reference, 'amount', t.amount, 'loan_id', t.loan_id));
  else
    perform public.append_passbook_entry(t.tenant_id, t.member_id, t.id, 'contribution', t.amount, now(), 'Online payment');
    insert into public.audit_logs(tenant_id, action, details)
    values (t.tenant_id, 'payment.reconciled', jsonb_build_object('reference', p_reference, 'amount', t.amount));
  end if;
  return 'credited';
end $$;

-- ---------- data for the cooperative PDF statement (admin / bookkeeper of ONE cooperative) ----------
-- SECURITY INVOKER: row-level security limits every row to the caller's own cooperative.
create or replace function public.cooperative_statement(p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  tid uuid := public.current_tenant_id();
  res jsonb;
begin
  if tid is null or public.current_role_name() not in ('admin','bookkeeper') then raise exception 'Not allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;
  if p_to - p_from > 800 then raise exception 'The period is too long (maximum about two years)'; end if;

  res := (
    with pay as (
      select coalesce(tr.paid_at, tr.created_at) as ts, m.member_no, m.full_name, tr.purpose, tr.channel, tr.amount, tr.reference
        from public.transactions tr join public.members m on m.id = tr.member_id
       where tr.status = 'success'
         and coalesce(tr.paid_at, tr.created_at) >= p_from and coalesce(tr.paid_at, tr.created_at) < p_to + 1
      union all
      select rp.paid_at, m.member_no, m.full_name, 'loan_repayment', 'recorded', rp.amount, 'REPAY-' || upper(substr(rp.id::text, 1, 8))
        from public.loan_repayments rp
        join public.loans l on l.id = rp.loan_id
        join public.members m on m.id = l.member_id
       where rp.transaction_id is null and rp.paid_at >= p_from and rp.paid_at < p_to + 1
    ),
    bal as (select distinct on (member_id) member_id, running_balance from public.passbook_entries order by member_id, seq desc),
    owed as (select member_id, sum(total_repayable - amount_repaid) as outstanding from public.loans where status in ('approved','active') group by member_id)
    select jsonb_build_object(
      'coop',   (select jsonb_build_object('name', name, 'slug', slug) from public.tenants where id = tid),
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'summary', jsonb_build_object(
        'members_total',     (select count(*) from public.members),
        'members_active',    (select count(*) from public.members where status = 'active'),
        'total_savings',     (select coalesce(sum(running_balance), 0) from bal),
        'loans_active',      (select count(*) from public.loans where status = 'active'),
        'loans_outstanding', (select coalesce(sum(outstanding), 0) from owed),
        'collected',         (select coalesce(sum(amount), 0) from pay),
        'payments_count',    (select count(*) from pay),
        'online',            (select coalesce(sum(amount), 0) from pay where channel = 'online'),
        'cash',              (select coalesce(sum(amount), 0) from pay where channel = 'cash'),
        'transfer',          (select coalesce(sum(amount), 0) from pay where channel = 'transfer'),
        'recorded',          (select coalesce(sum(amount), 0) from pay where channel = 'recorded'),
        'contributions',     (select coalesce(sum(amount), 0) from pay where purpose = 'contribution'),
        'repayments',        (select coalesce(sum(amount), 0) from pay where purpose = 'loan_repayment')
      ),
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'member_no', m.member_no, 'full_name', m.full_name, 'status', m.status,
                    'savings', coalesce(b.running_balance, 0), 'outstanding', coalesce(o.outstanding, 0)) order by m.member_no), '[]'::jsonb)
                   from public.members m left join bal b on b.member_id = m.id left join owed o on o.member_id = m.id),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', ts, 'member_no', member_no, 'member', full_name, 'purpose', purpose,
                    'channel', channel, 'amount', amount, 'reference', reference) order by ts), '[]'::jsonb) from pay)
    )
  );
  return res;
end $$;

revoke all on function public.cooperative_statement(date, date) from public, anon;
grant execute on function public.cooperative_statement(date, date) to authenticated, service_role;
