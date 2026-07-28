create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  date date not null,
  user_id uuid references auth.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.briefings enable row level security;

create index if not exists briefings_date_idx
  on public.briefings(date desc);

create index if not exists briefings_user_id_date_idx
  on public.briefings(user_id, date desc);

drop policy if exists "Cron can insert briefings" on public.briefings;
drop policy if exists "Users can insert own briefings" on public.briefings;
create policy "Users can insert own briefings"
  on public.briefings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own briefings" on public.briefings;
create policy "Users can read own briefings"
  on public.briefings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own briefings" on public.briefings;
create policy "Users can delete own briefings"
  on public.briefings for delete
  using (auth.uid() = user_id);
