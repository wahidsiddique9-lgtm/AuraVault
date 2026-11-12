-- This migration only creates a new private bucket when absent and adds
-- narrowly scoped admin write policies. It never changes an existing bucket
-- or drops/replaces existing policies. It deliberately adds no read policy;
-- customer downloads use the server-authorized service-role signed URL route.
do $$
declare
  originals_bucket_is_public boolean;
begin
  select public into originals_bucket_is_public
  from storage.buckets
  where id = 'marketplace-originals';

  if found and originals_bucket_is_public then
    raise exception 'marketplace-originals already exists as a public bucket; inspect it manually. No migration changes have been made.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and roles && array['anon', 'authenticated', 'public']::name[]
      and (
        qual is null
        or qual !~* 'bucket_id'
        or qual ilike '%marketplace-originals%'
        or qual ilike '% or %'
      )
  ) then
    raise exception 'A broad or marketplace-originals object-read policy exists; review storage.objects policies manually. No migration changes have been made.';
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-originals',
  'marketplace-originals',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'application/pdf', 'text/plain', 'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Admins can upload marketplace originals'
  ) then
    execute $policy$
      create policy "Admins can upload marketplace originals"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'marketplace-originals'
          and (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
            or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
          )
        )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Admins can update marketplace originals'
  ) then
    execute $policy$
      create policy "Admins can update marketplace originals"
        on storage.objects for update to authenticated
        using (
          bucket_id = 'marketplace-originals'
          and (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
            or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
          )
        )
        with check (
          bucket_id = 'marketplace-originals'
          and (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
            or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
          )
        )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Admins can delete marketplace originals'
  ) then
    execute $policy$
      create policy "Admins can delete marketplace originals"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'marketplace-originals'
          and (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
            or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
          )
        )
    $policy$;
  end if;
end
$$;