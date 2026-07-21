create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text,
  content text
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  name text,
  display_name text,
  preferences jsonb not null default '{}'::jsonb
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text,
  content text not null,
  embedding vector,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.conversations add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_profiles add column if not exists display_name text;
alter table public.user_profiles alter column id set default auth.uid();
update public.user_profiles
set display_name = name
where display_name is null and name is not null;

delete from public.messages
where conversation_id in (
  select id from public.conversations where user_id is null
);
delete from public.conversations where user_id is null;
delete from public.documents where user_id is null;

alter table public.conversations alter column user_id set not null;
alter table public.documents alter column user_id set not null;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_profiles enable row level security;
alter table public.documents enable row level security;

create index if not exists messages_conversation_id_idx
  on public.messages(conversation_id);

create index if not exists conversations_updated_at_idx
  on public.conversations(updated_at desc);

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations(user_id, updated_at desc);

create index if not exists documents_user_id_title_idx
  on public.documents(user_id, title);

drop policy if exists "Users can read own conversations" on public.conversations;
create policy "Users can read own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own conversations" on public.conversations;
create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversations" on public.conversations;
create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own conversations" on public.conversations;
create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own messages" on public.messages;
create policy "Users can read own messages"
  on public.messages for select
  using (
    exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert messages in own conversations" on public.messages;
create policy "Users can insert messages in own conversations"
  on public.messages for insert
  with check (
    exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete messages in own conversations" on public.messages;
create policy "Users can delete messages in own conversations"
  on public.messages for delete
  using (
    exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read own documents" on public.documents;
create policy "Users can read own documents"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own documents" on public.documents;
create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own documents" on public.documents;
create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

create or replace function public.match_documents(
  query_embedding vector,
  match_threshold float default 0.5,
  match_count int default 5,
  p_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where documents.user_id = p_user_id
    and documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
