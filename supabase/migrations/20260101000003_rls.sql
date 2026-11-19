-- =====================================================================
-- 003  ROW-LEVEL SECURITY + TABLE PRIVILEGES
-- Defence in depth: (1) table privileges are minimal, (2) RLS filters rows,
-- (3) ledger writes happen only through trusted SECURITY DEFINER functions.
-- =====================================================================

alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.members          enable row level security;
alter table public.transactions     enable row level security;
alter table public.passbook_entries enable row level security;
alter table public.loans            enable row level security;
alter table public.loan_repayments  enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.webhook_events   enable row level security;   -- no policies => service role only

-- ---------- table privileges ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke all on public.webhook_events from authenticated;
grant select on public.tenants, public.profiles, public.members, public.transactions,
                public.passbook_entries, public.loans, public.loan_repayments, public.audit_logs to authenticated;
grant insert on public.transactions to authenticated;                                  -- members start online payments
grant update (full_name, phone, email, status) on public.members to authenticated;     -- staff edit/approve/suspend
grant update (name, loan_multiplier, default_interest_rate) on public.tenants to authenticated;

-- ---------- tenants ----------
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.current_tenant_id());
create policy tenants_admin_update on public.tenants for update to authenticated
  using (id = public.current_tenant_id() and public.current_role_name() = 'admin')
  with check (id = public.current_tenant_id());

-- ---------- profiles (read-only for users) ----------
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_select on public.profiles for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));

-- ---------- members ----------
create policy members_staff_select on public.members for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy members_self_select on public.members for select to authenticated
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());
create policy members_staff_update on public.members for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'))
  with check (tenant_id = public.current_tenant_id());

-- ---------- transactions ----------
create policy transactions_staff_select on public.transactions for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy transactions_self_select on public.transactions for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));
-- A member may only create a PENDING ONLINE transaction for themselves.
-- It becomes 'success' only through the signed webhook (service role).
create policy transactions_member_insert_pending on public.transactions for insert to authenticated
  with check (tenant_id = public.current_tenant_id()
              and channel = 'online' and status = 'pending'
              and member_id in (select id from public.members where user_id = auth.uid() and status = 'active'));

-- ---------- passbook (read-only; written by append_passbook_entry) ----------
create policy passbook_staff_select on public.passbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy passbook_self_select on public.passbook_entries for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

-- ---------- loans & repayments (read-only; written by loan functions) ----------
create policy loans_staff_select on public.loans for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy loans_self_select on public.loans for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and member_id in (select id from public.members where user_id = auth.uid()));

create policy repayments_staff_select on public.loan_repayments for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() in ('admin','bookkeeper'));
create policy repayments_self_select on public.loan_repayments for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and loan_id in (select l.id from public.loans l
                          join public.members m on m.id = l.member_id where m.user_id = auth.uid()));

-- ---------- audit logs: admin read-only ----------
create policy audit_admin_select on public.audit_logs for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role_name() = 'admin');
