import { redirect } from "next/navigation";
import { ADMIN_BASE_PATH } from "@/lib/constants";
import { requireAdminSession } from "@/lib/auth";
import type { AdminRole } from "@/lib/types";

export async function requirePageAccess(roles: AdminRole[]) {
  const admin = await requireAdminSession(roles);
  if (!admin) {
    redirect(`${ADMIN_BASE_PATH}/login`);
  }

  return admin;
}

