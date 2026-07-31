create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_key text,
  user_name text,
  created_at timestamptz not null default now(),
  message text not null,
  reason text not null,
  blocked boolean not null default false,
  endpoint text not null default '/api/chat'
);

alter table public.api_usage add column if not exists user_name text;
alter table public.message_logs add column if not exists user_name text;

update public.api_usage
set user_name = user_profiles.name
from public.user_profiles
where api_usage.user_id = user_profiles.id
  and api_usage.user_name is null
  and user_profiles.name is not null;

update public.message_logs
set user_name = user_profiles.name
from public.user_profiles
where message_logs.user_id = user_profiles.id
  and message_logs.user_name is null
  and user_profiles.name is not null;

alter table public.message_logs enable row level security;

create index if not exists message_logs_blocked_created_at_idx
  on public.message_logs(blocked, created_at desc);

create index if not exists message_logs_user_key_created_at_idx
  on public.message_logs(user_key, created_at desc);

drop policy if exists "Anyone can insert message logs" on public.message_logs;
create policy "Anyone can insert message logs"
  on public.message_logs for insert
  with check (true);

drop policy if exists "Authenticated users can read message logs" on public.message_logs;
create policy "Authenticated users can read message logs"
  on public.message_logs for select
  to authenticated
  using (true);

drop policy if exists "Users can read own api usage" on public.api_usage;
drop policy if exists "Authenticated users can read api usage" on public.api_usage;
create policy "Authenticated users can read api usage"
  on public.api_usage for select
  to authenticated
  using (true);

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Authenticated users can read user profiles" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);
