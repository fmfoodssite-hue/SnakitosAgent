import { z } from "zod";
import {
  DOCUMENT_STATUSES,
  HANDOFF_STATUSES,
  HANDOFF_TYPES,
  KNOWLEDGE_CATEGORIES,
  PRIORITIES,
  SOURCE_TYPES,
} from "@/lib/constants";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const knowledgeSchema = z.object({
  title: z.string().min(3).max(160),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  content: z.string().min(20),
  source_type: z.enum(SOURCE_TYPES),
  priority: z.enum(PRIORITIES),
  status: z.enum(DOCUMENT_STATUSES),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const promptSchema = z.object({
  version_label: z.string().min(2).max(50),
  system_prompt: z.string().min(50),
  fallback_message: z.string().min(10),
  language_rules: z.string().min(10),
  escalation_rules: z.string().min(10),
  anti_hallucination_rules: z.string().min(10),
  is_active: z.boolean().default(false),
});

export const settingsSchema = z.object({
  key: z.string().min(2).max(100),
  value: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
});

export const handoffSchema = z.object({
  complaint_type: z.enum(HANDOFF_TYPES),
  status: z.enum(HANDOFF_STATUSES).default("open"),
  customer_identifier: z.string().optional(),
  summary: z.string().min(10),
  proof_required: z.boolean().default(false),
  assigned_to: z.string().uuid().optional().nullable(),
  chat_session_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});


export const ragTestCaseSchema = z.object({
  test_name: z.string().min(3).max(120),
  user_message: z.string().min(3),
  expected_intent: z.string().optional(),
  expected_answer: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const ragTestRunSchema = z.object({
  test_case_id: z.string().uuid().optional(),
  actual_answer: z.string().min(1),
  retrieved_sources: z.array(z.any()).default([]),
  pass_fail: z.enum(["pass", "fail", "warning"]).default("warning"),
  hallucination_risk: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().optional(),
});

