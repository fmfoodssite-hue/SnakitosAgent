import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_BASE_PATH, ADMIN_ROLES } from "@/lib/constants";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, signPayload, verifyPassword } from "@/lib/security";
import type { AdminRole, AdminSession, AdminUser } from "@/lib/types";

const SESSION_COOKIE = "snakitos_admin_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

type AdminRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  is_active: boolean;
  last_login_at?: string | null;
  admin_roles?: Array<{ key: AdminRole }> | null;
  role_id?: string;
};

function serializeSession(session: AdminSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function parseSession(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || signPayload(payload) !== signature) {
    return null;
  }

  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
  if (Date.now() > session.expiresAt) {
    return null;
  }

  return session;
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
  });
}

export async function authenticateAdmin(email: string, password: string) {
  await ensureBootstrapOwner();
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("admins")
    .select("id, email, full_name, password_hash, is_active, last_login_at, admin_roles!inner(key)")
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

  const role = admin.admin_roles?.[0]?.key ?? "viewer";
  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role,
    is_active: admin.is_active,
    last_login_at: admin.last_login_at,
  } satisfies AdminUser;
}

export async function createAdminSession(admin: AdminUser) {
  const cookieStore = await cookies();
  const session: AdminSession = {
    adminId: admin.id,
    role: admin.role,
    email: admin.email,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };

  cookieStore.set(SESSION_COOKIE, serializeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS / 1000,
    path: ADMIN_BASE_PATH,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: SESSION_COOKIE,
    path: ADMIN_BASE_PATH,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return parseSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireAdminSession(allowedRoles: AdminRole[] = [...ADMIN_ROLES]) {
  const session = await getAdminSession();
  if (!session || !allowedRoles.includes(session.role)) {
    return null;
  }

  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("admins")
    .select("id, email, full_name, is_active, admin_roles!inner(key)")
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
    admin_roles?: Array<{ key: AdminRole }> | null;
  };

  if (!admin.is_active) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.admin_roles?.[0]?.key ?? "viewer",
    is_active: admin.is_active,
  } satisfies AdminUser;
}

export async function getRequestIpAddress() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
