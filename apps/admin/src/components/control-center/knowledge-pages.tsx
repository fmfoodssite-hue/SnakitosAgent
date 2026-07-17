"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { UploadCloud } from "lucide-react";
import {
  addKnowledgeSource,
  connectShopify,
  deleteChunk,
  deleteCrawlerResult,
  deleteFaq,
  deleteKnowledgeSource,
  recrawlPage,
  reembedChunk,
  reindexKnowledgeSource,
  resyncProduct,
  saveFaq,
  startCrawler,
  stopCrawler,
  syncShopify,
  toggleFaq,
  toggleProductInBot,
  uploadDocument,
  clearCrawlerResults,
} from "@/lib/mock-api";
import { clampText, formatCurrency } from "@/lib/format";
import { useControlCenterData } from "@/hooks/use-control-center-data";
import { ChartCard } from "@/components/common/ChartCard";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
import type { CrawlerLog, FaqItem, KnowledgeChunk, KnowledgeSource, Product } from "@/types";

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

const addSourceSchema = z.object({
  name: z.string().min(2, "Source name is required."),
  type: z.string().min(1),
});

export function KnowledgePage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const form = useForm<z.infer<typeof addSourceSchema>>({
    resolver: zodResolver(addSourceSchema),
    defaultValues: { name: "", type: "Website" },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.knowledgeSources.filter((source) => {
      const matchesSearch = `${source.name} ${source.addedBy}`.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "All" || source.type === typeFilter;
      const matchesStatus = statusFilter === "All" || source.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [data, search, typeFilter, statusFilter]);

  const columns = useMemo<ColumnDef<KnowledgeSource>[]>(
    () => [
      { header: "Source Name", cell: ({ row }) => <div className="font-medium text-slate-900">{row.original.name}</div> },
      { header: "Type", cell: ({ row }) => <StatusBadge value={row.original.type} /> },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Chunks", cell: ({ row }) => row.original.chunks },
      { header: "Last Updated", cell: ({ row }) => row.original.lastUpdated },
      { header: "Added By", cell: ({ row }) => row.original.addedBy },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSelectedSource(row.original)}>
              View
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await reindexKnowledgeSource(row.original.id);
                toast.success("Source queued for retraining and refreshed in the RAG index.");
                reload();
              }}
            >
              Train Source
            </Button>
            <Button variant="ghost" onClick={() => setDeleteId(row.original.id)}>
              Delete
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
          <PageHeader
            eyebrow="RAG Management"
            title="Knowledge base"
            description="Manage all approved RAG sources, inspect chunk counts, and trigger training workflows before they affect live customer answers."
            actions={
              <>
                <Button variant="outline" onClick={() => toast.success("CSV export started for knowledge sources.")}>
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await Promise.all(data.knowledgeSources.map((source) => reindexKnowledgeSource(source.id)));
                    toast.success("All sources queued for retraining.");
                    reload();
                  }}
                >
                  Train All Sources
                </Button>
                <Button onClick={() => setOpenModal(true)}>Add Source</Button>
              </>
            }
          />

          <SearchAndFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search source name or owner..."
            filters={
              <>
                <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option>All</option>
                  <option>PDF</option>
                  <option>Website</option>
                  <option>Shopify</option>
                  <option>FAQ</option>
                  <option>Manual</option>
                </Select>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>All</option>
                  <option>Indexed</option>
                  <option>Pending</option>
                  <option>Failed</option>
                </Select>
              </>
            }
          />

          <DataTable
            columns={columns}
            data={filtered}
            emptyState={<EmptyState title="No sources found" description="Adjust filters or add a new source to start training retrieval knowledge." />}
          />

          <DetailDrawer
            open={Boolean(selectedSource)}
            title={selectedSource?.name ?? ""}
            subtitle={selectedSource ? `${selectedSource.type} • ${selectedSource.status}` : ""}
            onClose={() => setSelectedSource(null)}
          >
            {selectedSource ? (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Chunks</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{selectedSource.chunks}</div>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Last trained</div>
                    <div className="mt-2 text-sm font-medium text-slate-900">{selectedSource.lastUpdated}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Sample chunks</div>
                  <div className="mt-3 space-y-3">
                    {selectedSource.sampleChunks.map((chunk) => (
                      <div key={chunk} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        {chunk}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Related conversations</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSource.relatedConversationIds.map((conversationId) => (
                      <span key={conversationId} className="rounded-full bg-[#E3BE2F]/18 px-3 py-1 text-sm text-[#8A5A18]">
                        {conversationId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </DetailDrawer>

          <ConfirmDialog
            open={Boolean(deleteId)}
            title="Delete source"
            description="This will remove the source from the RAG knowledge source list."
            onCancel={() => setDeleteId(null)}
            onConfirm={async () => {
              if (!deleteId) return;
              await deleteKnowledgeSource(deleteId);
              toast.success("Source deleted.");
              setDeleteId(null);
              reload();
            }}
          />

          <FormModal open={openModal} title="Add knowledge source" onClose={() => setOpenModal(false)}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                await addKnowledgeSource(values);
                toast.success("Knowledge source added and queued for training.");
                setOpenModal(false);
                form.reset();
                reload();
              })}
            >
              <Field label="Source name">
                <Input {...form.register("name")} />
                {form.formState.errors.name ? <p className="text-sm text-rose-600">{form.formState.errors.name.message}</p> : null}
              </Field>
              <Field label="Type">
                <Select {...form.register("type")}>
                  <option value="Website">Website</option>
                  <option value="PDF">PDF</option>
                  <option value="Shopify">Shopify</option>
                  <option value="FAQ">FAQ</option>
                  <option value="Manual">Manual</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save source</Button>
              </div>
            </form>
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

const uploadSchema = z.object({
  title: z.string().min(2, "Source title is required."),
  category: z.string().min(2, "Category is required."),
  language: z.string().min(1),
  tags: z.string().min(1, "Add at least one tag."),
  priority: z.enum(["High", "Medium", "Low"]),
  active: z.boolean(),
});

export function UploadDocumentsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const form = useForm<z.infer<typeof uploadSchema>>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      category: "Policies",
      language: "English",
      tags: "delivery, support",
      priority: "Medium",
      active: true,
    },
  });

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
  };

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="RAG Management"
            title="Upload documents"
            description="Ingest PDFs, DOCX, TXT, CSV, or JSON files, assign metadata, and push them into the Snakitos retrieval training pipeline."
          />

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-[32px] border border-dashed border-[#EACD7D] bg-[#FFFDF7] p-6 shadow-[0_12px_40px_rgba(55,54,53,0.08)]">
              <label className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                <UploadCloud className="h-10 w-10 text-[#C4862D]" />
                <div className="mt-4 text-lg font-semibold text-slate-900">Drag and drop upload area</div>
                <div className="mt-2 text-sm text-slate-500">Accepts PDF, DOCX, TXT, CSV, and JSON files.</div>
                <input type="file" multiple className="hidden" accept=".pdf,.docx,.txt,.csv,.json,.jsonl" onChange={onFileChange} />
              </label>

              <div className="mt-5 space-y-3">
                {files.length ? (
                  files.map((file) => (
                    <div key={file.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{file.name}</div>
                          <div className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>
                        </div>
                        <Button variant="ghost" onClick={() => setFiles((items) => items.filter((item) => item.name !== file.name))}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No files selected" description="Choose one or more approved Snakitos knowledge files to begin training the retrieval layer." />
                )}
              </div>
            </div>

            <form
              className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              onSubmit={form.handleSubmit(async (values) => {
                if (!files.length) {
                  toast.error("Select at least one file first.");
                  return;
                }
                setProgress(15);
                await uploadDocument({
                  title: values.title,
                  category: values.category,
                  language: values.language,
                  tags: values.tags.split(",").map((tag) => tag.trim()),
                  priority: values.priority,
                  active: values.active,
                  fileNames: files.map((file) => file.name),
                });
                setProgress(100);
                toast.success("Documents uploaded and queued for training.");
                setFiles([]);
                reload();
              })}
            >
              <Field label="Source title">
                <Input {...form.register("title")} />
              </Field>
              <Field label="Category">
                <Input {...form.register("category")} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Language">
                  <Select {...form.register("language")}>
                    <option>English</option>
                    <option>Urdu</option>
                    <option>Roman Urdu</option>
                    <option>Auto</option>
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
              <Field label="Tags">
                <Input {...form.register("tags")} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4" {...form.register("active")} />
                Active for retrieval after training
              </label>
              {progress > 0 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                    <span>Upload progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-gradient-to-r from-[#E3BE2F] to-[#C4862D]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}
              <Button type="submit" className="w-full">
                Upload and Train
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </PageState>
  );
}

const crawlerSchema = z.object({
  websiteUrl: z.string().url(),
  depth: z.coerce.number().min(1).max(5),
  includePatterns: z.string().min(1),
  excludePatterns: z.string().min(1),
  autoDetectProductPages: z.boolean(),
  autoDetectFaqPages: z.boolean(),
  autoDetectPolicyPages: z.boolean(),
  respectRobots: z.boolean(),
});

export function WebsiteCrawlerPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const form = useForm<z.input<typeof crawlerSchema>, unknown, z.output<typeof crawlerSchema>>({
    resolver: zodResolver(crawlerSchema),
    values: data ? data.crawlerSettings : undefined,
  });

  const columns = useMemo<ColumnDef<CrawlerLog>[]>(
    () => [
      { header: "URL", cell: ({ row }) => <div className="max-w-[320px] break-all text-sm text-slate-700">{row.original.url}</div> },
      { header: "Page Type", cell: ({ row }) => <StatusBadge value={row.original.pageType} /> },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Chunks", cell: ({ row }) => row.original.chunks },
      { header: "Last Crawled", cell: ({ row }) => row.original.lastCrawled },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSelectedLogId(row.original.id)}>
              View
            </Button>
            <Button variant="ghost" onClick={async () => { await recrawlPage(row.original.id); toast.success("Page re-crawled and retrained."); reload(); }}>
              Re-crawl
            </Button>
            <Button variant="ghost" onClick={async () => { await deleteCrawlerResult(row.original.id); toast.success("Crawler result removed."); reload(); }}>
              Delete
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
          <PageHeader eyebrow="RAG Management" title="Website crawler" description="Crawl `snakitos.com`, control inclusion rules, and monitor page training progress for the retrieval layer." />

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <form
              className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              onSubmit={form.handleSubmit(async (values) => {
                await startCrawler(values);
                toast.success("Crawler started.");
                reload();
              })}
            >
              <Field label="Website URL">
                <Input {...form.register("websiteUrl")} />
              </Field>
              <Field label="Crawl depth">
                <Select {...form.register("depth")}>
                  {[1, 2, 3, 4, 5].map((depth) => (
                    <option key={depth} value={depth}>{depth}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Include URL patterns">
                <Textarea {...form.register("includePatterns")} />
              </Field>
              <Field label="Exclude URL patterns">
                <Textarea {...form.register("excludePatterns")} />
              </Field>
              {[
                ["autoDetectProductPages", "Auto-detect product pages"],
                ["autoDetectFaqPages", "Auto-detect FAQ pages"],
                ["autoDetectPolicyPages", "Auto-detect policy pages"],
                ["respectRobots", "Respect robots.txt"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4" {...form.register(key as keyof z.infer<typeof crawlerSchema>)} />
                  {label}
                </label>
              ))}
              <div className="flex flex-wrap gap-3">
                <Button type="submit">Start Crawl</Button>
                <Button type="button" variant="outline" onClick={async () => { await stopCrawler(); toast.success("Crawler stopped."); reload(); }}>
                  Stop Crawl
                </Button>
                <Button type="button" variant="outline" onClick={async () => { await clearCrawlerResults(); toast.success("Crawler results cleared."); reload(); }}>
                  Clear Results
                </Button>
              </div>
            </form>

            <ChartCard title="Crawler progress" description="Latest crawl session health">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["Total pages found", data.crawlerProgress.totalPagesFound],
                  ["Pages indexed", data.crawlerProgress.pagesIndexed],
                  ["Failed pages", data.crawlerProgress.failedPages],
                  ["Current URL", data.crawlerProgress.currentUrl || "Waiting"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                  <span>Progress</span>
                  <span>{data.crawlerProgress.progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-gradient-to-r from-[#E3BE2F] to-[#C4862D]" style={{ width: `${data.crawlerProgress.progress}%` }} />
                </div>
              </div>
            </ChartCard>
          </div>

          <DataTable
            columns={columns}
            data={data.crawlerLogs}
            emptyState={<EmptyState title="No crawler results" description="Start a crawl to inspect page-level training results." />}
          />

          <DetailDrawer
            open={Boolean(selectedLogId)}
            title="Crawler page detail"
            subtitle="Page inspection"
            onClose={() => setSelectedLogId(null)}
          >
            {selectedLogId ? (
              <div className="space-y-4">
                {(() => {
                  const item = data.crawlerLogs.find((log) => log.id === selectedLogId);
                  return item ? (
                    <>
                      <div className="break-all rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">{item.url}</div>
                      <div className="flex gap-2">
                        <StatusBadge value={item.pageType} />
                        <StatusBadge value={item.status} />
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        Last crawled at {item.lastCrawled} with {item.chunks} chunks extracted for retrieval.
                      </div>
                    </>
                  ) : null;
                })()}
              </div>
            ) : null}
          </DetailDrawer>
        </div>
      ) : null}
    </PageState>
  );
}

const shopifySchema = z.object({
  storeUrl: z.string().url(),
  apiKey: z.string().min(8),
});

export function ShopifyPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [openConnect, setOpenConnect] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const form = useForm<z.infer<typeof shopifySchema>>({
    resolver: zodResolver(shopifySchema),
    defaultValues: {
      storeUrl: "https://snakitos.myshopify.com",
      apiKey: "shpat_preview_training_key",
    },
  });

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        header: "Product Image",
        cell: ({ row }) => <Image src={row.original.image} alt={row.original.name} width={56} height={56} unoptimized className="h-14 w-14 rounded-2xl object-cover" />,
      },
      { header: "Product Name", cell: ({ row }) => <div className="font-medium text-slate-900">{row.original.name}</div> },
      { header: "Price", cell: ({ row }) => formatCurrency(row.original.price) },
      { header: "Stock Status", cell: ({ row }) => <StatusBadge value={row.original.stockStatus} /> },
      { header: "Tags", cell: ({ row }) => <div className="max-w-[180px] text-sm text-slate-600">{row.original.tags.join(", ")}</div> },
      { header: "RAG Status", cell: ({ row }) => <StatusBadge value={row.original.ragStatus} /> },
      { header: "Last Synced", cell: ({ row }) => row.original.lastSynced },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.info(`${row.original.name}: ${row.original.description}`)}>
              View
            </Button>
            <Button variant="ghost" onClick={async () => { await resyncProduct(row.original.id); toast.success("Product synced and retrained."); reload(); }}>
              Re-sync
            </Button>
            <Button variant="ghost" onClick={async () => { await toggleProductInBot(row.original.id); toast.success("Product retrieval visibility updated."); reload(); }}>
              {row.original.ragStatus === "Excluded" ? "Include in Bot" : "Exclude from Bot"}
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
          <PageHeader
            eyebrow="RAG Management"
            title="Shopify sync"
            description="Pull products, stock states, and descriptions from Shopify into the Snakitos retrieval layer."
            actions={
              <>
                <Button variant="outline" onClick={() => setOpenConnect(true)}>
                  Connect Shopify
                </Button>
                <Button onClick={async () => { await syncShopify(); toast.success("Shopify catalog synced and retrained successfully."); reload(); }}>
                  Sync Now
                </Button>
                <Button variant="outline" onClick={() => setShowLogs(true)}>
                  View Sync Logs
                </Button>
              </>
            }
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Total Products", data.products.length],
              ["Synced Products", data.products.filter((item) => item.ragStatus !== "Pending").length],
              ["Out of Stock Products", data.products.filter((item) => item.stockStatus === "Out of Stock").length],
              ["Missing Descriptions", data.products.filter((item) => !item.description).length],
              ["Last Sync Time", data.shopifyConnection.lastSyncTime],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <DataTable columns={columns} data={data.products} />

          <FormModal open={openConnect} title="Connect Shopify" onClose={() => setOpenConnect(false)}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                await connectShopify(values.storeUrl, values.apiKey);
                toast.success("Shopify connection saved.");
                setOpenConnect(false);
                reload();
              })}
            >
              <Field label="Store URL">
                <Input {...form.register("storeUrl")} />
              </Field>
              <Field label="API key">
                <Input {...form.register("apiKey")} />
              </Field>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpenConnect(false)}>
                  Cancel
                </Button>
                <Button type="submit">Connect</Button>
              </div>
            </form>
          </FormModal>

          <DetailDrawer open={showLogs} title="Shopify sync logs" subtitle="Latest sync attempts" onClose={() => setShowLogs(false)}>
            <div className="space-y-3">
              {data.shopifySyncLogs.map((log) => (
                <div key={log.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{log.timestamp}</div>
                    <StatusBadge value={log.status} />
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{log.summary}</div>
                </div>
              ))}
            </div>
          </DetailDrawer>
        </div>
      ) : null}
    </PageState>
  );
}

const faqSchema = z.object({
  question: z.string().min(2, "Question required."),
  answer: z.string().min(2, "Answer required."),
  category: z.string().min(2, "Category required."),
  language: z.string().min(1),
  tags: z.string().min(1, "Tag at least one topic."),
  status: z.enum(["Active", "Disabled"]),
});

export function FaqsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [language, setLanguage] = useState("All");
  const [status, setStatus] = useState("All");
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof faqSchema>>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      question: "",
      answer: "",
      category: "Product inquiry",
      language: "English",
      tags: "support",
      status: "Active",
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.faqs.filter((faq) => {
      const matchesSearch = `${faq.question} ${faq.answer}`.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "All" || faq.category === category;
      const matchesLanguage = language === "All" || faq.language === language;
      const matchesStatus = status === "All" || faq.status === status;
      return matchesSearch && matchesCategory && matchesLanguage && matchesStatus;
    });
  }, [data, search, category, language, status]);

  const columns = useMemo<ColumnDef<FaqItem>[]>(
    () => [
      { header: "Question", cell: ({ row }) => <div className="max-w-[260px] font-medium text-slate-900">{row.original.question}</div> },
      { header: "Answer Preview", cell: ({ row }) => clampText(row.original.answer, 90) },
      { header: "Category", cell: ({ row }) => row.original.category },
      { header: "Language", cell: ({ row }) => row.original.language },
      { header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { header: "Last Updated", cell: ({ row }) => row.original.lastUpdated },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                form.reset({
                  question: row.original.question,
                  answer: row.original.answer,
                  category: row.original.category,
                  language: row.original.language,
                  tags: row.original.tags.join(", "),
                  status: row.original.status,
                });
                setOpen(true);
              }}
            >
              Edit FAQ
            </Button>
            <Button variant="ghost" onClick={async () => { await deleteFaq(row.original.id); toast.success("FAQ deleted."); reload(); }}>
              Delete
            </Button>
            <Button variant="ghost" onClick={async () => { await toggleFaq(row.original.id); toast.success("FAQ status updated."); reload(); }}>
              Enable/Disable
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
          <PageHeader
            eyebrow="RAG Management"
            title="FAQs"
            description="Curate approved question-answer pairs for common Snakitos support topics and multilingual customer flows."
            actions={<Button onClick={() => { setEditing(null); form.reset(); setOpen(true); }}>Add FAQ</Button>}
          />
          <SearchAndFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search FAQ..."
            filters={
              <>
                <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>All</option>
                  {[...new Set(data.faqs.map((faq) => faq.category))].map((item) => <option key={item}>{item}</option>)}
                </Select>
                <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option>All</option>
                  <option>English</option>
                  <option>Urdu</option>
                  <option>Roman Urdu</option>
                </Select>
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>All</option>
                  <option>Active</option>
                  <option>Disabled</option>
                </Select>
              </>
            }
          />
          <DataTable columns={columns} data={filtered} />
          <FormModal open={open} title={editing ? "Edit FAQ" : "Add FAQ"} onClose={() => setOpen(false)}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                await saveFaq({
                  id: editing?.id,
                  question: values.question,
                  answer: values.answer,
                  category: values.category,
                  language: values.language as FaqItem["language"],
                  status: values.status,
                  tags: values.tags.split(",").map((item) => item.trim()),
                });
                toast.success(editing ? "FAQ updated." : "FAQ created.");
                setOpen(false);
                setEditing(null);
                reload();
              })}
            >
              <Field label="Question"><Input {...form.register("question")} /></Field>
              <Field label="Answer"><Textarea {...form.register("answer")} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Category"><Input {...form.register("category")} /></Field>
                <Field label="Language">
                  <Select {...form.register("language")}>
                    <option>English</option>
                    <option>Urdu</option>
                    <option>Roman Urdu</option>
                  </Select>
                </Field>
              </div>
              <Field label="Tags"><Input {...form.register("tags")} /></Field>
              <Field label="Status">
                <Select {...form.register("status")}>
                  <option>Active</option>
                  <option>Disabled</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">Save FAQ</Button>
              </div>
            </form>
          </FormModal>
        </div>
      ) : null}
    </PageState>
  );
}

export function ChunksPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [sourceFilter, setSourceFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KnowledgeChunk | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.knowledgeChunks.filter((chunk) => {
      const matchesSearch = `${chunk.textPreview} ${chunk.fullText}`.toLowerCase().includes(search.toLowerCase());
      const matchesSource = sourceFilter === "All" || chunk.source === sourceFilter;
      const matchesStatus = statusFilter === "All" || chunk.embeddingStatus === statusFilter;
      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [data, search, sourceFilter, statusFilter]);

  const columns = useMemo<ColumnDef<KnowledgeChunk>[]>(
    () => [
      { header: "Chunk ID", cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.id}</span> },
      { header: "Source", cell: ({ row }) => row.original.source },
      { header: "Text Preview", cell: ({ row }) => <div className="max-w-[280px] text-sm text-slate-600">{clampText(row.original.textPreview, 90)}</div> },
      { header: "Tokens", cell: ({ row }) => row.original.tokens },
      { header: "Embedding Status", cell: ({ row }) => <StatusBadge value={row.original.embeddingStatus} /> },
      { header: "Relevance Score", cell: ({ row }) => row.original.relevanceScore.toFixed(2) },
      { header: "Last Updated", cell: ({ row }) => row.original.lastUpdated },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSelected(row.original)}>View full chunk</Button>
            <Button variant="ghost" onClick={async () => { await reembedChunk(row.original.id); toast.success("Chunk re-embedded."); reload(); }}>
              Re-embed
            </Button>
            <Button variant="ghost" onClick={() => setDeleteId(row.original.id)}>Delete</Button>
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
          <PageHeader eyebrow="RAG Management" title="Chunks" description="Inspect chunk text, token counts, and embedding health for the Snakitos retrieval engine." />
          <SearchAndFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search chunk text..."
            filters={
              <>
                <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option>All</option>
                  {[...new Set(data.knowledgeChunks.map((chunk) => chunk.source))].map((source) => <option key={source}>{source}</option>)}
                </Select>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>All</option>
                  <option>Indexed</option>
                  <option>Pending</option>
                  <option>Failed</option>
                </Select>
              </>
            }
          />
          <DataTable columns={columns} data={filtered} />
          <DetailDrawer open={Boolean(selected)} title={selected?.id ?? ""} subtitle={selected?.source} onClose={() => setSelected(null)}>
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{selected.fullText}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Tokens</div><div className="mt-2 text-lg font-semibold text-slate-900">{selected.tokens}</div></div>
                  <div className="rounded-3xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Embedding status</div><div className="mt-2"><StatusBadge value={selected.embeddingStatus} /></div></div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Example questions</div>
                  <div className="mt-3 space-y-2">
                    {selected.exampleQuestions.map((question) => (
                      <div key={question} className="rounded-3xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{question}</div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </DetailDrawer>
          <ConfirmDialog
            open={Boolean(deleteId)}
            title="Delete chunk"
            description="This removes the chunk from the mock index inspector."
            onCancel={() => setDeleteId(null)}
            onConfirm={async () => {
              if (!deleteId) return;
              await deleteChunk(deleteId);
              toast.success("Chunk deleted.");
              setDeleteId(null);
              reload();
            }}
          />
        </div>
      ) : null}
    </PageState>
  );
}
