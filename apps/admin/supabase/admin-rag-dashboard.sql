create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.admin_roles (key, label, description)
values
  ('owner', 'Owner', 'Full system access'),
  ('admin', 'Admin', 'Operational admin access'),
  ('support_agent', 'Support Agent', 'Conversation and ticket operations'),
  ('content_manager', 'Content Manager', 'Knowledge and prompt management'),
  ('viewer', 'Viewer', 'Read-only dashboard access')
on conflict (key) do nothing;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  password_hash text not null,
  role_id uuid not null references public.admin_roles(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  source_type text not null check (source_type in ('manual','shopify','pdf','csv','docx','faq','website','txt','jsonl')),
  priority text not null check (priority in ('high','medium','low')) default 'medium',
  status text not null check (status in ('draft','active','archived')) default 'draft',
  created_by uuid references public.admins(id),
  updated_by uuid references public.admins(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null,
  storage_path text not null,
  file_size bigint not null default 0,
  extraction_status text not null check (extraction_status in ('pending','processing','completed','failed')) default 'pending',
  embedding_status text not null check (embedding_status in ('pending','processing','completed','failed')) default 'pending',
  chunk_count integer not null default 0,
  document_id uuid references public.knowledge_documents(id) on delete set null,
  uploaded_by uuid references public.admins(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null default 0,
  embedding vector(1536),
  embedding_status text not null check (embedding_status in ('pending','processing','completed','failed')) default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopify_products (
  id uuid primary key default gen_random_uuid(),
  product_id text unique not null,
  title text not null,
  handle text not null,
  description text,
  price numeric(12,2),
  variants jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  collection text,
  tags text[] not null default '{}',
  stock_status text,
  product_url text,
  last_synced_at timestamptz,
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text not null,
  system_prompt text not null,
  fallback_message text not null,
  language_rules text not null,
  escalation_rules text not null,
  anti_hallucination_rules text not null,
  is_active boolean not null default false,
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  user_identifier text,
  page_url text,
  language text,
  handoff_status text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_message text not null,
  ai_response text,
  detected_intent text,
  retrieved_sources jsonb not null default '[]'::jsonb,
  recommended_products jsonb not null default '[]'::jsonb,
  is_failed_answer boolean not null default false,
  marked_for_review boolean not null default false,
  assigned_admin_id uuid references public.admins(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.handoff_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null default concat('SNK-', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  session_id uuid references public.chat_sessions(id) on delete set null,
  complaint_type text not null,
  status text not null check (status in ('open','in_progress','resolved','escalated')) default 'open',
  customer_identifier text,
  summary text not null,
  proof_required boolean not null default false,
  assigned_to uuid references public.admins(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rag_test_cases (
  id uuid primary key default gen_random_uuid(),
  test_name text not null,
  user_message text not null,
  expected_intent text,
  expected_answer text,
  created_by uuid references public.admins(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rag_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references public.rag_test_cases(id) on delete cascade,
  actual_answer text,
  retrieved_sources jsonb not null default '[]'::jsonb,
  pass_fail text not null check (pass_fail in ('pass','fail','warning')) default 'warning',
  hallucination_risk text not null check (hallucination_risk in ('low','medium','high')) default 'medium',
  notes text,
  run_by uuid references public.admins(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_documents_category on public.knowledge_documents(category);
create index if not exists idx_knowledge_documents_status on public.knowledge_documents(status);
create index if not exists idx_uploaded_files_status on public.uploaded_files(extraction_status, embedding_status);
create index if not exists idx_knowledge_chunks_document on public.knowledge_chunks(document_id);
create index if not exists idx_shopify_products_product_id on public.shopify_products(product_id);
create index if not exists idx_chat_sessions_session_id on public.chat_sessions(session_id);
create index if not exists idx_chat_messages_failed on public.chat_messages(is_failed_answer, created_at desc);
create index if not exists idx_handoff_tickets_status on public.handoff_tickets(status, complaint_type);
create index if not exists idx_audit_logs_admin on public.audit_logs(admin_id, created_at desc);

insert into public.settings (key, value, description)
values
  (
    'guardrails',
    jsonb_build_object(
      'blockedClaims', jsonb_build_array('price', 'stock', 'delivery_date', 'refund_approval', 'allergy_details', 'ingredients', 'certification_claims', 'courier_status', 'payment_verification', 'wholesale_rate'),
      'fallbackMessage', 'I don''t have confirmed information about this right now. Please contact Snakitos support for accurate help.'
    ),
    'Bot guardrail configuration'
  ),
  (
    'order_tracking',
    jsonb_build_object(
      'requiredFields', jsonb_build_array('order_number', 'phone_or_email'),
      'fallbackMessage', 'Please share your order number and phone number or email so we can help check your order.'
    ),
    'Order tracking verification rules'
  ),
  (
    'social_links',
    jsonb_build_object(
      'instagram', 'https://www.instagram.com/snakitos.pk/',
      'tiktok', 'https://www.tiktok.com/@snakitos',
      'facebook', 'https://www.facebook.com/snakitoss/',
      'youtube', 'https://www.youtube.com/@snakitos5728',
      'otherPlatformMessage', 'Please contact Snakitos support for official platform details.'
    ),
    'Official approved Snakitos links'
  )
on conflict (key) do nothing;

