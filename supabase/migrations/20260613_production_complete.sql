-- =============================================================================
-- SNAKITOS PRODUCTION SCHEMA — COMPLETE MIGRATION
-- Run after: 20260613_admin_backend_foundation.sql
-- Idempotent: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- ADMIN AUTH TABLES (used by apps/admin/src/lib/auth.ts)
-- ---------------------------------------------------------------------------

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  permissions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_roles (key, label, permissions_json)
values
  ('owner',           'Owner',           '["*"]'::jsonb),
  ('admin',           'Admin',           '["dashboard.view","sources.view","sources.create","sources.update","sources.delete","training.start","training.retry","crawler.run","shopify.sync","faq.create","faq.publish","chunks.update","playground.run","prompts.create","prompts.approve","prompts.publish","prompts.rollback","model_settings.update","tickets.update","users.manage","audit.view"]'::jsonb),
  ('support_agent',   'Support Agent',   '["dashboard.view","sources.view","playground.run","tickets.update","faq.create"]'::jsonb),
  ('content_manager', 'Content Manager', '["dashboard.view","sources.view","sources.create","sources.update","training.start","training.retry","crawler.run","shopify.sync","faq.create","faq.publish","chunks.update","playground.run","prompts.create","prompts.approve","prompts.publish","prompts.rollback","model_settings.update"]'::jsonb),
  ('viewer',          'Viewer',          '["dashboard.view","sources.view"]'::jsonb)
on conflict (key) do nothing;

create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  full_name     text not null default '',
  password_hash text not null,
  role_id       uuid references public.admin_roles(id) on delete set null,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AUDIT LOGS (dual-table — audit_logs for compatibility, admin_audit_logs new)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.admins(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid references public.admins(id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       text,
  old_value_json  jsonb,
  new_value_json  jsonb,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value_json  jsonb not null default '{}'::jsonb,
  description text,
  created_by  uuid references public.admins(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- KNOWLEDGE: LEGACY COMPAT TABLES (used by chatbot & existing admin routes)
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_documents (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  category            text not null default 'General FAQ',
  content             text,
  source_type         text not null default 'manual',
  priority            text not null default 'medium',
  status              text not null default 'draft',
  chunk_count         integer not null default 0,
  pinecone_namespace  text,
  summary             text,
  file_url            text,
  metadata            jsonb not null default '{}'::jsonb,
  created_by          uuid references public.admins(id) on delete set null,
  updated_by          uuid references public.admins(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid references public.knowledge_documents(id) on delete cascade,
  uploaded_file_id  uuid,
  chunk_index       integer not null default 0,
  content           text not null,
  token_estimate    integer not null default 0,
  embedding         vector(1536),
  embedding_status  text not null default 'pending',
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id                uuid primary key default gen_random_uuid(),
  file_name         text not null,
  file_type         text not null,
  storage_path      text not null,
  file_size         bigint not null default 0,
  uploaded_by       uuid references public.admins(id) on delete set null,
  document_id       uuid references public.knowledge_documents(id) on delete set null,
  extraction_status text not null default 'pending',
  embedding_status  text not null default 'pending',
  chunk_count       integer not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- KNOWLEDGE: NEW PRODUCTION TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_sources (
  id                uuid primary key default gen_random_uuid(),
  source_type       text not null,
  category          text,
  name              text not null,
  url               text,
  file_path         text,
  mime_type         text,
  file_size         bigint,
  content_hash      text,
  status            text not null default 'waiting',
  trusted           boolean not null default true,
  priority          text not null default 'medium',
  language          text,
  chunk_size        integer,
  chunk_overlap     integer,
  embedding_model   text,
  last_ingested_at  timestamptz,
  last_embedded_at  timestamptz,
  last_crawled_at   timestamptz,
  last_synced_at    timestamptz,
  chunk_count       integer not null default 0,
  embedding_count   integer not null default 0,
  retrieval_count   bigint not null default 0,
  last_used_at      timestamptz,
  error_message     text,
  created_by        uuid references public.admins(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references public.knowledge_sources(id) on delete set null,
  document_id       uuid references public.knowledge_documents(id) on delete set null,
  parent_job_id     uuid references public.ingestion_jobs(id) on delete set null,
  job_type          text not null default 'file_ingest',
  status            text not null default 'queued',
  current_step      text,
  progress          numeric(5,2) not null default 0,
  retry_count       integer not null default 0,
  started_at        timestamptz,
  completed_at      timestamptz,
  failed_at         timestamptz,
  duration_ms       bigint,
  chunks_created    integer not null default 0,
  embeddings_created integer not null default 0,
  warnings_json     jsonb,
  error_message     text,
  logs_json         jsonb,
  created_by        uuid references public.admins(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.rag_chunks (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references public.knowledge_sources(id) on delete cascade,
  chunk_text       text not null,
  chunk_index      integer not null default 0,
  token_count      integer not null default 0,
  chunk_size       integer,
  overlap          integer,
  embedding_model  text,
  vector_id        text,
  metadata_json    jsonb not null default '{}'::jsonb,
  content_hash     text,
  status           text not null default 'indexed',
  trusted          boolean not null default true,
  stale            boolean not null default false,
  duplicate        boolean not null default false,
  pinned           boolean not null default false,
  retrieval_count  bigint not null default 0,
  last_retrieved_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CRAWLED PAGES
-- ---------------------------------------------------------------------------

create table if not exists public.crawled_pages (
  id              uuid primary key default gen_random_uuid(),
  url             text not null,
  title           text,
  content         text,
  content_hash    text,
  status          text not null default 'success',
  http_status     integer,
  last_crawled_at timestamptz not null default now(),
  source_id       uuid references public.knowledge_sources(id) on delete set null,
  error_message   text,
  metadata_json   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SHOPIFY
-- ---------------------------------------------------------------------------

create table if not exists public.shopify_products (
  id                uuid primary key default gen_random_uuid(),
  product_id        text unique not null,
  title             text not null,
  handle            text not null,
  description       text,
  price             numeric(12,2),
  variants          jsonb not null default '[]'::jsonb,
  images            jsonb not null default '[]'::jsonb,
  collection        text,
  tags              jsonb not null default '[]'::jsonb,
  stock_status      text,
  product_url       text,
  content_hash      text,
  include_in_bot    boolean not null default true,
  source_updated_at timestamptz,
  last_synced_at    timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.shopify_sync_logs (
  id                 uuid primary key default gen_random_uuid(),
  sync_type          text not null default 'products',
  status             text not null default 'running',
  records_processed  integer not null default 0,
  records_changed    integer not null default 0,
  records_failed     integer not null default 0,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  duration_ms        bigint,
  message            text,
  error_message      text,
  triggered_by       uuid references public.admins(id) on delete set null,
  payload            jsonb not null default '{}'::jsonb
);

create table if not exists public.shopify_sync_jobs (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'running',
  records_synced    integer not null default 0,
  records_changed   integer not null default 0,
  records_failed    integer not null default 0,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  error_message     text,
  triggered_by      uuid references public.admins(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CHATBOT CORE TABLES (used by apps/chatbot)
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid references public.chats(id) on delete cascade,
  role       text not null,
  content    text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CHATBOT ADMIN MIRROR TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.chat_sessions (
  id               uuid primary key default gen_random_uuid(),
  session_id       text unique not null,
  user_identifier  text,
  page_url         text,
  language         text,
  handoff_status   text not null default 'none',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references public.chat_sessions(id) on delete cascade,
  user_message        text,
  ai_response         text,
  detected_intent     text,
  retrieved_sources   jsonb,
  is_failed_answer    boolean not null default false,
  marked_for_review   boolean not null default false,
  assigned_admin_id   uuid references public.admins(id) on delete set null,
  review_notes        text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- HANDOFF / TICKETS
-- ---------------------------------------------------------------------------

create table if not exists public.handoff_tickets (
  id                  uuid primary key default gen_random_uuid(),
  ticket_number       text unique not null default ('TKT-' || upper(substring(gen_random_uuid()::text, 1, 8))),
  session_id          uuid references public.chat_sessions(id) on delete set null,
  complaint_type      text not null default 'unknown_order_tracking',
  status              text not null default 'open',
  customer_identifier text,
  summary             text not null,
  proof_required      boolean not null default false,
  assigned_to         uuid references public.admins(id) on delete set null,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- New first-class tickets table
create table if not exists public.tickets (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id   uuid,
  title             text not null,
  customer_question text,
  bot_answer        text,
  recommended_reply text,
  category          text,
  priority          text not null default 'medium',
  status            text not null default 'open',
  assigned_to       uuid references public.admins(id) on delete set null,
  resolution_notes  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ANSWER TRACING & OBSERVABILITY
-- ---------------------------------------------------------------------------

create table if not exists public.answer_traces (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid references public.chat_sessions(id) on delete set null,
  user_message_id       uuid,
  bot_message_id        uuid,
  user_question         text not null,
  bot_answer            text,
  model                 text,
  prompt_version_id     uuid,
  confidence_score      numeric(6,4),
  retrieval_confidence  numeric(6,4),
  grounding_score       numeric(6,4),
  hallucination_risk    numeric(6,4),
  had_source            boolean not null default false,
  used_stale_source     boolean not null default false,
  latency_ms            integer,
  retrieval_latency_ms  integer,
  input_tokens          integer,
  output_tokens         integer,
  total_tokens          integer,
  estimated_cost        numeric(12,6),
  reviewed_status       text not null default 'unreviewed',
  created_at            timestamptz not null default now()
);

create table if not exists public.retrieved_chunks (
  id               uuid primary key default gen_random_uuid(),
  answer_trace_id  uuid references public.answer_traces(id) on delete cascade,
  chunk_id         uuid references public.knowledge_chunks(id) on delete set null,
  source_id        uuid references public.knowledge_documents(id) on delete set null,
  rank             integer,
  similarity_score numeric(8,6),
  rerank_score     numeric(8,6),
  used_in_answer   boolean not null default true,
  match_reason     text,
  created_at       timestamptz not null default now()
);

create table if not exists public.failed_answers (
  id                   uuid primary key default gen_random_uuid(),
  answer_trace_id      uuid references public.answer_traces(id) on delete set null,
  conversation_id      uuid references public.chat_sessions(id) on delete set null,
  user_question        text not null,
  bot_answer           text,
  root_cause           text not null default 'missing_source',
  severity             text not null default 'medium',
  status               text not null default 'open',
  recommended_fix      text,
  assigned_to          uuid references public.admins(id) on delete set null,
  fixed_by             uuid references public.admins(id) on delete set null,
  fixed_at             timestamptz,
  retest_status        text,
  before_confidence    numeric(6,4),
  after_confidence     numeric(6,4),
  improvement_score    numeric(6,4),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.failed_questions (
  id                  uuid primary key default gen_random_uuid(),
  question            text not null,
  category            text not null default 'general',
  frequency           integer not null default 1,
  suggested_answer    text,
  resolved            boolean not null default false,
  latest_attempt_at   timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TOKEN & MODEL USAGE
-- ---------------------------------------------------------------------------

create table if not exists public.token_usage_logs (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id   uuid references public.answer_traces(id) on delete set null,
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  embedding_tokens  integer not null default 0,
  total_tokens      integer not null default 0,
  estimated_cost    numeric(12,6) not null default 0,
  created_at        timestamptz not null default now()
);

create table if not exists public.model_usage_logs (
  id             uuid primary key default gen_random_uuid(),
  model          text not null,
  endpoint       text not null,
  status         text not null,
  latency_ms     integer,
  input_tokens   integer,
  output_tokens  integer,
  total_tokens   integer,
  estimated_cost numeric(12,6),
  error_message  text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ALERTS & SYSTEM HEALTH
-- ---------------------------------------------------------------------------

create table if not exists public.alerts (
  id                 uuid primary key default gen_random_uuid(),
  alert_type         text not null,
  severity           text not null default 'medium',
  title              text not null,
  description        text,
  affected_system    text,
  root_cause         text,
  recommended_action text,
  status             text not null default 'open',
  owner_id           uuid references public.admins(id) on delete set null,
  resolved_by        uuid references public.admins(id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id           uuid primary key default gen_random_uuid(),
  service_name text not null,
  status       text not null,
  latency_ms   integer,
  error_message text,
  checked_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- GUARDRAIL EVENTS
-- ---------------------------------------------------------------------------

create table if not exists public.guardrail_events (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id   uuid references public.answer_traces(id) on delete set null,
  guardrail_type    text not null,
  trigger_phrase    text,
  user_message      text,
  action_taken      text not null default 'blocked',
  severity          text not null default 'medium',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROMPTS
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_versions (
  id                      uuid primary key default gen_random_uuid(),
  version_label           text not null,
  system_prompt           text not null,
  fallback_message        text not null default '',
  language_rules          text not null default '',
  escalation_rules        text not null default '',
  anti_hallucination_rules text not null default '',
  status                  text not null default 'draft',
  is_active               boolean not null default false,
  approved_by             uuid references public.admins(id) on delete set null,
  approved_at             timestamptz,
  published_by            uuid references public.admins(id) on delete set null,
  published_at            timestamptz,
  created_by              uuid references public.admins(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.prompt_test_runs (
  id              uuid primary key default gen_random_uuid(),
  prompt_id       uuid references public.prompt_versions(id) on delete cascade,
  test_query      text not null,
  result          jsonb,
  pass_fail       text,
  run_by          uuid references public.admins(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- FAQ ENTRIES
-- ---------------------------------------------------------------------------

create table if not exists public.faq_entries (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  source     text not null default 'admin',
  published  boolean not null default true,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RAG TEST RUNS (used by playground)
-- ---------------------------------------------------------------------------

create table if not exists public.rag_test_cases (
  id              uuid primary key default gen_random_uuid(),
  test_name       text not null,
  user_message    text not null,
  expected_intent text,
  expected_answer text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.rag_test_runs (
  id                uuid primary key default gen_random_uuid(),
  test_case_id      uuid references public.rag_test_cases(id) on delete set null,
  actual_answer     text not null,
  retrieved_sources jsonb not null default '[]'::jsonb,
  pass_fail         text not null default 'warning',
  hallucination_risk text not null default 'medium',
  notes             text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- BOT SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.bot_settings (
  id                            uuid primary key default gen_random_uuid(),
  bot_name                      text not null default 'Snakitos AI',
  welcome_message               text not null default 'Hi! How can I help you?',
  fallback_message              text not null default 'I am not sure about that.',
  tone                          text not null default 'friendly',
  enable_order_tracking         boolean not null default true,
  enable_product_recommendations boolean not null default true,
  support_email                 text,
  support_whatsapp              text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create index if not exists idx_audit_logs_admin_id     on public.audit_logs(admin_id, created_at desc);
create index if not exists idx_audit_logs_created_at   on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action        on public.audit_logs(action);

create index if not exists idx_knowledge_documents_status    on public.knowledge_documents(status, updated_at desc);
create index if not exists idx_knowledge_documents_type      on public.knowledge_documents(source_type);
create index if not exists idx_knowledge_chunks_document     on public.knowledge_chunks(document_id, chunk_index);

create index if not exists idx_knowledge_sources_status  on public.knowledge_sources(status, updated_at desc);
create index if not exists idx_ingestion_jobs_status     on public.ingestion_jobs(status, created_at desc);
create index if not exists idx_ingestion_jobs_source     on public.ingestion_jobs(source_id);
create index if not exists idx_rag_chunks_source         on public.rag_chunks(source_id, chunk_index);

create index if not exists idx_chat_sessions_session_id  on public.chat_sessions(session_id);
create index if not exists idx_chat_messages_session     on public.chat_messages(session_id, created_at desc);
create index if not exists idx_chat_messages_failed      on public.chat_messages(is_failed_answer) where is_failed_answer = true;

create index if not exists idx_answer_traces_created     on public.answer_traces(created_at desc);
create index if not exists idx_answer_traces_conversation on public.answer_traces(conversation_id);
create index if not exists idx_token_usage_created       on public.token_usage_logs(created_at desc);
create index if not exists idx_model_usage_created       on public.model_usage_logs(created_at desc);

create index if not exists idx_failed_answers_status     on public.failed_answers(status, created_at desc);
create index if not exists idx_alerts_status             on public.alerts(status, created_at desc);
create index if not exists idx_tickets_status            on public.tickets(status, created_at desc);
create index if not exists idx_handoff_tickets_status    on public.handoff_tickets(status, created_at desc);

create index if not exists idx_shopify_products_product_id on public.shopify_products(product_id);
create index if not exists idx_shopify_sync_logs_started   on public.shopify_sync_logs(started_at desc);

create index if not exists idx_logs_event               on public.logs(event, created_at desc);
create index if not exists idx_messages_chat_id         on public.messages(chat_id, created_at asc);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — service_role full access on all tables
-- ---------------------------------------------------------------------------

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role_all_%I" on public.%I', t, t);
    execute format('create policy "service_role_all_%I" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- UNIQUE CONSTRAINTS (safe adds)
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'crawled_pages_url_key'
  ) then
    alter table public.crawled_pages add constraint crawled_pages_url_key unique (url);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- UTILITY RPC FUNCTIONS
-- ---------------------------------------------------------------------------

create or replace function public.increment_source_retrieval(p_source_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.knowledge_sources
  set retrieval_count = retrieval_count + 1,
      last_used_at = now()
  where id = p_source_id;

  -- Also try rag_chunks if referencing chunk_id
  update public.rag_chunks
  set retrieval_count = retrieval_count + 1,
      last_retrieved_at = now()
  where source_id = p_source_id
  limit 1;
end;
$$;

-- Grant execute to service_role
grant execute on function public.increment_source_retrieval(uuid) to service_role;

