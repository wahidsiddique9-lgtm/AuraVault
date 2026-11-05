alter table public.assets
  add column if not exists file_url text,
  add column if not exists storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-assets',
  'marketplace-assets',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view marketplace assets" on storage.objects;
create policy "Public can view marketplace assets"
  on storage.objects for select
  using (bucket_id = 'marketplace-assets');

drop policy if exists "Admins can upload marketplace assets" on storage.objects;
create policy "Admins can upload marketplace assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admins can update marketplace assets" on storage.objects;
create policy "Admins can update marketplace assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'marketplace-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'marketplace-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admins can delete marketplace assets" on storage.objects;
create policy "Admins can delete marketplace assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  category text not null check (char_length(category) between 1 and 80),
  content text not null check (char_length(content) between 1 and 100000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;

drop policy if exists "Published articles are visible to everyone" on public.articles;
create policy "Published articles are visible to everyone"
  on public.articles for select
  using (published = true);

drop policy if exists "Admins can manage articles" on public.articles;
create policy "Admins can manage articles"
  on public.articles for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create index if not exists articles_published_created_idx
  on public.articles (published, created_at desc);