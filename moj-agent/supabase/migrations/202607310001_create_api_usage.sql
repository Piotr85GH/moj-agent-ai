create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  tokens_input integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  model text not null,
  endpoint text not null
);

alter table public.api_usage enable row level security;

create index if not exists api_usage_user_id_created_at_idx
  on public.api_usage(user_id, created_at desc);

drop policy if exists "Users can read own api usage" on public.api_usage;
create policy "Users can read own api usage"
  on public.api_usage for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own api usage" on public.api_usage;
create policy "Users can insert own api usage"
  on public.api_usage for insert
  with check (auth.uid() = user_id);
