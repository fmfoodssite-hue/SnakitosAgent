import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { forbiddenResponse, getRequestIpAddress, requireAdminSession, unauthorizedResponse } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AdminRole } from "@/lib/types";

export async function withAdminAccess<T>(
  allowedRoles: AdminRole[],
  action: (ctx: { admin: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>>; ipAddress: string }) => Promise<T | NextResponse>,
) {
  const admin = await requireAdminSession(allowedRoles);
  if (!admin) {
    const maybeSession = await requireAdminSession();
    return maybeSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const ipAddress = await getRequestIpAddress();
  const limit = checkRateLimit(`${admin.id}:${ipAddress}`);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  return action({ admin, ipAddress });
}

export async function parseJson<T extends z.ZodTypeAny>(request: Request, schema: T) {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}

export async function safeAudit(input: {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
