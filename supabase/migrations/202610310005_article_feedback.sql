create table if not exists public.article_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete set null,
  author_name text not null check (char_length(author_name) between 2 and 80),
  content text not null check (char_length(content) between 3 and 2000),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists article_feedback_article_approved_created_idx
  on public.article_feedback (article_id, approved, created_at desc);

alter table public.article_feedback enable row level security;

drop policy if exists "Anyone can read approved article feedback" on public.article_feedback;
create policy "Anyone can read approved article feedback"
  on public.article_feedback for select
  using (approved = true);

drop policy if exists "Anyone can submit article feedback" on public.article_feedback;
create policy "Anyone can submit article feedback"
  on public.article_feedback for insert to anon, authenticated
  with check (
    approved = false
    and char_length(author_name) between 2 and 80
    and char_length(content) between 3 and 2000
  );

drop policy if exists "Admins can manage article feedback" on public.article_feedback;
create policy "Admins can manage article feedback"
  on public.article_feedback for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );