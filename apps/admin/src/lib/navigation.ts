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
import { withAdminPath } from "@/lib/constants";

export const navSections = [
  {
    title: "Dashboard",
    items: [{ label: "Dashboard", href: withAdminPath("/dashboard"), icon: LayoutDashboard }],
  },
  {
    title: "RAG Management",
    items: [
      { label: "Knowledge Base", href: withAdminPath("/knowledge"), icon: Database },
      { label: "Upload Documents", href: withAdminPath("/knowledge/upload"), icon: Upload },
      { label: "Website Crawler", href: withAdminPath("/knowledge/crawler"), icon: FileSearch },
      { label: "Shopify Sync", href: withAdminPath("/shopify"), icon: ShoppingCart },
      { label: "FAQs", href: withAdminPath("/knowledge/faqs"), icon: Files },
      { label: "Chunks", href: withAdminPath("/knowledge/chunks"), icon: Waypoints },
    ],
  },
  {
    title: "AI Control",
    items: [
      { label: "Chat Playground", href: withAdminPath("/playground"), icon: Sparkles },
      { label: "Prompt Manager", href: withAdminPath("/prompts"), icon: Bot },
      { label: "Model Settings", href: withAdminPath("/model-settings"), icon: BrainCircuit },
      { label: "Guardrails", href: withAdminPath("/guardrails"), icon: Shield },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Conversations", href: withAdminPath("/conversations"), icon: MessageSquareMore },
      { label: "Failed Answers", href: withAdminPath("/failed-answers"), icon: BadgeAlert },
      { label: "Analytics", href: withAdminPath("/analytics"), icon: Activity },
      { label: "Token Usage", href: withAdminPath("/token-usage"), icon: ReceiptText },
      { label: "Tickets", href: withAdminPath("/tickets"), icon: Ticket },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Users & Roles", href: withAdminPath("/users"), icon: Users },
      { label: "Audit Logs", href: withAdminPath("/audit-logs"), icon: ScrollText },
      { label: "Settings", href: withAdminPath("/settings"), icon: Settings },
    ],
  },
];
