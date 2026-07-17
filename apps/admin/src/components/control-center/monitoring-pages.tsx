"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  addConversationNote,
  addFailedAnswerFromPlayground,
  addKnowledgeSource,
  createUser,
  deleteUser,
  disableUser,
  duplicatePrompt,
  exportAuditLogs,
  fixFailedAnswer,
  ignoreFailedAnswer,
  markConversationReviewed,
  resolveTicket,
  rollbackPrompt,
  saveFaq,
  savePromptSettings,
  saveTicket,
  updateUser,
} from "@/lib/mock-api";
import { useControlCenterData } from "@/hooks/use-control-center-data";
import { ChartCard } from "@/components/common/ChartCard";
import { DataTable } from "@/components/common/DataTable";
import { DetailDrawer } from "@/components/common/DetailDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { FormModal } from "@/components/common/FormModal";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchAndFilterBar } from "@/components/common/SearchAndFilterBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUser, AuditLog, ChatPlaygroundResponse, Conversation, FailedAnswer, PromptVersion, Ticket } from "@/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      {children}
    </label>
  );
}

function PageState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={retry} />;
  return <>{children}</>;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const faqMiniSchema = z.object({
  question: z.string().min(2),
  answer: z.string().min(2),
});

const promptSchema = z.object({
  prompt: z.string().min(20),
  tone: z.enum(["Friendly", "Professional", "Sales-focused", "Support-focused", "Roman Urdu"]),
  languageMode: z.enum(["English", "Urdu", "Roman Urdu", "Auto-detect"]),
});

const ticketSchema = z.object({
  status: z.enum(["Open", "Pending", "Resolved", "Closed"]),
  priority: z.enum(["High", "Medium", "Low"]),
  assignedTo: z.string().min(2),
  adminReply: z.string().min(2),
  internalNotes: z.string().min(2),
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["Owner", "Admin", "Support Agent", "Content Manager", "Viewer"]),
  status: z.enum(["Active", "Disabled"]),
});

const editUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["Owner", "Admin", "Support Agent", "Content Manager", "Viewer"]),
  status: z.enum(["Active", "Disabled"]),
});

export function PlaygroundPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: "assistant", content: "Snakitos AI is ready. Test products, delivery, offers, FAQs, and support flows here." },
  ]);
  const [lastResponse, setLastResponse] = useState<ChatPlaygroundResponse | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const faqForm = useForm<z.infer<typeof faqMiniSchema>>({
    resolver: zodResolver(faqMiniSchema),
    defaultValues: { question: "", answer: "" },
  });
  const ticketForm = useForm({
    defaultValues: {
      assignedTo: "Bilal Ahmed",
      priority: "Medium",
      notes: "Created from playground review.",
    },
  });

  async function sendMessage(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const { sendPlaygroundMessage } = await import("@/lib/mock-api");
    setChat((items) => [...items, { role: "user", content: trimmed }]);
    setInput("");
    const response = await sendPlaygroundMessage(trimmed);
    setChat((items) => [...items, { role: "assistant", content: response.message }]);
    setLastResponse(response);
  }

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="AI Control" title="Chat playground" description="Evaluate how Snakitos AI answers live-style customer questions before publishing prompt, retrieval, or knowledge changes." />
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              <div className="space-y-4">
                <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  {chat.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-[24px] px-4 py-3 text-sm ${message.role === "user" ? "bg-[#E3BE2F] text-[#2D3138]" : "bg-[#F7EFD8] text-[#373635]"}`}>
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      "What snacks are available?",
                      "Do you offer spicy chips?",
                      "What is your delivery policy?",
                      "Do you have discounts?",
                      "How can I contact Snakitos?",
                      "Do you have Roman Urdu support?",
                      "Which products are out of stock?",
                    ].map((question) => (
                      <button
                        key={question}
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                        onClick={() => setInput(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a test customer question..." />
                    <Button onClick={() => sendMessage(input)}>Send</Button>
                    <Button variant="outline" onClick={() => { setChat([{ role: "assistant", content: "Snakitos AI is ready. Test products, delivery, offers, FAQs, and support flows here." }]); setLastResponse(null); }}>
                      Clear chat
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <ChartCard title="Answer inspector" description="Retrieved sources, confidence, and runtime details">
                {lastResponse ? (
                  <div className="space-y-4 text-sm text-slate-600">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Confidence</div><div className="mt-2 text-xl font-semibold text-slate-900">{lastResponse.confidence}%</div></div>
                      <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Response time</div><div className="mt-2 text-xl font-semibold text-slate-900">{lastResponse.responseTime}s</div></div>
                      <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Token usage</div><div className="mt-2 text-xl font-semibold text-slate-900">{lastResponse.tokenUsage}</div></div>
                      <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Model used</div><div className="mt-2 text-xl font-semibold text-slate-900">{lastResponse.model}</div></div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="font-medium text-slate-900">Retrieved sources</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lastResponse.retrievedSources.map((source) => <StatusBadge key={source} value={source} />)}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-3xl bg-slate-50 p-4">Chunks used: <span className="font-semibold text-slate-900">{lastResponse.chunksUsed}</span></div>
                      <div className="rounded-3xl bg-slate-50 p-4">Language detected: <span className="font-semibold text-slate-900">{lastResponse.languageDetected}</span></div>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-4">Retrieval method: <span className="font-semibold text-slate-900">{lastResponse.retrievalMethod}</span></div>
                  </div>
                ) : (
                  <EmptyState title="Send a message first" description="The inspector will populate after you test a chatbot reply." />
                )}
              </ChartCard>

              <div className="grid gap-3 md:grid-cols-2">
                <Button variant="outline" onClick={() => toast.success("Marked as correct.")}>Mark Correct</Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const question = chat.filter((item) => item.role === "user").slice(-1)[0]?.content;
                    const answer = chat.filter((item) => item.role === "assistant").slice(-1)[0]?.content;
                    if (!question || !answer) return toast.error("Send a test question first.");
                    await addFailedAnswerFromPlayground(question, answer);
                    toast.success("Playground answer added to failed answers and tickets.");
                    reload();
                  }}
                >
                  Mark Wrong
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const question = chat.filter((item) => item.role === "user").slice(-1)[0]?.content ?? "";
                    const answer = chat.filter((item) => item.role === "assistant").slice(-1)[0]?.content ?? "";
                    faqForm.reset({ question, answer });
                    setFaqOpen(true);
                  }}
                >
                  Add to FAQ
                </Button>
                <Button variant="outline" onClick={() => toast.info("Open Prompt Manager to improve the answer behavior.")}>
                  Improve RAG Answer
                </Button>
                <Button variant="outline" onClick={() => setTicketOpen(true)}>
                  Create Ticket
                </Button>
              </div>
            </div>
          </div>

          <FormModal open={faqOpen} title="Promote reviewed answer to FAQ" onClose={() => setFaqOpen(false)}>
            <form
              className="space-y-4"
              onSubmit={faqForm.handleSubmit(async (values) => {
                await saveFaq({
                  question: values.question,
                  answer: values.answer,
                  category: "Playground",
                  language: "English",
                  status: "Active",
                  tags: ["playground", "approved"],
                });
                toast.success("Reviewed answer promoted to FAQ knowledge.");
                setFaqOpen(false);
                reload();
              })}
            >
              <Field label="Question"><Input {...faqForm.register("question")} /></Field>
              <Field label="Answer"><Textarea {...faqForm.register("answer")} /></Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => setFaqOpen(false)}>Cancel</Button>
                <Button type="submit">Save FAQ</Button>
              </div>
            </form>
          </FormModal>

          <FormModal open={ticketOpen} title="Escalate playground result to ticket" onClose={() => setTicketOpen(false)}>
            <form
              className="space-y-4"
              onSubmit={ticketForm.handleSubmit(async () => {
                const question = chat.filter((item) => item.role === "user").slice(-1)[0]?.content ?? "Manual playground ticket";
                await addFailedAnswerFromPlayground(question, chat.filter((item) => item.role === "assistant").slice(-1)[0]?.content ?? "No answer");
                toast.success("Playground result escalated to support ticket.");
                setTicketOpen(false);
                reload();
              })}
            >
              <Field label="Assigned to"><Input {...ticketForm.register("assignedTo")} /></Field>
              <Field label="Priority">
                <Select {...ticketForm.register("priority")}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </Select>
              </Field>
              <Field label="Internal notes"><Textarea {...ticketForm.register("notes")} /></Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => setTicketOpen(false)}>Cancel</Button>
                <Button type="submit">Create Ticket</Button>
              </div>
            </form>
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

export function PromptManagerPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const form = useForm<z.infer<typeof promptSchema>>({
    resolver: zodResolver(promptSchema),
    values: data ? data.promptSettings : undefined,
  });

  const columns = useMemo<ColumnDef<PromptVersion>[]>(
    () => [
      { header: "Version", cell: ({ row }) => row.original.version },
      { header: "Updated By", cell: ({ row }) => row.original.updatedBy },
      { header: "Tone", cell: ({ row }) => row.original.tone },
      { header: "Language Mode", cell: ({ row }) => row.original.languageMode },
      { header: "Date", cell: ({ row }) => row.original.date },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.info(row.original.prompt)}>View version</Button>
            <Button variant="ghost" onClick={async () => { await rollbackPrompt(row.original.id); toast.success("Prompt rolled back."); reload(); }}>
              Rollback version
            </Button>
            <Button variant="ghost" onClick={async () => { await duplicatePrompt(row.original.id); toast.success("Prompt duplicated."); reload(); }}>
              Duplicate version
            </Button>
          </div>
        ),
      },
    ],
    [reload],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="AI Control" title="Prompt manager" description="Control the assistant’s system instructions, tone, and language strategy with version history and rollback support." />
          <form
            className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
            onSubmit={form.handleSubmit(async (values) => {
              await savePromptSettings(values);
              toast.success("Prompt settings saved.");
              reload();
            })}
          >
            <Field label="System prompt">
              <Textarea className="min-h-[220px]" {...form.register("prompt")} />
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Brand tone">
                <Select {...form.register("tone")}>
                  <option>Friendly</option>
                  <option>Professional</option>
                  <option>Sales-focused</option>
                  <option>Support-focused</option>
                  <option>Roman Urdu</option>
                </Select>
              </Field>
              <Field label="Language mode">
                <Select {...form.register("languageMode")}>
                  <option>English</option>
                  <option>Urdu</option>
                  <option>Roman Urdu</option>
                  <option>Auto-detect</option>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Save prompt</Button>
              <Button type="button" variant="outline" onClick={() => toast.success("Prompt evaluation started in the playground context.")}>
                Test prompt
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset({
                  prompt: "You are Snakitos AI assistant. Answer only using approved Snakitos knowledge base. If information is missing, politely say you do not know and suggest contacting support. Always keep answers friendly, clear, and helpful. Support English, Urdu, and Roman Urdu. Do not invent product prices, delivery times, discounts, stock status, or policies unless they exist in the knowledge base.",
                  tone: "Friendly",
                  languageMode: "Auto-detect",
                })}
              >
                Reset to default
              </Button>
            </div>
          </form>
          <DataTable columns={columns} data={data.promptVersions} />
        </div>
      ) : null}
    </PageState>
  );
}

export function ConversationsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [language, setLanguage] = useState("All");
  const [satisfaction, setSatisfaction] = useState("All");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [note, setNote] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.conversations.filter((conversation) => {
      const matchesSearch = conversation.question.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === "All" || conversation.status === status;
      const matchesLanguage = language === "All" || conversation.language === language;
      const matchesSatisfaction = satisfaction === "All" || String(conversation.satisfaction) === satisfaction;
      return matchesSearch && matchesStatus && matchesLanguage && matchesSatisfaction;
    });
  }, [data, search, status, language, satisfaction]);

  const columns = useMemo<ColumnDef<Conversation>[]>(
    () => [
      { header: "User ID", cell: ({ row }) => row.original.userId },
      { header: "Question", cell: ({ row }) => <div className="max-w-[240px] font-medium text-slate-900">{row.original.question}</div> },
      { header: "Answer Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Language", cell: ({ row }) => row.original.language },
      { header: "Satisfaction", cell: ({ row }) => row.original.satisfaction },
      { header: "Confidence", cell: ({ row }) => `${row.original.confidence}%` },
      { header: "Date", cell: ({ row }) => row.original.date },
      {
        header: "Actions",
        cell: ({ row }) => (
          <Button variant="outline" onClick={() => setSelected(row.original)}>
            View
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="Monitoring" title="Conversations" description="Review user questions, answer quality, retrieval confidence, and feedback before converting learnings into FAQ or support tickets." />
          <SearchAndFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search question..."
            filters={
              <>
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Resolved</option>
                  <option>Needs Review</option>
                  <option>Escalated</option>
                </Select>
                <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option>All</option>
                  <option>English</option>
                  <option>Urdu</option>
                  <option>Roman Urdu</option>
                </Select>
                <Select value={satisfaction} onChange={(event) => setSatisfaction(event.target.value)}>
                  <option>All</option>
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                  <option>5</option>
                </Select>
              </>
            }
          />
          <DataTable columns={columns} data={filtered} />
          <DetailDrawer open={Boolean(selected)} title="Conversation detail" subtitle={selected?.userId} onClose={() => setSelected(null)}>
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700"><span className="font-semibold text-slate-900">Question:</span> {selected.question}</div>
                <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700"><span className="font-semibold text-slate-900">Bot answer:</span> {selected.answer}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 p-4 text-sm">Confidence: <strong>{selected.confidence}%</strong></div>
                  <div className="rounded-3xl border border-slate-200 p-4 text-sm">Token usage: <strong>{selected.tokensUsed}</strong></div>
                  <div className="rounded-3xl border border-slate-200 p-4 text-sm">Response time: <strong>{selected.responseTime}s</strong></div>
                  <div className="rounded-3xl border border-slate-200 p-4 text-sm">Language: <strong>{selected.language}</strong></div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm">
                  <div className="font-semibold text-slate-900">Sources used</div>
                  <div className="mt-3 flex flex-wrap gap-2">{selected.sources.map((source) => <StatusBadge key={source} value={source} />)}</div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">User feedback: {selected.feedback}</div>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal note..." />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={async () => { await saveFaq({ question: selected.question, answer: selected.answer, category: "Conversation", language: selected.language, status: "Active", tags: ["conversation"] }); toast.success("Converted to FAQ."); reload(); }}>
                    Convert to FAQ
                  </Button>
                  <Button variant="outline" onClick={() => toast.success("Ticket creation can be completed from the Tickets page.")}>
                    Create Ticket
                  </Button>
                  <Button variant="outline" onClick={async () => { await markConversationReviewed(selected.id); toast.success("Conversation marked reviewed."); reload(); }}>
                    Mark Reviewed
                  </Button>
                  <Button variant="outline" onClick={async () => { if (!note.trim()) return toast.error("Add a note first."); await addConversationNote(selected.id, note); setNote(""); toast.success("Note added."); reload(); }}>
                    Add Note
                  </Button>
                </div>
              </div>
            ) : null}
          </DetailDrawer>
        </div>
      ) : null}
    </PageState>
  );
}

export function FailedAnswersPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [openFaq, setOpenFaq] = useState<FailedAnswer | null>(null);
  const form = useForm<z.infer<typeof faqMiniSchema>>({
    resolver: zodResolver(faqMiniSchema),
    defaultValues: { question: "", answer: "" },
  });

  const columns = useMemo<ColumnDef<FailedAnswer>[]>(
    () => [
      { header: "Question", cell: ({ row }) => <div className="max-w-[220px] font-medium text-slate-900">{row.original.question}</div> },
      { header: "Reason", cell: ({ row }) => row.original.reason },
      { header: "Confidence", cell: ({ row }) => `${row.original.confidence}%` },
      { header: "Language", cell: ({ row }) => row.original.language },
      { header: "Date", cell: ({ row }) => row.original.date },
      { header: "Priority", cell: ({ row }) => <StatusBadge value={row.original.priority} /> },
      { header: "Suggested Fix", cell: ({ row }) => <div className="max-w-[220px] text-sm text-slate-600">{row.original.suggestedFix}</div> },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await addKnowledgeSource({ name: `${row.original.reason} recovery source`, type: "Manual" });
                toast.success("Knowledge source added to address this gap.");
                reload();
              }}
            >
              Add Knowledge
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpenFaq(row.original);
                form.reset({ question: row.original.question, answer: row.original.suggestedFix });
              }}
            >
              Create FAQ
            </Button>
            <Button variant="ghost" onClick={() => toast.success("Escalation can be completed in the Tickets page.")}>
              Create Ticket
            </Button>
            <Button variant="ghost" onClick={async () => { await ignoreFailedAnswer(row.original.id); toast.success("Failed answer ignored."); reload(); }}>
              Ignore
            </Button>
            <Button variant="ghost" onClick={async () => { await fixFailedAnswer(row.original.id); toast.success("Failed answer marked fixed."); reload(); }}>
              Mark Fixed
            </Button>
          </div>
        ),
      },
    ],
    [form, reload],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="Monitoring" title="Failed answers" description="Capture weak replies, add missing knowledge, and turn recurring failures into approved FAQ or support workflows." />
          <DataTable columns={columns} data={data.failedAnswers.filter((item) => item.status === "Unresolved" || item.status === "Ignored")} />
          <FormModal open={Boolean(openFaq)} title="Create FAQ from failed answer" onClose={() => setOpenFaq(null)}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                await saveFaq({ question: values.question, answer: values.answer, category: "Recovery", language: "English", status: "Active", tags: ["failed-answer"] });
                toast.success("FAQ created from failed answer.");
                setOpenFaq(null);
                reload();
              })}
            >
              <Field label="Question"><Input {...form.register("question")} /></Field>
              <Field label="Answer"><Textarea {...form.register("answer")} /></Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => setOpenFaq(null)}>Cancel</Button>
                <Button type="submit">Create FAQ</Button>
              </div>
            </form>
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

export function TicketsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [selected, setSelected] = useState<Ticket | null>(null);
  const form = useForm<z.infer<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema),
    values: selected
      ? {
          status: selected.status,
          priority: selected.priority,
          assignedTo: selected.assignedTo,
          adminReply: selected.adminReply || "Support team is reviewing this case.",
          internalNotes: selected.internalNotes || "Needs follow-up.",
        }
      : undefined,
  });

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      { header: "Ticket ID", cell: ({ row }) => row.original.id },
      { header: "User Question", cell: ({ row }) => <div className="max-w-[260px] font-medium text-slate-900">{row.original.userQuestion}</div> },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Priority", cell: ({ row }) => <StatusBadge value={row.original.priority} /> },
      { header: "Assigned To", cell: ({ row }) => row.original.assignedTo },
      { header: "Created At", cell: ({ row }) => row.original.createdAt },
      { header: "Actions", cell: ({ row }) => <Button variant="outline" onClick={() => setSelected(row.original)}>Open</Button> },
    ],
    [],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="Monitoring" title="Tickets" description="Handle support escalations from weak answers, update statuses, and convert resolved cases into reusable FAQs." />
          <DataTable columns={columns} data={data.tickets} />
          <FormModal open={Boolean(selected)} title={selected?.id ?? ""} description="Ticket detail modal" onClose={() => setSelected(null)}>
            {selected ? (
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(async (values) => {
                  await saveTicket({ ...selected, ...values });
                  toast.success("Ticket updated.");
                  reload();
                })}
              >
                <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">{selected.userQuestion}</div>
                <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">{selected.botAnswer}</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Status">
                    <Select {...form.register("status")}>
                      <option>Open</option>
                      <option>Pending</option>
                      <option>Resolved</option>
                      <option>Closed</option>
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select {...form.register("priority")}>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Assigned to"><Input {...form.register("assignedTo")} /></Field>
                <Field label="Admin reply"><Textarea {...form.register("adminReply")} /></Field>
                <Field label="Internal notes"><Textarea {...form.register("internalNotes")} /></Field>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="submit">Save changes</Button>
                  <Button variant="outline" type="button" onClick={async () => { await resolveTicket(selected.id); toast.success("Ticket resolved."); reload(); }}>
                    Resolve ticket
                  </Button>
                  <Button variant="outline" type="button" onClick={async () => { await saveFaq({ question: selected.userQuestion, answer: selected.adminReply || selected.botAnswer, category: "Ticket Resolution", language: "English", status: "Active", tags: ["ticket"] }); toast.success("Solution added to FAQ."); reload(); }}>
                    Add solution to FAQ
                  </Button>
                </div>
              </form>
            ) : null}
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

export function UsersPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [openCreate, setOpenCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const createForm = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", password: "", role: "Support Agent", status: "Active" },
  });
  const editForm = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: "", email: "", role: "Support Agent", status: "Active" },
  });

  function openEditUser(user: AdminUser) {
    setEditingUser(user);
    editForm.reset({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status === "Disabled" ? "Disabled" : "Active",
    });
  }

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      { header: "Name", cell: ({ row }) => <div className="font-medium text-slate-900">{row.original.name}</div> },
      { header: "Email", cell: ({ row }) => row.original.email },
      { header: "Role", cell: ({ row }) => <StatusBadge value={row.original.role} /> },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Last Active", cell: ({ row }) => row.original.lastActive },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openEditUser(row.original)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
              aria-label={`Edit ${row.original.name}`}
              title="Edit user"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await disableUser(row.original.id);
                toast.success("User disabled.");
                reload();
              }}
              disabled={row.original.status === "Disabled"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={`Disable ${row.original.name}`}
              title="Disable user"
            >
              <Ban className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Delete ${row.original.name}? This action cannot be undone.`)) return;
                await deleteUser(row.original.id);
                toast.success("User deleted.");
                reload();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
              aria-label={`Delete ${row.original.name}`}
              title="Delete user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [reload],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Admin"
            title="Users & roles"
            description="Create teammates, assign permissions, and manage Snakitos RAG admin access across support and content workflows."
            actions={
              <Button onClick={() => setOpenCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create user
              </Button>
            }
          />
          <DataTable columns={columns} data={data.users} />
          <FormModal open={openCreate} title="Create user" description="Create a dashboard user with a role and login password." onClose={() => setOpenCreate(false)}>
            <form
              className="space-y-4"
              onSubmit={createForm.handleSubmit(async (values) => {
                await createUser(values);
                toast.success("User created.");
                setOpenCreate(false);
                createForm.reset();
                reload();
              })}
            >
              <Field label="Full name"><Input {...createForm.register("name")} /></Field>
              <Field label="Email"><Input type="email" {...createForm.register("email")} /></Field>
              <Field label="Password"><Input type="password" minLength={8} {...createForm.register("password")} /></Field>
              <Field label="Role">
                <Select {...createForm.register("role")}>
                  <option>Owner</option>
                  <option>Admin</option>
                  <option>Support Agent</option>
                  <option>Content Manager</option>
                  <option>Viewer</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select {...createForm.register("status")}>
                  <option>Active</option>
                  <option>Disabled</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => setOpenCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? "Creating..." : "Create user"}
                </Button>
              </div>
            </form>
          </FormModal>
          <FormModal open={Boolean(editingUser)} title="Edit user" description="Update profile details, role, and account status." onClose={() => setEditingUser(null)}>
            <form
              className="space-y-4"
              onSubmit={editForm.handleSubmit(async (values) => {
                if (!editingUser) return;
                await updateUser({ id: editingUser.id, ...values });
                toast.success("User updated.");
                setEditingUser(null);
                reload();
              })}
            >
              <Field label="Full name"><Input {...editForm.register("name")} /></Field>
              <Field label="Email"><Input type="email" {...editForm.register("email")} /></Field>
              <Field label="Role">
                <Select {...editForm.register("role")}>
                  <option>Owner</option>
                  <option>Admin</option>
                  <option>Support Agent</option>
                  <option>Content Manager</option>
                  <option>Viewer</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select {...editForm.register("status")}>
                  <option>Active</option>
                  <option>Disabled</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => setEditingUser(null)}>Cancel</Button>
                <Button type="submit" disabled={editForm.formState.isSubmitting}>
                  {editForm.formState.isSubmitting ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

export function AuditLogsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [admin, setAdmin] = useState("All");
  const [module, setModule] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.auditLogs.filter((log) => {
      const adminMatch = admin === "All" || log.admin === admin;
      const moduleMatch = module === "All" || log.module === module;
      const statusMatch = status === "All" || log.status === status;
      return adminMatch && moduleMatch && statusMatch;
    });
  }, [data, admin, module, status]);

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      { header: "Admin", cell: ({ row }) => row.original.admin },
      { header: "Action", cell: ({ row }) => row.original.action },
      { header: "Module", cell: ({ row }) => row.original.module },
      { header: "Time", cell: ({ row }) => row.original.time },
      { header: "IP Address", cell: ({ row }) => row.original.ipAddress },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Actions", cell: ({ row }) => <Button variant="outline" onClick={() => toast.info(`${row.original.action} by ${row.original.admin}`)}>View log details</Button> },
    ],
    [],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader eyebrow="Admin" title="Audit logs" description="Track admin activity across uploads, prompts, support, sync jobs, and settings changes." actions={<Button onClick={async () => { await exportAuditLogs(); toast.success("Audit logs exported."); reload(); }}>Export logs</Button>} />
          <SearchAndFilterBar
            search=""
            onSearchChange={() => undefined}
            placeholder="Filters only on this page"
            filters={
              <>
                <Select value={admin} onChange={(event) => setAdmin(event.target.value)}>
                  <option>All</option>
                  {[...new Set(data.auditLogs.map((item) => item.admin))].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select value={module} onChange={(event) => setModule(event.target.value)}>
                  <option>All</option>
                  {[...new Set(data.auditLogs.map((item) => item.module))].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Success</option>
                  <option>Warning</option>
                  <option>Error</option>
                </Select>
              </>
            }
          />
          <DataTable columns={columns} data={filtered} />
        </div>
      ) : null}
    </PageState>
  );
}
