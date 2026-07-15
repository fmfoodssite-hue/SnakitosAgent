drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  full_name text not null,
  password_hash text not null,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.admin_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins(id) on delete cascade,
  token_hash text not null unique,
  session_id uuid not null,
  issued_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_token_id uuid references public.admin_refresh_tokens(id) on delete set null,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  category text not null default 'General FAQ',
  source_type text not null check (source_type in ('manual', 'shopify', 'pdf', 'csv', 'docx', 'faq', 'website', 'txt', 'jsonl')),
  status text not null default 'waiting',
  url text,
  language text not null default 'English',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  trusted boolean not null default true,
  chunk_count integer not null default 0,
  embedding_count integer not null default 0,
  content_hash text,
  last_ingested_at timestamptz,
  last_embedded_at timestamptz,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  title text not null,
  category text not null,
  content text not null,
  source_type text not null check (source_type in ('manual', 'shopify', 'pdf', 'csv', 'docx', 'faq', 'website', 'txt', 'jsonl')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  chunk_count integer not null default 0,
  created_by uuid references public.admins(id) on delete set null,
  updated_by uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  document_id uuid references public.knowledge_documents(id) on delete set null,
  file_name text not null,
  file_type text not null,
  storage_path text not null,
  file_size bigint not null default 0,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'processing', 'completed', 'failed')),
  chunk_count integer not null default 0,
  uploaded_by uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null default 0,
  embedding vector(1536),
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'processing', 'completed', 'failed')),
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.shopify_products (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique,
  title text not null,
  handle text not null,
  description text,
  price numeric(12, 2),
  variants jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  collection text,
  tags text[] not null default '{}',
  stock_status text,
  product_url text,
  content_hash text,
  last_synced_at timestamptz,
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.shopify_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  records_synced integer not null default 0,
  records_changed integer not null default 0,
  records_failed integer not null default 0,
  error_message text,
  triggered_by uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.shopify_sync_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.shopify_sync_jobs(id) on delete cascade,
  sync_type text not null,
  status text not null,
  records_processed integer not null default 0,
  records_changed integer not null default 0,
  records_failed integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  triggered_by uuid references public.admins(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  user_identifier text,
  page_url text,
  language text,
  handoff_status text not null default 'none',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_message text not null,
  ai_response text,
  detected_intent text,
  retrieved_sources jsonb not null default '[]'::jsonb,
  recommended_products jsonb not null default '[]'::jsonb,
  is_failed_answer boolean not null default false,
  marked_for_review boolean not null default false,
  assigned_admin_id uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.handoff_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default concat('SNK-', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  session_id uuid references public.chat_sessions(id) on delete set null,
  complaint_type text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'escalated')),
  customer_identifier text,
  summary text not null,
  proof_required boolean not null default false,
  assigned_to uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.failed_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  user_message text not null,
  ai_response text,
  failure_reason text,
  status text not null default 'open',
  assigned_to uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.answer_traces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  prompt_version_id uuid,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  retrieved_sources jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  severity text not null default 'info',
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete set null,
  admin_id uuid references public.admins(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  status text not null,
  latency_ms integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default timezone('utc', now())
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  document_id uuid references public.knowledge_documents(id) on delete set null,
  job_type text not null default 'file_ingest',
  status text not null default 'pending',
  current_step text,
  progress integer not null default 0,
  logs_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  chunks_created integer not null default 0,
  embeddings_created integer not null default 0,
  retry_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  duration_ms integer,
  created_by uuid references public.admins(id) on delete set null,
  triggered_by uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text not null,
  system_prompt text not null,
  fallback_message text not null,
  language_rules text not null,
  escalation_rules text not null,
  anti_hallucination_rules text not null,
  is_active boolean not null default false,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.rag_test_cases (
  id uuid primary key default gen_random_uuid(),
  test_name text not null,
  user_message text not null,
  expected_intent text,
  expected_answer text,
  created_by uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.rag_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references public.rag_test_cases(id) on delete cascade,
  actual_answer text,
  retrieved_sources jsonb not null default '[]'::jsonb,
  pass_fail text not null default 'warning' check (pass_fail in ('pass', 'fail', 'warning')),
  hallucination_risk text not null default 'medium' check (hallucination_risk in ('low', 'medium', 'high')),
  notes text,
  run_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_admins_role_id on public.admins(role_id);
create index idx_admin_refresh_tokens_admin_id on public.admin_refresh_tokens(admin_id);
create index idx_admin_refresh_tokens_session_id on public.admin_refresh_tokens(session_id);
create index idx_audit_logs_admin_created on public.audit_logs(admin_id, created_at desc);
create index idx_knowledge_documents_status on public.knowledge_documents(status);
create index idx_knowledge_sources_type on public.knowledge_sources(source_type);
create index idx_uploaded_files_document_id on public.uploaded_files(document_id);
create index idx_knowledge_chunks_document_id on public.knowledge_chunks(document_id);
create index idx_rag_chunks_source_id on public.rag_chunks(source_id);
create index idx_shopify_products_product_id on public.shopify_products(product_id);
create index idx_chat_sessions_session_id on public.chat_sessions(session_id);
create index idx_chat_messages_session_id on public.chat_messages(session_id);
create index idx_handoff_tickets_status on public.handoff_tickets(status);
create index idx_failed_answers_status on public.failed_answers(status);
create index idx_answer_traces_session_id on public.answer_traces(session_id);
create index idx_alerts_status on public.alerts(status);
create index idx_token_usage_logs_session_id on public.token_usage_logs(session_id);
create index idx_ingestion_jobs_status on public.ingestion_jobs(status);
create index idx_rag_test_runs_test_case_id on public.rag_test_runs(test_case_id);

create trigger set_admins_updated_at before update on public.admins for each row execute function public.set_updated_at();
create trigger set_settings_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger set_knowledge_sources_updated_at before update on public.knowledge_sources for each row execute function public.set_updated_at();
create trigger set_knowledge_documents_updated_at before update on public.knowledge_documents for each row execute function public.set_updated_at();
create trigger set_uploaded_files_updated_at before update on public.uploaded_files for each row execute function public.set_updated_at();
create trigger set_knowledge_chunks_updated_at before update on public.knowledge_chunks for each row execute function public.set_updated_at();
create trigger set_shopify_products_updated_at before update on public.shopify_products for each row execute function public.set_updated_at();
create trigger set_chat_sessions_updated_at before update on public.chat_sessions for each row execute function public.set_updated_at();
create trigger set_handoff_tickets_updated_at before update on public.handoff_tickets for each row execute function public.set_updated_at();
create trigger set_failed_answers_updated_at before update on public.failed_answers for each row execute function public.set_updated_at();
create trigger set_alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create trigger set_ingestion_jobs_updated_at before update on public.ingestion_jobs for each row execute function public.set_updated_at();
create trigger set_rag_test_cases_updated_at before update on public.rag_test_cases for each row execute function public.set_updated_at();

alter table public.admin_roles enable row level security;
alter table public.admins enable row level security;
alter table public.admin_refresh_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.rag_chunks enable row level security;
alter table public.shopify_products enable row level security;
alter table public.shopify_sync_jobs enable row level security;
alter table public.shopify_sync_logs enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.handoff_tickets enable row level security;
alter table public.failed_answers enable row level security;
alter table public.answer_traces enable row level security;
alter table public.alerts enable row level security;
alter table public.token_usage_logs enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.rag_test_cases enable row level security;
alter table public.rag_test_runs enable row level security;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

create policy "service role full access admin_roles" on public.admin_roles for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access admins" on public.admins for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access admin_refresh_tokens" on public.admin_refresh_tokens for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access audit_logs" on public.audit_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access admin_audit_logs" on public.admin_audit_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access settings" on public.settings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access knowledge_sources" on public.knowledge_sources for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access knowledge_documents" on public.knowledge_documents for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access uploaded_files" on public.uploaded_files for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access knowledge_chunks" on public.knowledge_chunks for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access rag_chunks" on public.rag_chunks for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access shopify_products" on public.shopify_products for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access shopify_sync_jobs" on public.shopify_sync_jobs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access shopify_sync_logs" on public.shopify_sync_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access chat_sessions" on public.chat_sessions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access chat_messages" on public.chat_messages for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access handoff_tickets" on public.handoff_tickets for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access failed_answers" on public.failed_answers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access answer_traces" on public.answer_traces for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access alerts" on public.alerts for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access token_usage_logs" on public.token_usage_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access system_health_checks" on public.system_health_checks for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access ingestion_jobs" on public.ingestion_jobs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access prompt_versions" on public.prompt_versions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access rag_test_cases" on public.rag_test_cases for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access rag_test_runs" on public.rag_test_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
