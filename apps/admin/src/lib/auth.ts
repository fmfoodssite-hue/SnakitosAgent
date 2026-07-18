import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_ROLES } from "@/lib/constants";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import { getDefaultPermissionsForRole, normalizePermissionKeys } from "@/lib/rbac";
import {
  generateRefreshToken,
  hashPassword,
  hashToken,
  signJwt,
  verifyJwt,
  verifyPassword,
} from "@/lib/security";
import type { AdminRole, AdminSession, AdminUser } from "@/lib/types";

const ACCESS_TOKEN_COOKIE = "snakitos_admin_access_token";
const REFRESH_TOKEN_COOKIE = "snakitos_admin_refresh_token";
const COOKIE_PATH = "/";

const ACCESS_TOKEN_TTL_MS = env.ADMIN_ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = env.ADMIN_ACCESS_TOKEN_TTL_MINUTES * 60;
const REFRESH_TOKEN_TTL_MS = env.ADMIN_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

type AdminRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  is_active: boolean;
  last_login_at?: string | null;
  avatar_url?: string | null;
  admin_roles?: { key: AdminRole } | Array<{ key: AdminRole }> | null;
};

type RefreshTokenRow = {
  id: string;
  admin_id: string;
  session_id: string;
  expires_at: string;
  revoked_at: string | null;
  admins?: {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    avatar_url?: string | null;
    admin_roles?: { key: AdminRole } | Array<{ key: AdminRole }> | null;
  } | null;
};

function getRoleKey(role: AdminRow["admin_roles"]) {
  if (Array.isArray(role)) {
    return role[0]?.key ?? "viewer";
  }
  return role?.key ?? "viewer";
}

async function getAdminPermissionKeys(adminId: string, role: AdminRole) {
  try {
    const supabase = assertServiceClient();
    const { data, error } = await supabase
      .from("admin_permission_assignments")
      .select("permission_key")
      .eq("admin_id", adminId);

    if (error) {
      return getDefaultPermissionsForRole(role);
    }

    const permissions = normalizePermissionKeys((data ?? []).map((row) => row.permission_key));
    return permissions.length > 0 ? permissions : getDefaultPermissionsForRole(role);
  } catch {
    return getDefaultPermissionsForRole(role);
  }
}

async function ensureBootstrapOwner() {
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    return;
  }

  const supabase = assertServiceClient();
  const { data: existing } = await supabase
    .from("admins")
    .select("id")
    .eq("email", env.ADMIN_BOOTSTRAP_EMAIL)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { data: role } = await supabase
    .from("admin_roles")
    .select("id")
    .eq("key", "owner")
    .single();

  if (!role) {
    throw new Error("Owner role was not found in admin_roles.");
  }

  await supabase.from("admins").insert({
    email: env.ADMIN_BOOTSTRAP_EMAIL,
    full_name: "Bootstrap Owner",
    password_hash: hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD),
    role_id: role.id,
    is_active: true,
    must_change_password: false,
    password_changed_at: new Date().toISOString(),
  });
}

export async function authenticateAdmin(email: string, password: string) {
  await ensureBootstrapOwner();
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("admins")
    .select("id, email, full_name, password_hash, is_active, last_login_at, avatar_url, admin_roles!inner(key)")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const admin = data as AdminRow;
  if (!admin.is_active || !verifyPassword(password, admin.password_hash)) {
    return null;
  }

  await supabase.from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);

  const role = getRoleKey(admin.admin_roles);
  const permissions = await getAdminPermissionKeys(admin.id, role);
  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role,
    is_active: admin.is_active,
    last_login_at: admin.last_login_at,
    avatar_url: admin.avatar_url,
    permissions,
  } satisfies AdminUser;
}

export async function createAdminSession(admin: AdminUser) {
  const sessionId = randomUUID();
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const supabase = assertServiceClient();

  const { error } = await supabase.from("admin_refresh_tokens").insert({
    admin_id: admin.id,
    token_hash: refreshTokenHash,
    session_id: sessionId,
    expires_at: refreshExpiresAt,
    ip_address: await getRequestIpAddress(),
    user_agent: await getRequestUserAgent(),
  });

  if (error) {
    throw error;
  }

  const session: AdminSession = {
    adminId: admin.id,
    sessionId,
    role: admin.role,
    email: admin.email,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    permissions: admin.permissions,
  };

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, signJwt(session, ACCESS_TOKEN_TTL_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: COOKIE_PATH,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    path: COOKIE_PATH,
  });

  return session;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    const supabase = assertServiceClient();
    await supabase
      .from("admin_refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(refreshToken))
      .is("revoked_at", null);
  }

  cookieStore.delete({
    name: ACCESS_TOKEN_COOKIE,
    path: COOKIE_PATH,
  });
  cookieStore.delete({
    name: REFRESH_TOKEN_COOKIE,
    path: COOKIE_PATH,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  const payload = verifyJwt(accessToken);
  if (!payload) {
    return null;
  }

  const adminId = typeof payload.adminId === "string" ? payload.adminId : null;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
  const role = typeof payload.role === "string" ? (payload.role as AdminRole) : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  const expiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : null;
  const permissions = normalizePermissionKeys(payload.permissions);

  if (!adminId || !sessionId || !role || !email || !expiresAt) {
    return null;
  }

  return {
    adminId,
    sessionId,
    role,
    email,
    expiresAt,
    permissions: permissions.length > 0 ? permissions : getDefaultPermissionsForRole(role),
  } satisfies AdminSession;
}

export async function requireAdminSession(allowedRoles: AdminRole[] = [...ADMIN_ROLES]) {
  const session = await getAdminSession();
  if (!session || !allowedRoles.includes(session.role)) {
    return null;
  }

  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("admins")
    .select("id, email, full_name, is_active, avatar_url, admin_roles!inner(key)")
    .eq("id", session.adminId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const admin = data as {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    avatar_url?: string | null;
    admin_roles?: { key: AdminRole } | Array<{ key: AdminRole }> | null;
  };

  if (!admin.is_active) {
    return null;
  }

  const role = getRoleKey(admin.admin_roles);
  const permissions = await getAdminPermissionKeys(admin.id, role);

  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role,
    is_active: admin.is_active,
    avatar_url: admin.avatar_url,
    permissions,
  } satisfies AdminUser;
}

export async function refreshAdminSession() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return null;
  }

  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("admin_refresh_tokens")
    .select("id, admin_id, session_id, expires_at, revoked_at, admins!inner(id, email, full_name, is_active, avatar_url, admin_roles!inner(key))")
    .eq("token_hash", hashToken(refreshToken))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const record = data as unknown as RefreshTokenRow;
  if (record.revoked_at || new Date(record.expires_at).getTime() <= Date.now() || !record.admins?.is_active) {
    return null;
  }

  const nextRefreshToken = generateRefreshToken();
  const nextRefreshTokenId = randomUUID();
  const nextRefreshTokenHash = hashToken(nextRefreshToken);

  const { error: insertError } = await supabase.from("admin_refresh_tokens").insert({
    id: nextRefreshTokenId,
    admin_id: record.admin_id,
    token_hash: nextRefreshTokenHash,
    session_id: record.session_id,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    ip_address: await getRequestIpAddress(),
    user_agent: await getRequestUserAgent(),
  });

  if (insertError) {
    throw insertError;
  }

  const { error: revokeError } = await supabase
    .from("admin_refresh_tokens")
    .update({
      revoked_at: new Date().toISOString(),
      replaced_by_token_id: nextRefreshTokenId,
    })
    .eq("id", record.id)
    .is("revoked_at", null);

  if (revokeError) {
    throw revokeError;
  }

  const role = getRoleKey(record.admins.admin_roles);
  const permissions = await getAdminPermissionKeys(record.admins.id, role);
  const nextSession: AdminSession = {
    adminId: record.admins.id,
    sessionId: record.session_id,
    role,
    email: record.admins.email,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    permissions,
  };

  cookieStore.set(ACCESS_TOKEN_COOKIE, signJwt(nextSession, ACCESS_TOKEN_TTL_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: COOKIE_PATH,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, nextRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    path: COOKIE_PATH,
  });

  return nextSession;
}

export async function getRequestIpAddress() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function getRequestUserAgent() {
  const headerStore = await headers();
  return headerStore.get("user-agent") ?? "unknown";
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
