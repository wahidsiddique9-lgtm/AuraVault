alter table public.articles
  add column if not exists description text not null default '',
  add column if not exists author_name text not null default 'AuraVault',
  add column if not exists cover_url text,
  add column if not exists cover_storage_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_description_length_check') then
    alter table public.articles
      add constraint articles_description_length_check check (char_length(description) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'articles_author_name_length_check') then
    alter table public.articles
      add constraint articles_author_name_length_check check (char_length(author_name) between 2 and 80);
  end if;
end
$$;