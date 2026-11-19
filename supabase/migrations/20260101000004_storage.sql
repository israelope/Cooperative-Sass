-- =====================================================================
-- 004  STORAGE: private "receipts" bucket, one folder per tenant (<tenant_id>/<file>)
-- Free-plan friendly: 2 MB cap per file, images only (the app compresses before upload).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types,
                               public = false;

drop policy if exists receipts_staff_insert on storage.objects;
drop policy if exists receipts_select on storage.objects;

-- Staff may upload only into their own tenant's folder
create policy receipts_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] = public.current_tenant_id()::text
              and public.current_role_name() in ('admin','bookkeeper'));

-- Staff read their tenant's receipts; a member reads a receipt only if it belongs to one of
-- their own transactions (the sub-select is itself filtered by RLS on public.transactions).
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] = public.current_tenant_id()::text
         and (public.current_role_name() in ('admin','bookkeeper')
              or exists (select 1 from public.transactions t where t.receipt_url = storage.objects.name)));
