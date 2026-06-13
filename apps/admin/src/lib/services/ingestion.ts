import { createHash } from "crypto";
import { env } from "@/lib/env";
import { assertServiceClient } from "@/lib/db";
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "@/lib/constants";
import OpenAI from "openai";

type ExtractedFile = {
  text: string;
  metadata: Record<string, unknown>;
};

type StepLogger = (step: string, progress: number, log?: string) => Promise<void>;

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

// ---------------------------------------------------------------------------
// TEXT SANITIZATION & CHUNKING
// ---------------------------------------------------------------------------

function sanitizeText(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/ignore previous instructions/gi, "[sanitized]")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(input: string, size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  const normalized = sanitizeText(input);
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += size - overlap) {
    const slice = normalized.slice(index, index + size).trim();
    if (slice.length > 10) chunks.push(slice);
  }
  return chunks;
}

function detectLanguage(text: string): string {
  const urduPattern = /[\u0600-\u06FF]/;
  const romanUrduWords = /\b(hai|hain|tha|thi|ka|ki|ke|aur|mein|se|ko|ne|par|yeh|woh|ap|kya)\b/i;
  if (urduPattern.test(text)) return "Urdu";
  if (romanUrduWords.test(text)) return "Roman Urdu";
  return "English";
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// FILE EXTRACTION
// ---------------------------------------------------------------------------

async function extractPdf(buffer: Buffer): Promise<ExtractedFile> {
  const parserModule = await import("pdf-parse").catch(() => null);
  if (!parserModule) throw new Error("pdf-parse is not installed.");
  const result = await parserModule.default(buffer);
  return { text: result.text, metadata: { pages: result.numpages } };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedFile> {
  const parserModule = await import("mammoth").catch(() => null);
  if (!parserModule) throw new Error("mammoth is not installed.");
  const result = await parserModule.extractRawText({ buffer });
  return { text: result.value, metadata: {} };
}

async function extractCsvOrSpreadsheet(buffer: Buffer, extension: string): Promise<ExtractedFile> {
  const parserModule = await import("xlsx").catch(() => null);
  if (!parserModule) {
    return { text: buffer.toString("utf8"), metadata: { parser: "plain-text-fallback", extension } };
  }
  const workbook = parserModule.read(buffer, { type: "buffer" });
  const text = workbook.SheetNames.map((sheetName) =>
    parserModule.utils.sheet_to_csv(workbook.Sheets[sheetName]),
  ).join("\n\n");
  return { text, metadata: { sheets: workbook.SheetNames } };
}

async function extractJson(buffer: Buffer): Promise<ExtractedFile> {
  try {
    const obj = JSON.parse(buffer.toString("utf8"));
    return { text: JSON.stringify(obj, null, 2), metadata: { format: "json" } };
  } catch {
    return { text: buffer.toString("utf8"), metadata: { format: "json-invalid" } };
  }
}

async function extractXml(buffer: Buffer): Promise<ExtractedFile> {
  const text = buffer.toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { text, metadata: { format: "xml" } };
}

async function extractHtml(buffer: Buffer): Promise<ExtractedFile> {
  const text = buffer
    .toString("utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, metadata: { format: "html" } };
}

export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  switch (extension) {
    case "pdf":   return extractPdf(buffer);
    case "docx":  return extractDocx(buffer);
    case "pptx":
    case "ppt":   return { text: `PPTX/PPT: ${file.name} (requires office parser)`, metadata: { format: extension, extractable: false } };
    case "csv":
    case "xlsx":
    case "xls":   return extractCsvOrSpreadsheet(buffer, extension);
    case "json":  return extractJson(buffer);
    case "jsonl": {
      const rows = buffer.toString("utf8").split(/\r?\n/).filter(Boolean)
        .map((line) => { try { return JSON.stringify(JSON.parse(line)); } catch { return line; } })
        .join("\n");
      return { text: rows, metadata: { format: "jsonl" } };
    }
    case "xml":   return extractXml(buffer);
    case "html":
    case "htm":   return extractHtml(buffer);
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":  return { text: `Image file: ${file.name} (vision extraction not configured)`, metadata: { format: extension, extractable: false } };
    case "zip":   return { text: `ZIP archive: ${file.name} (extraction requires server-side unzip)`, metadata: { format: "zip", extractable: false } };
    default:      return { text: buffer.toString("utf8"), metadata: { format: extension || "txt" } };
  }
}

// ---------------------------------------------------------------------------
// STORAGE (legacy path — apps/admin/src/app/api/admin/upload)
// ---------------------------------------------------------------------------

export async function storeUploadedFile(input: {
  file: File;
  uploadedBy: string;
  documentId?: string | null;
}) {
  const supabase = assertServiceClient();
  const storagePath = `${Date.now()}-${input.file.name.replace(/\s+/g, "-")}`;
  const arrayBuffer = await input.file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(env.UPLOAD_STORAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("uploaded_files")
    .insert({
      file_name: input.file.name,
      file_type: input.file.type || "application/octet-stream",
      storage_path: storagePath,
      file_size: input.file.size,
      uploaded_by: input.uploadedBy,
      document_id: input.documentId ?? null,
      extraction_status: "pending",
      embedding_status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// INGESTION WITH JOB TRACKING (new production path)
// ---------------------------------------------------------------------------

async function makeStepLogger(jobId: string): Promise<StepLogger> {
  const supabase = assertServiceClient();
  const logs: Array<{ step: string; at: string; message?: string }> = [];

  return async (step: string, progress: number, log?: string) => {
    logs.push({ step, at: new Date().toISOString(), message: log });
    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: step,
        progress,
        logs_json: logs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  };
}

export async function ingestUploadedFile(input: {
  uploadedFileId: string;
  documentId: string;
  overwrite?: boolean;
}) {
  const supabase = assertServiceClient();
  const { data: uploadedFile, error: fileError } = await supabase
    .from("uploaded_files")
    .select("*")
    .eq("id", input.uploadedFileId)
    .single();

  if (fileError || !uploadedFile) throw fileError ?? new Error("Uploaded file not found.");

  await supabase
    .from("uploaded_files")
    .update({ extraction_status: "processing", embedding_status: "processing" })
    .eq("id", input.uploadedFileId);

  const { data: binaryFile, error: downloadError } = await supabase.storage
    .from(env.UPLOAD_STORAGE_BUCKET)
    .download(uploadedFile.storage_path);

  if (downloadError || !binaryFile) throw downloadError ?? new Error("Failed to download uploaded file.");

  const file = new File([await binaryFile.arrayBuffer()], uploadedFile.file_name, {
    type: uploadedFile.file_type,
  });

  const extracted = await extractTextFromFile(file);
  const chunks = chunkText(extracted.text);

  if (input.overwrite) {
    await supabase.from("knowledge_chunks").delete().eq("document_id", input.documentId);
  }

  const rows = await Promise.all(
    chunks.map(async (content, index) => {
      const embedding = openai
        ? (
            await openai.embeddings.create({
              model: env.OPENAI_EMBEDDING_MODEL,
              input: content,
            })
          ).data[0]?.embedding
        : null;

      return {
        document_id: input.documentId,
        uploaded_file_id: input.uploadedFileId,
        chunk_index: index,
        content,
        token_estimate: Math.ceil(content.length / 4),
        embedding,
        embedding_status: embedding ? "completed" : "pending",
        metadata: extracted.metadata,
      };
    }),
  );

  const { error: chunkError } = await supabase.from("knowledge_chunks").insert(rows);
  if (chunkError) throw chunkError;

  await supabase
    .from("uploaded_files")
    .update({
      extraction_status: "completed",
      embedding_status: openai ? "completed" : "pending",
      chunk_count: rows.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.uploadedFileId);

  return rows;
}

// ---------------------------------------------------------------------------
// PRODUCTION INGESTION with ingestion_jobs tracking
// ---------------------------------------------------------------------------

export async function startProductionIngestion(input: {
  file: File;
  adminId: string;
  sourceId?: string | null;
  documentId?: string | null;
  overwrite?: boolean;
}) {
  const supabase = assertServiceClient();
  const startedAt = new Date().toISOString();

  // Create ingestion job record
  const { data: job, error: jobError } = await supabase
    .from("ingestion_jobs")
    .insert({
      source_id: input.sourceId ?? null,
      document_id: input.documentId ?? null,
      job_type: "file_ingest",
      status: "running",
      current_step: "upload",
      progress: 0,
      started_at: startedAt,
      created_by: input.adminId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("Failed to create ingestion job", jobError);
    // Proceed without job tracking
    return ingestFileDirect(input);
  }

  const logStep = await makeStepLogger(job.id);

  try {
    // Step 1: Upload file to storage
    await logStep("upload", 5, `Uploading ${input.file.name}`);
    const storagePath = `${Date.now()}-${input.file.name.replace(/\s+/g, "-")}`;
    const arrayBuffer = await input.file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await supabase.storage.from(env.UPLOAD_STORAGE_BUCKET).upload(storagePath, arrayBuffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });

    // Step 2: Extract text
    await logStep("extract", 20, "Extracting text content");
    const file = new File([buffer], input.file.name, { type: input.file.type });
    const extracted = await extractTextFromFile(file);

    // Step 3: Detect language
    await logStep("language", 30, "Detecting language");
    const language = detectLanguage(extracted.text.slice(0, 500));

    // Step 4: Compute content hash
    await logStep("hash", 35, "Computing content hash");
    const hash = contentHash(extracted.text);

    // Step 5: Chunk text
    await logStep("chunk", 40, "Splitting into chunks");
    const chunks = chunkText(extracted.text);

    if (chunks.length === 0) {
      await supabase.from("ingestion_jobs").update({
        status: "completed",
        current_step: "done",
        progress: 100,
        chunks_created: 0,
        completed_at: new Date().toISOString(),
        warnings_json: ["No extractable text found in file"],
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return { jobId: job.id, chunksCreated: 0, status: "completed_empty" };
    }

    // Step 6: Embed chunks
    await logStep("embed", 50, `Embedding ${chunks.length} chunks`);
    const embeddedChunks = await Promise.all(
      chunks.map(async (content, index) => {
        const hash2 = contentHash(content);
        let embedding: number[] | null = null;

        if (openai) {
          try {
            const result = await openai.embeddings.create({
              model: env.OPENAI_EMBEDDING_MODEL,
              input: content,
            });
            embedding = result.data[0]?.embedding ?? null;
          } catch (embedErr) {
            console.error(`Embedding failed for chunk ${index}`, embedErr);
          }
        }

        return {
          document_id: input.documentId ?? null,
          chunk_index: index,
          content,
          token_estimate: Math.ceil(content.length / 4),
          embedding,
          embedding_status: embedding ? "completed" : "pending",
          content_hash: hash2,
          metadata: { ...extracted.metadata, language, source_hash: hash },
        };
      }),
    );

    await logStep("save_chunks", 80, "Saving chunks to database");

    if (input.overwrite && input.documentId) {
      await supabase.from("knowledge_chunks").delete().eq("document_id", input.documentId);
    }

    const { error: chunkError } = await supabase.from("knowledge_chunks").insert(embeddedChunks);
    if (chunkError) throw chunkError;

    // Step 7: Update source/document
    await logStep("finalize", 95, "Finalizing records");

    if (input.documentId) {
      await supabase
        .from("knowledge_documents")
        .update({
          status: "active",
          chunk_count: chunks.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.documentId);
    }

    if (input.sourceId) {
      await supabase.from("knowledge_sources").update({
        status: "active",
        chunk_count: chunks.length,
        embedding_count: embeddedChunks.filter((c) => c.embedding).length,
        content_hash: hash,
        language,
        last_ingested_at: new Date().toISOString(),
        last_embedded_at: openai ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", input.sourceId);
    }

    // Step 8: Complete job
    await supabase.from("ingestion_jobs").update({
      status: "completed",
      current_step: "done",
      progress: 100,
      chunks_created: chunks.length,
      embeddings_created: embeddedChunks.filter((c) => c.embedding).length,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    return { jobId: job.id, chunksCreated: chunks.length, status: "completed" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown ingestion error";
    await supabase.from("ingestion_jobs").update({
      status: "failed",
      current_step: "error",
      error_message: errorMsg,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    throw err;
  }
}

// Direct ingestion without job tracking (fallback)
async function ingestFileDirect(input: {
  file: File;
  adminId: string;
  documentId?: string | null;
  overwrite?: boolean;
}) {
  const extracted = await extractTextFromFile(input.file);
  const chunks = chunkText(extracted.text);
  const supabase = assertServiceClient();

  if (input.overwrite && input.documentId) {
    await supabase.from("knowledge_chunks").delete().eq("document_id", input.documentId);
  }

  const rows = await Promise.all(
    chunks.map(async (content, index) => ({
      document_id: input.documentId ?? null,
      chunk_index: index,
      content,
      token_estimate: Math.ceil(content.length / 4),
      embedding: null,
      embedding_status: "pending",
      metadata: extracted.metadata,
    })),
  );

  if (rows.length > 0) {
    await supabase.from("knowledge_chunks").insert(rows);
  }

  return { jobId: null, chunksCreated: rows.length, status: "completed" };
}

// ---------------------------------------------------------------------------
// LIST / DELETE (legacy compat for /api/admin/upload)
// ---------------------------------------------------------------------------

export async function listUploads() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("*, knowledge_documents(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteUploadedFile(id: string) {
  const supabase = assertServiceClient();
  const { data: file, error } = await supabase.from("uploaded_files").select("*").eq("id", id).single();
  if (error || !file) throw error ?? new Error("File not found.");
  await supabase.from("knowledge_chunks").delete().eq("uploaded_file_id", id);
  await supabase.storage.from(env.UPLOAD_STORAGE_BUCKET).remove([file.storage_path]);
  await supabase.from("uploaded_files").delete().eq("id", id);
}
