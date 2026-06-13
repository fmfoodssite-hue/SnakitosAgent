import { requireAdminSession } from "@/lib/auth";
import type { AdminRole, AdminUser } from "@/lib/types";

export type AdminPermission =
  | "dashboard.view"
  | "sources.view"
  | "sources.create"
  | "sources.update"
  | "sources.delete"
  | "training.start"
  | "training.retry"
  | "crawler.run"
  | "shopify.sync"
  | "faq.create"
  | "faq.publish"
  | "chunks.update"
  | "playground.run"
  | "prompts.create"
  | "prompts.approve"
  | "prompts.publish"
  | "prompts.rollback"
  | "model_settings.update"
  | "tickets.update"
  | "users.manage"
  | "audit.view";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  owner: [
    "dashboard.view",
    "sources.view",
    "sources.create",
    "sources.update",
    "sources.delete",
    "training.start",
    "training.retry",
    "crawler.run",
    "shopify.sync",
    "faq.create",
    "faq.publish",
    "chunks.update",
    "playground.run",
    "prompts.create",
    "prompts.approve",
    "prompts.publish",
    "prompts.rollback",
    "model_settings.update",
    "tickets.update",
    "users.manage",
    "audit.view",
  ],
  admin: [
    "dashboard.view",
    "sources.view",
    "sources.create",
    "sources.update",
    "sources.delete",
    "training.start",
    "training.retry",
    "crawler.run",
    "shopify.sync",
    "faq.create",
    "faq.publish",
    "chunks.update",
    "playground.run",
    "prompts.create",
    "prompts.approve",
    "prompts.publish",
    "prompts.rollback",
    "model_settings.update",
    "tickets.update",
    "users.manage",
    "audit.view",
  ],
  support_agent: [
    "dashboard.view",
    "sources.view",
    "playground.run",
    "tickets.update",
    "faq.create",
  ],
  content_manager: [
    "dashboard.view",
    "sources.view",
    "sources.create",
    "sources.update",
    "training.start",
    "training.retry",
    "crawler.run",
    "shopify.sync",
    "faq.create",
    "faq.publish",
    "chunks.update",
    "playground.run",
    "prompts.create",
    "prompts.approve",
    "prompts.publish",
    "prompts.rollback",
    "model_settings.update",
  ],
  viewer: ["dashboard.view", "sources.view"],
};

export function hasPermission(user: Pick<AdminUser, "role">, permission: AdminPermission) {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export async function getCurrentAdminUser() {
  return requireAdminSession();
}

export async function requireAdminUser() {
  return requireAdminSession();
}

export async function requirePermission(permission: AdminPermission) {
  const user = await requireAdminSession();
  if (!user) {
    return null;
  }

  return hasPermission(user, permission) ? user : null;
}

