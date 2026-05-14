create extension if not exists "pgcrypto";

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  session_duration_sec integer,
  query_count integer not null default 0,
  returning_user boolean not null default false,
  source text default 'chatbot',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  user_query text,
  ai_response text,
  intent text not null default 'general' check (intent in ('product', 'order', 'general')),
  status text not null default 'success' check (status in ('success', 'failure')),
  confidence_score numeric(4, 3) not null default 0.750,
  response_time_ms integer not null default 0,
  retrieved_context jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.failed_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null default 'general',
  frequency integer not null default 1,
  suggested_answer text,
  resolved boolean not null default false,
  latest_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  source text not null default 'admin',
  published boolean not null default true,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  source_type text not null default 'manual' check (source_type in ('shopify', 'pdf', 'faq', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'indexed', 'error')),
  chunk_count integer not null default 0,
  pinecone_namespace text,
  summary text,
  file_url text,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopify_sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null check (sync_type in ('products', 'orders', 'customers', 'webhook')),
  status text not null check (status in ('running', 'success', 'failed')),
  records_processed integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.bot_settings (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null,
  welcome_message text not null,
  fallback_message text not null,
  tone text not null default 'friendly' check (tone in ('friendly', 'professional')),
  enable_order_tracking boolean not null default true,
  enable_product_recommendations boolean not null default true,
  support_email text,
  support_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade,
  event_name text not null,
  label text,
  value numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admins_email on public.admins(email);
create index if not exists idx_chat_sessions_user on public.chat_sessions(user_id);
create index if not exists idx_chat_messages_session on public.chat_messages(session_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages(created_at desc);
create index if not exists idx_chat_messages_intent on public.chat_messages(intent);
create index if not exists idx_chat_messages_status on public.chat_messages(status);
create index if not exists idx_failed_questions_resolved on public.failed_questions(resolved);
create index if not exists idx_knowledge_documents_status on public.knowledge_documents(status);
create index if not exists idx_shopify_sync_logs_started_at on public.shopify_sync_logs(started_at desc);
create index if not exists idx_analytics_events_event_name on public.analytics_events(event_name);
create index if not exists idx_analytics_events_created_at on public.analytics_events(created_at desc);

alter table public.admins enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.failed_questions enable row level security;
alter table public.faq_entries enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.shopify_sync_logs enable row level security;
alter table public.bot_settings enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "service role full access admins" on public.admins;
drop policy if exists "service role full access chat_sessions" on public.chat_sessions;
drop policy if exists "service role full access chat_messages" on public.chat_messages;
drop policy if exists "service role full access failed_questions" on public.failed_questions;
drop policy if exists "service role full access faq_entries" on public.faq_entries;
drop policy if exists "service role full access knowledge_documents" on public.knowledge_documents;
drop policy if exists "service role full access shopify_sync_logs" on public.shopify_sync_logs;
drop policy if exists "service role full access bot_settings" on public.bot_settings;
drop policy if exists "service role full access analytics_events" on public.analytics_events;
drop policy if exists "admins can read admins table" on public.admins;
drop policy if exists "admins can read chat_sessions" on public.chat_sessions;
drop policy if exists "admins can read chat_messages" on public.chat_messages;
drop policy if exists "admins can read failed_questions" on public.failed_questions;
drop policy if exists "admins can read faq_entries" on public.faq_entries;
drop policy if exists "admins can read knowledge_documents" on public.knowledge_documents;
drop policy if exists "admins can read shopify_sync_logs" on public.shopify_sync_logs;
drop policy if exists "admins can read bot_settings" on public.bot_settings;
drop policy if exists "admins can read analytics_events" on public.analytics_events;

create policy "service role full access admins"
on public.admins for all to service_role
using (true) with check (true);

create policy "service role full access chat_sessions"
on public.chat_sessions for all to service_role
using (true) with check (true);

create policy "service role full access chat_messages"
on public.chat_messages for all to service_role
using (true) with check (true);

create policy "service role full access failed_questions"
on public.failed_questions for all to service_role
using (true) with check (true);

create policy "service role full access faq_entries"
on public.faq_entries for all to service_role
using (true) with check (true);

create policy "service role full access knowledge_documents"
on public.knowledge_documents for all to service_role
using (true) with check (true);

create policy "service role full access shopify_sync_logs"
on public.shopify_sync_logs for all to service_role
using (true) with check (true);

create policy "service role full access bot_settings"
on public.bot_settings for all to service_role
using (true) with check (true);

create policy "service role full access analytics_events"
on public.analytics_events for all to service_role
using (true) with check (true);

create policy "admins can read admins table"
on public.admins for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read chat_sessions"
on public.chat_sessions for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read chat_messages"
on public.chat_messages for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read failed_questions"
on public.failed_questions for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read faq_entries"
on public.faq_entries for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read knowledge_documents"
on public.knowledge_documents for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read shopify_sync_logs"
on public.shopify_sync_logs for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read bot_settings"
on public.bot_settings for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));

create policy "admins can read analytics_events"
on public.analytics_events for select to authenticated
using (exists (
  select 1 from public.admins a
  where a.id = auth.uid() and a.role = 'admin'
));
