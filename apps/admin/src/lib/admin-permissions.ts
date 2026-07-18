import { getDefaultPermissionsForRole, normalizePermissionKeys, type ModulePermissionKey } from "@/lib/rbac";
import type { AdminRole } from "@/lib/types";

type SupabaseLike = any;

type PermissionCatalogRow = {
  key?: unknown;
  label?: unknown;
  category?: unknown;
  description?: unknown;
  sort_order?: unknown;
};

type PermissionAssignmentRow = {
  admin_id?: unknown;
  permission_key?: unknown;
};

type RoleDefaultRow = {
  role_key?: unknown;
  permission_key?: unknown;
};

export async function loadPermissionCatalog(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("admin_module_permissions")
    .select("key, label, category, description, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return [];
  }

  return (data as PermissionCatalogRow[] | null ?? [])
    .map((row) => ({
      key: String(row.key ?? ""),
      label: String(row.label ?? ""),
      category: String(row.category ?? ""),
      description: String(row.description ?? ""),
      sortOrder: Number(row.sort_order ?? 0),
    }))
    .filter((permission) => permission.key && permission.label);
}

export async function loadRolePermissionDefaults(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("admin_role_permission_defaults")
    .select("role_key, permission_key")
    .order("role_key", { ascending: true });

  if (error) {
    return {
      owner: getDefaultPermissionsForRole("owner"),
      admin: getDefaultPermissionsForRole("admin"),
      support_agent: getDefaultPermissionsForRole("support_agent"),
      content_manager: getDefaultPermissionsForRole("content_manager"),
      viewer: getDefaultPermissionsForRole("viewer"),
    };
  }

  const defaults: Record<string, string[]> = {};
  for (const row of (data as RoleDefaultRow[] | null) ?? []) {
    const role = typeof row.role_key === "string" ? row.role_key : "";
    const permission = typeof row.permission_key === "string" ? row.permission_key : "";
    if (!role || !permission) continue;
    defaults[role] = [...(defaults[role] ?? []), permission];
  }

  return defaults;
}

export async function loadAdminPermissionsMap(supabase: SupabaseLike, adminIds: string[], rolesByAdminId = new Map<string, AdminRole>()) {
  if (adminIds.length === 0) return new Map<string, string[]>();

  const { data, error } = await supabase
    .from("admin_permission_assignments")
    .select("admin_id, permission_key")
    .in("admin_id", adminIds);

  const permissionsByAdminId = new Map<string, string[]>();

  if (!error) {
    for (const row of (data as PermissionAssignmentRow[] | null) ?? []) {
      const adminId = typeof row.admin_id === "string" ? row.admin_id : "";
      const permission = typeof row.permission_key === "string" ? row.permission_key : "";
      if (!adminId || !permission) continue;
      permissionsByAdminId.set(adminId, [...(permissionsByAdminId.get(adminId) ?? []), permission]);
    }
  }

  for (const adminId of adminIds) {
    const normalized = normalizePermissionKeys(permissionsByAdminId.get(adminId) ?? []);
    const role = rolesByAdminId.get(adminId);
    permissionsByAdminId.set(adminId, normalized.length > 0 || !role ? normalized : getDefaultPermissionsForRole(role));
  }

  return permissionsByAdminId;
}

export async function replaceAdminPermissions(supabase: SupabaseLike, adminId: string, permissions: string[]) {
  const normalized = normalizePermissionKeys(permissions) as ModulePermissionKey[];
  const { error: deleteError } = await supabase.from("admin_permission_assignments").delete().eq("admin_id", adminId);
  if (deleteError) throw deleteError;

  if (normalized.length === 0) return normalized;

  const { error: insertError } = await supabase
    .from("admin_permission_assignments")
    .insert(normalized.map((permission) => ({ admin_id: adminId, permission_key: permission })));

  if (insertError) throw insertError;
  return normalized;
}
