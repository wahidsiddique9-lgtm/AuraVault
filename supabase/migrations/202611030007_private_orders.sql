-- Additive database schema only. Storage is provisioned separately in
-- 202611040008_marketplace_originals.sql after its own safety preflight.
alter table public.assets
  add column if not exists preview_storage_path text;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  checkout_session_id text unique,
  payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'free', 'cancelled', 'failed')),
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

do $$
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
$$;