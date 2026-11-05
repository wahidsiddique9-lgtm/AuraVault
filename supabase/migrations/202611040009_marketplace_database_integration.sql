-- Final additive integration migration for the verified existing AuraVault
-- project. This migration does not modify marketplace-assets, create a
-- migration-history table, move/delete files, or grant public reads to paid
-- originals. All conflict checks run before the first schema change.

do $preflight$
declare
  originals_bucket_is_public boolean;
  originals_bucket_limit bigint;
  originals_bucket_mimes text[];
  required_mimes text[] := array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'application/pdf', 'text/plain', 'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
begin
  if to_regclass('public.assets') is null then
    raise exception 'public.assets was not found. This migration expects the existing assets table; no changes have been made.';
  end if;

  if exists (
    select required.column_name
    from (values ('file_url'), ('storage_path')) as required(column_name)
    where not exists (
      select 1 from information_schema.columns as actual
      where actual.table_schema = 'public'
        and actual.table_name = 'assets'
        and actual.column_name = required.column_name
    )
  ) then
    raise exception 'public.assets is missing file_url or storage_path. Review the existing schema before applying this migration; no changes have been made.';
  end if;

  if to_regclass('public.order_items') is not null and to_regclass('public.orders') is null then
    raise exception 'public.order_items exists without public.orders. Review the existing order schema before applying this migration; no changes have been made.';
  end if;

  if to_regclass('public.orders') is not null and exists (
    select required.column_name
    from (values
      ('id'), ('user_id'), ('checkout_session_id'), ('payment_intent_id'),
      ('status'), ('currency'), ('subtotal_cents'), ('created_at'), ('paid_at')
    ) as required(column_name)
    where not exists (
      select 1 from information_schema.columns as actual
      where actual.table_schema = 'public'
        and actual.table_name = 'orders'
        and actual.column_name = required.column_name
    )
  ) then
    raise exception 'public.orders exists with an unexpected schema. Review it manually; no changes have been made.';
  end if;

  if to_regclass('public.order_items') is not null and exists (
    select required.column_name
    from (values
      ('id'), ('order_id'), ('asset_id'), ('asset_title'),
      ('storage_path'), ('amount_cents'), ('created_at')
    ) as required(column_name)
    where not exists (
      select 1 from information_schema.columns as actual
      where actual.table_schema = 'public'
        and actual.table_name = 'order_items'
        and actual.column_name = required.column_name
    )
  ) then
    raise exception 'public.order_items exists with an unexpected schema. Review it manually; no changes have been made.';
  end if;

  if to_regclass('public.orders') is not null and exists (
    select required.constraint_name
    from (values
      ('orders_pkey'),
      ('orders_user_id_fkey'),
      ('orders_checkout_session_id_key'),
      ('orders_payment_intent_id_key'),
      ('orders_status_check'),
      ('orders_currency_check'),
      ('orders_subtotal_cents_check')
    ) as required(constraint_name)
    where not exists (
      select 1 from pg_constraint as actual
      where actual.conrelid = 'public.orders'::regclass
        and actual.conname = required.constraint_name
        and actual.convalidated
    )
  ) then
    raise exception 'public.orders exists without all required validated constraints. Review it manually; no changes have been made.';
  end if;

  if to_regclass('public.order_items') is not null and exists (
    select required.constraint_name
    from (values
      ('order_items_pkey'),
      ('order_items_order_id_fkey'),
      ('order_items_asset_id_fkey'),
      ('order_items_asset_title_check'),
      ('order_items_storage_path_check'),
      ('order_items_amount_cents_check')
    ) as required(constraint_name)
    where not exists (
      select 1 from pg_constraint as actual
      where actual.conrelid = 'public.order_items'::regclass
        and actual.conname = required.constraint_name
        and actual.convalidated
    )
  ) then
    raise exception 'public.order_items exists without all required validated constraints. Review it manually; no changes have been made.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_items')
      and policyname not in (
        'Users can read their own orders',
        'Admins can read all orders',
        'Users can read purchased order items',
        'Admins can read all order items'
      )
  ) then
    raise exception 'Unexpected policy exists on public.orders or public.order_items. Review it manually; no changes have been made.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and (
        (policyname = 'Users can read their own orders' and
          (cmd <> 'SELECT' or not (roles @> array['authenticated']::name[])
            or qual is null or qual not ilike '%user_id%'
            or qual not ilike '%auth.uid()%'))
        or
        (policyname = 'Admins can read all orders' and
          (cmd <> 'SELECT' or not (roles @> array['authenticated']::name[])
            or qual is null or qual not ilike '%app_metadata%'
            or qual not ilike '%admin%'))
      )
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items'
      and (
        (policyname = 'Users can read purchased order items' and
          (cmd <> 'SELECT' or not (roles @> array['authenticated']::name[])
            or qual is null or qual not ilike '%orders%'
            or qual not ilike '%auth.uid()%'
            or qual not ilike '%paid%' or qual not ilike '%free%'))
        or
        (policyname = 'Admins can read all order items' and
          (cmd <> 'SELECT' or not (roles @> array['authenticated']::name[])
            or qual is null or qual not ilike '%app_metadata%'
            or qual not ilike '%admin%'))
      )
  ) then
    raise exception 'An expected order policy name exists with an unexpected definition. Review it manually; no changes have been made.';
  end if;

  if to_regclass('storage.buckets') is null then
    raise exception 'Supabase Storage metadata is unavailable. No changes have been made.';
  end if;

  select public, file_size_limit, allowed_mime_types
    into originals_bucket_is_public, originals_bucket_limit, originals_bucket_mimes
  from storage.buckets
  where id = 'marketplace-originals';

  if found then
    if originals_bucket_is_public is distinct from false then
      raise exception 'marketplace-originals already exists but is not confirmed private. Review it manually; no changes have been made.';
    end if;
    if originals_bucket_limit is not null and originals_bucket_limit < 26214400 then
      raise exception 'marketplace-originals has a smaller existing size limit than this application requires. Review it manually; no changes have been made.';
    end if;
    if originals_bucket_mimes is not null and not (originals_bucket_mimes @> required_mimes) then
      raise exception 'marketplace-originals has an incompatible existing MIME allowlist. Review it manually; no changes have been made.';
    end if;
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
    raise exception 'A broad or marketplace-originals object-read policy exists. Review all Storage policies manually; no changes have been made.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'Admins can upload marketplace originals',
        'Admins can update marketplace originals',
        'Admins can delete marketplace originals'
      )
      and (
        not (roles @> array['authenticated']::name[])
        or (cmd = 'INSERT' and (
          with_check is null or with_check not ilike '%marketplace-originals%'
            or with_check not ilike '%app_metadata%' or with_check not ilike '%admin%'))
        or (cmd = 'UPDATE' and (
          qual is null or with_check is null
            or qual not ilike '%marketplace-originals%'
            or with_check not ilike '%marketplace-originals%'
            or qual not ilike '%app_metadata%'
            or with_check not ilike '%app_metadata%'))
        or (cmd = 'DELETE' and (
          qual is null or qual not ilike '%marketplace-originals%'
            or qual not ilike '%app_metadata%' or qual not ilike '%admin%'))
        or cmd not in ('INSERT', 'UPDATE', 'DELETE')
      )
  ) then
    raise exception 'An expected marketplace-originals write policy exists with an unexpected definition. Review it manually; no changes have been made.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles && array['anon', 'authenticated', 'public']::name[]
      and policyname not in (
        'Admins can upload marketplace originals',
        'Admins can update marketplace originals',
        'Admins can delete marketplace originals'
      )
      and (
        case cmd
          when 'INSERT' then coalesce(with_check, '')
          when 'DELETE' then coalesce(qual, '')
          else coalesce(qual, '') || ' ' || coalesce(with_check, '')
        end
      ) ~* 'marketplace-originals'
  ) then
    raise exception 'An unrecognized write policy references marketplace-originals. Review it manually; no changes have been made.';
  end if;
end
$preflight$;

alter table public.assets
  add column if not exists preview_storage_path text;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  checkout_session_id text unique,
  payment_intent_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'free', 'cancelled', 'failed')),
  currency text not null default 'usd' check (char_length(currency) = 3),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  asset_title text not null check (char_length(asset_title) between 1 and 160),
  storage_path text not null check (storage_path like 'originals/%'),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists orders_user_status_created_idx
  on public.orders (user_id, status, created_at desc);
create index if not exists order_items_order_asset_idx
  on public.order_items (order_id, asset_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

do $orders_policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and policyname = 'Users can read their own orders'
  ) then
    execute $policy$
      create policy "Users can read their own orders"
        on public.orders for select to authenticated
        using (user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and policyname = 'Admins can read all orders'
  ) then
    execute $policy$
      create policy "Admins can read all orders"
        on public.orders for select to authenticated
        using (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
          or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
        )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items'
      and policyname = 'Users can read purchased order items'
  ) then
    execute $policy$
      create policy "Users can read purchased order items"
        on public.order_items for select to authenticated
        using (
          exists (
            select 1 from public.orders
            where orders.id = order_items.order_id
              and orders.user_id = auth.uid()
              and orders.status in ('paid', 'free')
          )
        )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items'
      and policyname = 'Admins can read all order items'
  ) then
    execute $policy$
      create policy "Admins can read all order items"
        on public.order_items for select to authenticated
        using (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
          or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
        )
    $policy$;
  end if;
end
$orders_policies$;

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

do $storage_policies$
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
$storage_policies$;