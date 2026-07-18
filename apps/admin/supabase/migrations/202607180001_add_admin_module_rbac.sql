create table if not exists public.admin_module_permissions (
  key text primary key,
  label text not null,
  category text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_role_permission_defaults (
  role_key text not null references public.admin_roles(key) on delete cascade,
  permission_key text not null references public.admin_module_permissions(key) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_key, permission_key)
);

create table if not exists public.admin_permission_assignments (
  admin_id uuid not null references public.admins(id) on delete cascade,
  permission_key text not null references public.admin_module_permissions(key) on delete cascade,
  granted_at timestamptz not null default timezone('utc', now()),
  primary key (admin_id, permission_key)
);

insert into public.admin_module_permissions (key, label, category, description, sort_order)
values
  ('dashboard.view', 'Dashboard', 'Dashboard', 'View dashboard metrics and overview.', 10),
  ('knowledge.view', 'Knowledge Base', 'RAG Management', 'View knowledge sources and documents.', 20),
  ('uploads.view', 'Upload Documents', 'RAG Management', 'Upload and review training documents.', 30),
  ('crawler.view', 'Website Crawler', 'RAG Management', 'Run and monitor website crawling.', 40),
  ('shopify.view', 'Shopify Sync', 'RAG Management', 'View and manage Shopify product sync.', 50),
  ('faqs.view', 'FAQs', 'RAG Management', 'Manage approved FAQ knowledge.', 60),
  ('chunks.view', 'Chunks', 'RAG Management', 'Inspect retrieved knowledge chunks.', 70),
  ('playground.view', 'Chat Playground', 'AI Control', 'Test chatbot answers and retrieval behavior.', 80),
  ('prompts.view', 'Prompt Manager', 'AI Control', 'View and manage prompt versions.', 90),
  ('model_settings.view', 'Model Settings', 'AI Control', 'View and update model configuration.', 100),
  ('guardrails.view', 'Guardrails', 'AI Control', 'View safety and policy controls.', 110),
  ('conversations.view', 'Conversations', 'Monitoring', 'Review user conversations and responses.', 120),
  ('failed_answers.view', 'Failed Answers', 'Monitoring', 'Review failed or low-confidence answers.', 130),
  ('analytics.view', 'Analytics', 'Monitoring', 'View analytics and trends.', 140),
  ('token_usage.view', 'Token Usage', 'Monitoring', 'View token usage and cost data.', 150),
  ('tickets.view', 'Tickets', 'Monitoring', 'View and manage support tickets.', 160),
  ('users.manage', 'Users & Roles', 'Admin', 'Create users and manage roles or permissions.', 170),
  ('audit.view', 'Audit Logs', 'Admin', 'View admin activity logs.', 180),
  ('settings.view', 'Settings', 'Admin', 'View and manage dashboard settings.', 190),
  ('profile.view', 'Profile', 'Account', 'View and update the signed-in user profile.', 200)
on conflict (key) do update
set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  sort_order = excluded.sort_order;

delete from public.admin_role_permission_defaults;

insert into public.admin_role_permission_defaults (role_key, permission_key)
select role_key, permission_key
from (
  values
    ('owner', 'dashboard.view'),
    ('owner', 'knowledge.view'),
    ('owner', 'uploads.view'),
    ('owner', 'crawler.view'),
    ('owner', 'shopify.view'),
    ('owner', 'faqs.view'),
    ('owner', 'chunks.view'),
    ('owner', 'playground.view'),
    ('owner', 'prompts.view'),
    ('owner', 'model_settings.view'),
    ('owner', 'guardrails.view'),
    ('owner', 'conversations.view'),
    ('owner', 'failed_answers.view'),
    ('owner', 'analytics.view'),
    ('owner', 'token_usage.view'),
    ('owner', 'tickets.view'),
    ('owner', 'users.manage'),
    ('owner', 'audit.view'),
    ('owner', 'settings.view'),
    ('owner', 'profile.view'),
    ('admin', 'dashboard.view'),
    ('admin', 'knowledge.view'),
    ('admin', 'uploads.view'),
    ('admin', 'crawler.view'),
    ('admin', 'shopify.view'),
    ('admin', 'faqs.view'),
    ('admin', 'chunks.view'),
    ('admin', 'playground.view'),
    ('admin', 'prompts.view'),
    ('admin', 'model_settings.view'),
    ('admin', 'guardrails.view'),
    ('admin', 'conversations.view'),
    ('admin', 'failed_answers.view'),
    ('admin', 'analytics.view'),
    ('admin', 'token_usage.view'),
    ('admin', 'tickets.view'),
    ('admin', 'users.manage'),
    ('admin', 'settings.view'),
    ('admin', 'profile.view'),
    ('content_manager', 'dashboard.view'),
    ('content_manager', 'knowledge.view'),
    ('content_manager', 'uploads.view'),
    ('content_manager', 'crawler.view'),
    ('content_manager', 'shopify.view'),
    ('content_manager', 'faqs.view'),
    ('content_manager', 'chunks.view'),
    ('content_manager', 'playground.view'),
    ('content_manager', 'prompts.view'),
    ('content_manager', 'model_settings.view'),
    ('content_manager', 'guardrails.view'),
    ('content_manager', 'analytics.view'),
    ('content_manager', 'token_usage.view'),
    ('content_manager', 'profile.view'),
    ('support_agent', 'dashboard.view'),
    ('support_agent', 'playground.view'),
    ('support_agent', 'conversations.view'),
    ('support_agent', 'failed_answers.view'),
    ('support_agent', 'tickets.view'),
    ('support_agent', 'faqs.view'),
    ('support_agent', 'profile.view'),
    ('viewer', 'dashboard.view'),
    ('viewer', 'knowledge.view'),
    ('viewer', 'conversations.view'),
    ('viewer', 'analytics.view'),
    ('viewer', 'token_usage.view'),
    ('viewer', 'profile.view')
) as defaults(role_key, permission_key)
join public.admin_roles roles on roles.key = defaults.role_key
join public.admin_module_permissions permissions on permissions.key = defaults.permission_key
on conflict do nothing;

insert into public.admin_permission_assignments (admin_id, permission_key)
select admins.id, defaults.permission_key
from public.admins admins
join public.admin_roles roles on roles.id = admins.role_id
join public.admin_role_permission_defaults defaults on defaults.role_key = roles.key
on conflict do nothing;

create index if not exists idx_admin_permission_assignments_admin_id on public.admin_permission_assignments(admin_id);
create index if not exists idx_admin_role_permission_defaults_role_key on public.admin_role_permission_defaults(role_key);

alter table public.admin_module_permissions enable row level security;
alter table public.admin_role_permission_defaults enable row level security;
alter table public.admin_permission_assignments enable row level security;

drop policy if exists "service role full access admin_module_permissions" on public.admin_module_permissions;
drop policy if exists "service role full access admin_role_permission_defaults" on public.admin_role_permission_defaults;
drop policy if exists "service role full access admin_permission_assignments" on public.admin_permission_assignments;

create policy "service role full access admin_module_permissions"
  on public.admin_module_permissions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access admin_role_permission_defaults"
  on public.admin_role_permission_defaults for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access admin_permission_assignments"
  on public.admin_permission_assignments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
