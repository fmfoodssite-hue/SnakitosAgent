create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  permissions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.roles (name, permissions_json)
values
  ('Owner', '["*"]'::jsonb),
  ('Admin', '["dashboard.view","sources.view","sources.create","sources.update","training.start","crawler.run","shopify.sync","faq.create","faq.publish","playground.run","prompts.create","prompts.approve","prompts.publish","prompts.rollback","model_settings.update","tickets.update","users.manage","audit.view"]'::jsonb),
  ('Support Agent', '["dashboard.view","sources.view","playground.run","tickets.update","faq.create"]'::jsonb),
  ('Content Manager', '["dashboard.view","sources.view","sources.create","sources.update","training.start","crawler.run","shopify.sync","faq.create","faq.publish","playground.run","prompts.create","prompts.approve","prompts.publish","prompts.rollback","model_settings.update"]'::jsonb),
  ('Viewer', '["dashboard.view","sources.view"]'::jsonb)
on conflict (name) do nothing;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  full_name text not null default '',
  email text unique not null,
  avatar_url text,
  role_id uuid references public.roles(id),
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value_json jsonb,
  new_value_json jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  category text,
  name text not null,
  url text,
  file_path text,
  mime_type text,
  file_size bigint,
  content_hash text,
  status text not null default 'waiting',
  trusted boolean not null default true,
  priority text not null default 'medium',
  language text,
  chunk_size integer,
  chunk_overlap integer,
  embedding_model text,
  last_ingested_at timestamptz,
  last_embedded_at timestamptz,
  last_crawled_at timestamptz,
  last_synced_at timestamptz,
  chunk_count integer not null default 0,
  embedding_count integer not null default 0,
  retrieval_count bigint not null default 0,
  last_used_at timestamptz,
  error_message text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  parent_job_id uuid references public.ingestion_jobs(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  current_step text,
  progress numeric(5,2) not null default 0,
  retry_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  duration_ms bigint,
  chunks_created integer not null default 0,
  embeddings_created integer not null default 0,
  warnings_json jsonb,
  error_message text,
  logs_json jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  chunk_text text not null,
  chunk_index integer not null default 0,
  token_count integer not null default 0,
  chunk_size integer,
  overlap integer,
  embedding_model text,
  vector_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  content_hash text,
  status text not null default 'indexed',
  trusted boolean not null default true,
  stale boolean not null default false,
  duplicate boolean not null default false,
  pinned boolean not null default false,
  retrieval_count bigint not null default 0,
  last_retrieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.answer_traces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  user_message_id uuid,
  bot_message_id uuid,
  user_question text not null,
  bot_answer text,
  model text,
  prompt_version_id uuid,
  confidence_score numeric(6,4),
  retrieval_confidence numeric(6,4),
  grounding_score numeric(6,4),
  hallucination_risk numeric(6,4),
  had_source boolean not null default false,
  used_stale_source boolean not null default false,
  latency_ms integer,
  retrieval_latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost numeric(12,6),
  reviewed_status text not null default 'unreviewed',
  created_at timestamptz not null default now()
);

create table if not exists public.retrieved_chunks (
  id uuid primary key default gen_random_uuid(),
  answer_trace_id uuid references public.answer_traces(id) on delete cascade,
  chunk_id uuid references public.rag_chunks(id) on delete set null,
  source_id uuid references public.knowledge_sources(id) on delete set null,
  rank integer,
  similarity_score numeric(8,6),
  rerank_score numeric(8,6),
  used_in_answer boolean not null default true,
  match_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.failed_answers (
  id uuid primary key default gen_random_uuid(),
  answer_trace_id uuid references public.answer_traces(id) on delete set null,
  conversation_id uuid,
  user_question text not null,
  bot_answer text,
  root_cause text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  recommended_fix text,
  assigned_to uuid references public.users(id),
  fixed_by uuid references public.users(id),
  fixed_at timestamptz,
  retest_status text,
  before_confidence numeric(6,4),
  after_confidence numeric(6,4),
  improvement_score numeric(6,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  answer_trace_id uuid references public.answer_traces(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  embedding_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.model_usage_logs (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  endpoint text not null,
  status text not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost numeric(12,6),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null,
  title text not null,
  description text,
  affected_system text,
  root_cause text,
  recommended_action text,
  status text not null default 'open',
  owner_id uuid references public.users(id),
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  answer_trace_id uuid references public.answer_traces(id) on delete set null,
  title text not null,
  customer_question text,
  bot_answer text,
  recommended_reply text,
  category text,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references public.users(id),
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  status text not null,
  latency_ms integer,
  error_message text,
  checked_at timestamptz not null default now()
);

create index if not exists idx_knowledge_sources_status on public.knowledge_sources(status, updated_at desc);
create index if not exists idx_ingestion_jobs_status on public.ingestion_jobs(status, created_at desc);
create index if not exists idx_rag_chunks_source on public.rag_chunks(source_id, chunk_index);
create index if not exists idx_answer_traces_created on public.answer_traces(created_at desc);
create index if not exists idx_token_usage_logs_created on public.token_usage_logs(created_at desc);
create index if not exists idx_alerts_status on public.alerts(status, created_at desc);
create index if not exists idx_tickets_status on public.tickets(status, created_at desc);

