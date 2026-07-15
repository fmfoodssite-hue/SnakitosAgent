insert into public.admin_roles (key, label, description)
values
  ('owner', 'Owner', 'Full system access'),
  ('admin', 'Admin', 'Operational admin access'),
  ('content_manager', 'Content Manager', 'Knowledge and prompt management'),
  ('support_agent', 'Support Agent', 'Conversation and ticket operations'),
  ('viewer', 'Viewer', 'Read-only dashboard access')
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description;

with role_map as (
  select id, key
  from public.admin_roles
)
insert into public.admins (
  email,
  full_name,
  password_hash,
  role_id,
  is_active,
  must_change_password,
  password_changed_at
)
values
  (
    'superadmin@snakitos.com',
    'Super Admin',
    'scrypt:2a0c72416df6d4ccc8ae9cb4ff136d07:149f3d765744ecf5d5f04feb67d4ff01364c2c1a674217e4ad57496cd161ff5363562c43ec3c5a9b8918f1f0c485e62a738f460c9bf102cd625f8ec2bf92295a',
    (select id from role_map where key = 'owner'),
    true,
    false,
    timezone('utc', now())
  ),
  (
    'admin@snakitos.com',
    'Admin User',
    'scrypt:617c3eb470c862cfe003b0a1254d521e:627a4b9489a81a49d82f2c53caec4b1521d660ebb1d86f9aeb9c2b4ecc8428789b5e66c5487272d568ee325080d687a215e8e9308fac61e61b2b6e2414233d6f',
    (select id from role_map where key = 'admin'),
    true,
    false,
    timezone('utc', now())
  ),
  (
    'manager@snakitos.com',
    'Content Manager',
    'scrypt:06cf762cb316efef9e5712fbfb27f281:6e7b3561ab2982c8f81cd00a695170db63d96f16496c88c7796d21fb6227a9c3ea56cda39585e340fd40467791d8358e9be705c8fedd2188c118408b643f0057',
    (select id from role_map where key = 'content_manager'),
    true,
    false,
    timezone('utc', now())
  ),
  (
    'staff@snakitos.com',
    'Support Staff',
    'scrypt:c8505ccaa9e7deeebd7d79d771c2248c:125454a7ce13272db317dca08b6726a237bb659c1e21ae63119fd57ca25b9a9dfc50a4dc2185947c56dc3105d124394f56cc61462950a59cbb3f6e83ee1156e2',
    (select id from role_map where key = 'support_agent'),
    true,
    false,
    timezone('utc', now())
  ),
  (
    'viewer@snakitos.com',
    'Viewer User',
    'scrypt:7a197063cf6f30c7d932bddd3013e0bc:65f3197ba99fdf1a9186faebfa6917d026ba03f93fff8c231c4ee51919e803d38deb2b5b1d7f7ff5858b37a3cbc169c79144e57f6e70cc7e10fffcd76727b15b',
    (select id from role_map where key = 'viewer'),
    true,
    false,
    timezone('utc', now())
  )
on conflict (email) do update
set
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  role_id = excluded.role_id,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  password_changed_at = excluded.password_changed_at;
