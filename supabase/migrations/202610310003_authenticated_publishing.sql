create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'document')),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  category text not null default 'Uncategorized',
  price numeric(10, 2) not null default 0 check (price >= 0),
  image_url text,
  file_url text,
  storage_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets
  add column if not exists file_url text,
  add column if not exists storage_path text;

create index if not exists assets_kind_published_created_idx
  on public.assets (kind, published, created_at desc);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  category text not null check (char_length(category) between 1 and 80),
  content text not null check (char_length(content) between 1 and 100000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_published_created_idx
  on public.articles (published, created_at desc);

alter table public.assets enable row level security;
alter table public.articles enable row level security;

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

drop policy if exists "Published assets are visible to everyone" on public.assets;
create policy "Published assets are visible to everyone"
  on public.assets for select
  using (published = true);

drop policy if exists "Admins can manage all assets" on public.assets;
drop policy if exists "Authenticated users can view all assets" on public.assets;
create policy "Authenticated users can view all assets"
  on public.assets for select to authenticated
  using (true);

drop policy if exists "Authenticated users can insert assets" on public.assets;
create policy "Authenticated users can insert assets"
  on public.assets for insert to authenticated
  with check (true);

drop policy if exists "Authenticated users can update assets" on public.assets;
create policy "Authenticated users can update assets"
  on public.assets for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Admins can delete assets" on public.assets;
create policy "Admins can delete assets"
  on public.assets for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Published articles are visible to everyone" on public.articles;
create policy "Published articles are visible to everyone"
  on public.articles for select
  using (published = true);

drop policy if exists "Admins can manage articles" on public.articles;
create policy "Admins can manage articles"
  on public.articles for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public can view marketplace assets" on storage.objects;
create policy "Public can view marketplace assets"
  on storage.objects for select
  using (bucket_id = 'marketplace-assets');

drop policy if exists "Admins can upload marketplace assets" on storage.objects;
drop policy if exists "Authenticated users can upload marketplace assets" on storage.objects;
create policy "Authenticated users can upload marketplace assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'marketplace-assets');

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