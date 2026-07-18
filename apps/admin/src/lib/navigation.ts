import {
  Activity,
  BadgeAlert,
  Bot,
  BrainCircuit,
  Database,
  FileSearch,
  Files,
  LayoutDashboard,
  MessageSquareMore,
  ReceiptText,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Ticket,
  Upload,
  Users,
  Waypoints,
} from "lucide-react";
import type { ComponentType } from "react";
import { withAdminPath } from "@/lib/constants";
import type { ModulePermissionKey } from "@/lib/rbac";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  permission: ModulePermissionKey;
};

export const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Dashboard",
    items: [{ label: "Dashboard", href: withAdminPath("/dashboard"), icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    title: "RAG Management",
    items: [
      { label: "Knowledge Base", href: withAdminPath("/knowledge"), icon: Database, permission: "knowledge.view" },
      { label: "Upload Documents", href: withAdminPath("/knowledge/upload"), icon: Upload, permission: "uploads.view" },
      { label: "Website Crawler", href: withAdminPath("/knowledge/crawler"), icon: FileSearch, permission: "crawler.view" },
      { label: "Shopify Sync", href: withAdminPath("/shopify"), icon: ShoppingCart, permission: "shopify.view" },
      { label: "FAQs", href: withAdminPath("/knowledge/faqs"), icon: Files, permission: "faqs.view" },
      { label: "Chunks", href: withAdminPath("/knowledge/chunks"), icon: Waypoints, permission: "chunks.view" },
    ],
  },
  {
    title: "AI Control",
    items: [
      { label: "Chat Playground", href: withAdminPath("/playground"), icon: Sparkles, permission: "playground.view" },
      { label: "Prompt Manager", href: withAdminPath("/prompts"), icon: Bot, permission: "prompts.view" },
      { label: "Model Settings", href: withAdminPath("/model-settings"), icon: BrainCircuit, permission: "model_settings.view" },
      { label: "Guardrails", href: withAdminPath("/guardrails"), icon: Shield, permission: "guardrails.view" },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Conversations", href: withAdminPath("/conversations"), icon: MessageSquareMore, permission: "conversations.view" },
      { label: "Failed Answers", href: withAdminPath("/failed-answers"), icon: BadgeAlert, permission: "failed_answers.view" },
      { label: "Analytics", href: withAdminPath("/analytics"), icon: Activity, permission: "analytics.view" },
      { label: "Token Usage", href: withAdminPath("/token-usage"), icon: ReceiptText, permission: "token_usage.view" },
      { label: "Tickets", href: withAdminPath("/tickets"), icon: Ticket, permission: "tickets.view" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Users & Roles", href: withAdminPath("/users"), icon: Users, permission: "users.manage" },
      { label: "Audit Logs", href: withAdminPath("/audit-logs"), icon: ScrollText, permission: "audit.view" },
      { label: "Settings", href: withAdminPath("/settings"), icon: Settings, permission: "settings.view" },
    ],
  },
];
