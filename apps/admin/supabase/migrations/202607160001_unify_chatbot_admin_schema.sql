create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'bot', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.chat_sessions
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists source text not null default 'chatbot',
  add column if not exists started_at timestamptz not null default timezone('utc', now());

alter table public.chat_messages
  add column if not exists intent text,
  add column if not exists status text not null default 'success',
  add column if not exists confidence_score numeric(5, 4) not null default 0.7500,
  add column if not exists response_time_ms integer not null default 0,
  add column if not exists retrieved_context jsonb not null default '[]'::jsonb,
  add column if not exists user_query text;

alter table public.answer_traces
  add column if not exists chat_session_id uuid references public.chat_sessions(id) on delete set null,
  add column if not exists user_question text,
  add column if not exists bot_answer text,
  add column if not exists confidence_score numeric(5, 4),
  add column if not exists retrieval_confidence numeric(5, 4),
  add column if not exists grounding_score numeric(5, 4),
  add column if not exists hallucination_risk numeric(5, 4),
  add column if not exists had_source boolean not null default false,
  add column if not exists used_stale_source boolean not null default false,
  add column if not exists retrieval_latency_ms integer not null default 0,
  add column if not exists total_tokens integer not null default 0,
  add column if not exists estimated_cost numeric(12, 6) not null default 0,
  add column if not exists reviewed_status text not null default 'unreviewed';

alter table public.token_usage_logs
  add column if not exists chat_session_id uuid references public.chat_sessions(id) on delete set null,
  add column if not exists answer_trace_id uuid references public.answer_traces(id) on delete set null,
  add column if not exists embedding_tokens integer not null default 0,
  add column if not exists estimated_cost numeric(12, 6) not null default 0;

alter table public.failed_answers
  alter column user_message drop not null,
  add column if not exists answer_trace_id uuid references public.answer_traces(id) on delete set null,
  add column if not exists chat_session_id uuid references public.chat_sessions(id) on delete set null,
  add column if not exists user_question text,
  add column if not exists bot_answer text,
  add column if not exists root_cause text,
  add column if not exists severity text not null default 'medium',
  add column if not exists recommended_fix text,
  add column if not exists before_confidence numeric(5, 4);

create table if not exists public.guardrail_events (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id uuid references public.answer_traces(id) on delete set null,
  guardrail_type text not null,
  user_message text not null,
  action_taken text not null default 'blocked',
  severity text not null default 'medium',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_phone on public.users(phone);
create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_messages_chat_id_created on public.messages(chat_id, created_at);
create index if not exists idx_logs_event_created on public.logs(event, created_at desc);
create index if not exists idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_started_at on public.chat_sessions(started_at desc);
create index if not exists idx_answer_traces_chat_session_id on public.answer_traces(chat_session_id);
create index if not exists idx_token_usage_logs_chat_session_id on public.token_usage_logs(chat_session_id);
create index if not exists idx_failed_answers_chat_session_id on public.failed_answers(chat_session_id);
create index if not exists idx_guardrail_events_chat_session_id on public.guardrail_events(chat_session_id);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists set_chats_updated_at on public.chats;
create trigger set_chats_updated_at before update on public.chats for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.logs enable row level security;
alter table public.guardrail_events enable row level security;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

drop policy if exists "service role full access users" on public.users;
create policy "service role full access users" on public.users for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access chats" on public.chats;
create policy "service role full access chats" on public.chats for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access messages" on public.messages;
create policy "service role full access messages" on public.messages for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access logs" on public.logs;
create policy "service role full access logs" on public.logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access guardrail_events" on public.guardrail_events;
create policy "service role full access guardrail_events" on public.guardrail_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
