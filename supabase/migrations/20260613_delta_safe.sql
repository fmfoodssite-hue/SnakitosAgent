-- ============================================================================
-- SNAKITOS FINAL DELTA MIGRATION — v3 DEFINITIVE
-- Run this in Supabase SQL Editor (New Query → paste → Run)
-- Safe on your existing database. Never drops or truncates anything.
-- ============================================================================

-- ============================================================================
-- 1. admin_roles
-- ============================================================================
create table if not exists public.admin_roles (
  id   uuid primary key default gen_random_uuid(),
  key  text unique not null,
  label text not null,
  permissions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.admin_roles (key, label) values
  ('owner',           'Owner'),
  ('admin',           'Admin'),
  ('support_agent',   'Support Agent'),
  ('content_manager', 'Content Manager'),
  ('viewer',          'Viewer')
on conflict (key) do nothing;

-- ============================================================================
-- 2. Upgrade existing admins table
-- ============================================================================
alter table public.admins
  add column if not exists password_hash  text         not null default '',
  add column if not exists role_id        uuid         references public.admin_roles(id) on delete set null,
  add column if not exists is_active      boolean      not null default true,
  add column if not exists last_login_at  timestamptz;

-- Backfill role_id for any admin whose role column = 'admin'
update public.admins a
set role_id = r.id
from public.admin_roles r
where r.key = 'admin'
  and a.role_id is null;

-- Set the temporary password for the existing snakitosadmin account
update public.admins
set password_hash = encode(digest('SnakitosAdmin2024!', 'sha256'), 'hex')
where password_hash = '';

-- ============================================================================
-- 3. Upgrade existing chat_sessions table
--    Add only the columns that are MISSING. user_id stays NOT NULL as-is.
-- ============================================================================
alter table public.chat_sessions
  add column if not exists user_identifier  text,
  add column if not exists handoff_status   text not null default 'none',
  add column if not exists updated_at       timestamptz not null default now();

-- Let user_id accept null so the chatbot can create sessions without a DB user
alter table public.chat_sessions
  alter column user_id drop not null;

-- ============================================================================
-- 4. Upgrade existing chat_messages table
--    Add new production columns alongside the existing ones.
-- ============================================================================
alter table public.chat_messages
  add column if not exists user_message       text,
  add column if not exists detected_intent    text,
  add column if not exists retrieved_sources  jsonb,
  add column if not exists is_failed_answer   boolean not null default false,
  add column if not exists marked_for_review  boolean not null default false;

-- Widen the intent check so new intent values don't throw errors
do $$ begin
  alter table public.chat_messages drop constraint if exists chat_messages_intent_check;
exception when others then null;
end $$;

-- Widen the status check
do $$ begin
  alter table public.chat_messages drop constraint if exists chat_messages_status_check;
exception when others then null;
end $$;

-- Make user_id nullable (chatbot may not always have a Supabase user UUID)
alter table public.chat_messages
  alter column user_id drop not null;

-- ============================================================================
-- 5. Upgrade existing knowledge_documents table
-- ============================================================================
do $$ begin
  alter table public.knowledge_documents drop constraint if exists knowledge_documents_status_check;
exception when others then null;
end $$;

do $$ begin
  alter table public.knowledge_documents drop constraint if exists knowledge_documents_source_type_check;
exception when others then null;
end $$;

alter table public.knowledge_documents
  add column if not exists category    text not null default 'General FAQ',
  add column if not exists priority    text not null default 'medium',
  add column if not exists metadata    jsonb not null default '{}'::jsonb,
  add column if not exists updated_by  uuid;

-- ============================================================================
-- 6. Upgrade existing shopify_sync_logs table
-- ============================================================================
alter table public.shopify_sync_logs
  add column if not exists records_changed  integer not null default 0,
  add column if not exists records_failed   integer not null default 0,
  add column if not exists triggered_by     uuid,
  add column if not exists duration_ms      bigint,
  add column if not exists error_message    text;

do $$ begin
  alter table public.shopify_sync_logs drop constraint if exists shopify_sync_logs_status_check;
exception when others then null;
end $$;

do $$ begin
  alter table public.shopify_sync_logs drop constraint if exists shopify_sync_logs_sync_type_check;
exception when others then null;
end $$;

-- ============================================================================
-- 7. NEW TABLES
-- ============================================================================

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid,
  action         text not null,
  entity_type    text not null,
  entity_id      text,
  old_value_json jsonb,
  new_value_json jsonb,
  ip_address     text,
  created_at     timestamptz not null default now()
);

create table if not exists public.settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value_json  jsonb not null default '{}'::jsonb,
  description text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id                uuid primary key default gen_random_uuid(),
  file_name         text not null,
  file_type         text not null,
  storage_path      text not null,
  file_size         bigint not null default 0,
  uploaded_by       uuid,
  document_id       uuid references public.knowledge_documents(id) on delete set null,
  extraction_status text not null default 'pending',
  embedding_status  text not null default 'pending',
  chunk_count       integer not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid references public.knowledge_documents(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  chunk_index      integer not null default 0,
  content          text not null,
  token_estimate   integer not null default 0,
  embedding_status text not null default 'pending',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.knowledge_sources (
  id               uuid primary key default gen_random_uuid(),
  source_type      text not null,
  category         text,
  name             text not null,
  url              text,
  file_path        text,
  content_hash     text,
  status           text not null default 'waiting',
  trusted          boolean not null default true,
  priority         text not null default 'medium',
  language         text,
  chunk_count      integer not null default 0,
  embedding_count  integer not null default 0,
  retrieval_count  bigint not null default 0,
  last_used_at     timestamptz,
  last_ingested_at timestamptz,
  last_synced_at   timestamptz,
  error_message    text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id                 uuid primary key default gen_random_uuid(),
  source_id          uuid references public.knowledge_sources(id) on delete set null,
  document_id        uuid references public.knowledge_documents(id) on delete set null,
  parent_job_id      uuid references public.ingestion_jobs(id) on delete set null,
  job_type           text not null default 'file_ingest',
  status             text not null default 'queued',
  current_step       text,
  progress           numeric(5,2) not null default 0,
  retry_count        integer not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  failed_at          timestamptz,
  duration_ms        bigint,
  chunks_created     integer not null default 0,
  embeddings_created integer not null default 0,
  warnings_json      jsonb,
  error_message      text,
  logs_json          jsonb,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.rag_chunks (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references public.knowledge_sources(id) on delete cascade,
  chunk_text        text not null,
  chunk_index       integer not null default 0,
  token_count       integer not null default 0,
  vector_id         text,
  metadata_json     jsonb not null default '{}'::jsonb,
  content_hash      text,
  status            text not null default 'indexed',
  retrieval_count   bigint not null default 0,
  last_retrieved_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crawled_pages_url_key') then
    alter table public.crawled_pages add constraint crawled_pages_url_key unique (url);
  end if;
end $$;

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
  last_synced_at    timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.shopify_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'running',
  records_synced  integer not null default 0,
  records_changed integer not null default 0,
  records_failed  integer not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  error_message   text,
  triggered_by    uuid,
  created_at      timestamptz not null default now()
);

create table if not exists public.handoff_tickets (
  id                  uuid primary key default gen_random_uuid(),
  ticket_number       text unique not null default ('TKT-' || upper(substring(gen_random_uuid()::text, 1, 8))),
  chat_session_id     uuid references public.chat_sessions(id) on delete set null,
  complaint_type      text not null default 'general',
  status              text not null default 'open',
  customer_identifier text,
  summary             text not null default '',
  proof_required      boolean not null default false,
  assigned_to         uuid,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.tickets (
  id                uuid primary key default gen_random_uuid(),
  chat_session_id   uuid references public.chat_sessions(id) on delete set null,
  title             text not null,
  customer_question text,
  bot_answer        text,
  recommended_reply text,
  category          text,
  priority          text not null default 'medium',
  status            text not null default 'open',
  assigned_to       uuid,
  resolution_notes  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.answer_traces (
  id                   uuid primary key default gen_random_uuid(),
  chat_session_id      uuid references public.chat_sessions(id) on delete set null,
  user_question        text not null,
  bot_answer           text,
  model                text,
  confidence_score     numeric(6,4),
  retrieval_confidence numeric(6,4),
  grounding_score      numeric(6,4),
  hallucination_risk   numeric(6,4),
  had_source           boolean not null default false,
  used_stale_source    boolean not null default false,
  latency_ms           integer,
  retrieval_latency_ms integer,
  input_tokens         integer,
  output_tokens        integer,
  total_tokens         integer,
  estimated_cost       numeric(12,6),
  reviewed_status      text not null default 'unreviewed',
  created_at           timestamptz not null default now()
);

create table if not exists public.retrieved_chunks (
  id              uuid primary key default gen_random_uuid(),
  answer_trace_id uuid references public.answer_traces(id) on delete cascade,
  chunk_id        uuid references public.knowledge_chunks(id) on delete set null,
  source_id       uuid references public.knowledge_documents(id) on delete set null,
  rank            integer,
  similarity_score numeric(8,6),
  used_in_answer  boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.failed_answers (
  id               uuid primary key default gen_random_uuid(),
  answer_trace_id  uuid references public.answer_traces(id) on delete set null,
  chat_session_id  uuid references public.chat_sessions(id) on delete set null,
  user_question    text not null,
  bot_answer       text,
  root_cause       text not null default 'missing_source',
  severity         text not null default 'medium',
  status           text not null default 'open',
  recommended_fix  text,
  assigned_to      uuid,
  before_confidence numeric(6,4),
  after_confidence  numeric(6,4),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.token_usage_logs (
  id               uuid primary key default gen_random_uuid(),
  chat_session_id  uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id  uuid references public.answer_traces(id) on delete set null,
  model            text not null,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  embedding_tokens integer not null default 0,
  total_tokens     integer not null default 0,
  estimated_cost   numeric(12,6) not null default 0,
  created_at       timestamptz not null default now()
);

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
  owner_id           uuid,
  resolved_by        uuid,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id            uuid primary key default gen_random_uuid(),
  service_name  text not null,
  status        text not null,
  latency_ms    integer,
  error_message text,
  checked_at    timestamptz not null default now()
);

create table if not exists public.guardrail_events (
  id               uuid primary key default gen_random_uuid(),
  chat_session_id  uuid references public.chat_sessions(id) on delete set null,
  answer_trace_id  uuid references public.answer_traces(id) on delete set null,
  guardrail_type   text not null,
  user_message     text,
  action_taken     text not null default 'blocked',
  severity         text not null default 'medium',
  created_at       timestamptz not null default now()
);

create table if not exists public.prompt_versions (
  id                       uuid primary key default gen_random_uuid(),
  version_label            text not null,
  system_prompt            text not null,
  fallback_message         text not null default '',
  language_rules           text not null default '',
  escalation_rules         text not null default '',
  anti_hallucination_rules text not null default '',
  status                   text not null default 'draft',
  is_active                boolean not null default false,
  approved_by              uuid,
  approved_at              timestamptz,
  published_by             uuid,
  published_at             timestamptz,
  created_by               uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.prompt_test_runs (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid references public.prompt_versions(id) on delete cascade,
  test_query text not null,
  result     jsonb,
  pass_fail  text,
  run_by     uuid,
  created_at timestamptz not null default now()
);

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
  id                 uuid primary key default gen_random_uuid(),
  test_case_id       uuid references public.rag_test_cases(id) on delete set null,
  actual_answer      text not null,
  retrieved_sources  jsonb not null default '[]'::jsonb,
  pass_fail          text not null default 'warning',
  hallucination_risk text not null default 'medium',
  notes              text,
  created_at         timestamptz not null default now()
);

-- ============================================================================
-- 8. INDEXES
-- ============================================================================
create index if not exists idx_audit_logs_created_at      on public.audit_logs(created_at desc);
create index if not exists idx_knowledge_sources_status    on public.knowledge_sources(status);
create index if not exists idx_ingestion_jobs_status       on public.ingestion_jobs(status, created_at desc);
create index if not exists idx_answer_traces_created       on public.answer_traces(created_at desc);
create index if not exists idx_answer_traces_session       on public.answer_traces(chat_session_id);
create index if not exists idx_token_usage_created         on public.token_usage_logs(created_at desc);
create index if not exists idx_failed_answers_status       on public.failed_answers(status, created_at desc);
create index if not exists idx_alerts_status               on public.alerts(status, created_at desc);
create index if not exists idx_handoff_tickets_status      on public.handoff_tickets(status, created_at desc);
create index if not exists idx_shopify_products_product_id on public.shopify_products(product_id);
create index if not exists idx_prompt_versions_active      on public.prompt_versions(is_active);

-- ============================================================================
-- 9. RLS — service_role full access on ALL new tables
-- ============================================================================
do $$ declare t text; begin
  for t in select unnest(array[
    'admin_roles','audit_logs','admin_audit_logs','settings',
    'uploaded_files','knowledge_chunks','knowledge_sources','ingestion_jobs','rag_chunks',
    'crawled_pages','shopify_products','shopify_sync_jobs',
    'handoff_tickets','tickets',
    'answer_traces','retrieved_chunks','failed_answers',
    'token_usage_logs','alerts','system_health_checks','guardrail_events',
    'prompt_versions','prompt_test_runs','rag_test_cases','rag_test_runs'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role_all_%I" on public.%I', t, t);
    execute format(
      'create policy "service_role_all_%I" on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- 10. RPC FUNCTION
-- ============================================================================
create or replace function public.increment_source_retrieval(p_source_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.knowledge_sources
  set retrieval_count = retrieval_count + 1, last_used_at = now()
  where id = p_source_id;
end;
$$;

grant execute on function public.increment_source_retrieval(uuid) to service_role;
