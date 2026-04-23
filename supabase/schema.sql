create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'bot')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_messages_chat_id on public.messages(chat_id);
create index if not exists idx_logs_event on public.logs(event);
create index if not exists idx_knowledge_documents_title on public.knowledge_documents(title);

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.logs enable row level security;
alter table public.knowledge_documents enable row level security;

drop policy if exists "service role full access users" on public.users;
drop policy if exists "service role full access chats" on public.chats;
drop policy if exists "service role full access messages" on public.messages;
drop policy if exists "service role full access logs" on public.logs;
drop policy if exists "service role full access knowledge" on public.knowledge_documents;

create policy "service role full access users"
on public.users
for all
to service_role
using (true)
with check (true);

create policy "service role full access chats"
on public.chats
for all
to service_role
using (true)
with check (true);

create policy "service role full access messages"
on public.messages
for all
to service_role
using (true)
with check (true);

create policy "service role full access logs"
on public.logs
for all
to service_role
using (true)
with check (true);

create policy "service role full access knowledge"
on public.knowledge_documents
for all
to service_role
using (true)
with check (true);
