create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'document')),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  category text not null default 'Uncategorized',
  price numeric(10, 2) not null default 0 check (price >= 0),
  image_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Published assets are visible to everyone"
  on public.assets for select
  using (published = true);

create policy "Admins can manage all assets"
  on public.assets for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create index if not exists assets_kind_published_created_idx
  on public.assets (kind, published, created_at desc);