create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text,
  products text[] not null default '{}'::text[],
  context text,
  content text not null,
  word_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.recipes enable row level security;

create index if not exists recipes_user_id_created_at_idx
  on public.recipes(user_id, created_at desc);

create index if not exists recipes_user_id_title_idx
  on public.recipes(user_id, title);

drop policy if exists "Users can read own recipes" on public.recipes;
create policy "Users can read own recipes"
  on public.recipes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own recipes" on public.recipes;
create policy "Users can insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own recipes" on public.recipes;
create policy "Users can update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own recipes" on public.recipes;
create policy "Users can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);
