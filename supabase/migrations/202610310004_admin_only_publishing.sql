alter table public.assets enable row level security;
alter table public.articles enable row level security;

drop policy if exists "Authenticated users can view all assets" on public.assets;
drop policy if exists "Authenticated users can insert assets" on public.assets;
drop policy if exists "Authenticated users can update assets" on public.assets;
drop policy if exists "Authenticated users can delete assets" on public.assets;
drop policy if exists "Admins can manage all assets" on public.assets;
create policy "Admins can manage all assets"
  on public.assets for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );

drop policy if exists "Admins can manage articles" on public.articles;
create policy "Admins can manage articles"
  on public.articles for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );

drop policy if exists "Admins can upload marketplace assets" on storage.objects;
drop policy if exists "Authenticated users can upload marketplace assets" on storage.objects;
create policy "Admins can upload marketplace assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-assets'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
    )
  );

drop policy if exists "Admins can update marketplace assets" on storage.objects;
create policy "Admins can update marketplace assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'marketplace-assets'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
    )
  )
  with check (
    bucket_id = 'marketplace-assets'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
    )
  );

drop policy if exists "Admins can delete marketplace assets" on storage.objects;
create policy "Admins can delete marketplace assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-assets'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
    )
  );