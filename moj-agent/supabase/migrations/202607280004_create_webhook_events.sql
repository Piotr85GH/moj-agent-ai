create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('feedback', 'alert', 'order')),
  data jsonb not null default '{}'::jsonb,
  analysis text not null
);

alter table public.webhook_events enable row level security;

create index if not exists webhook_events_created_at_idx
  on public.webhook_events(created_at desc);

create index if not exists webhook_events_type_created_at_idx
  on public.webhook_events(type, created_at desc);
