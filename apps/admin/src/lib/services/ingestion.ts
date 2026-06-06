import { env } from "@/lib/env";
import { assertServiceClient } from "@/lib/db";
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "@/lib/constants";
import OpenAI from "openai";

type ExtractedFile = {
  text: string;
  metadata: Record<string, unknown>;
};

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

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
    if (slice) {
      chunks.push(slice);
    }
  }

  return chunks;
}

async function extractPdf(buffer: Buffer) {
  const parserModule = await import("pdf-parse").catch(() => null);
  if (!parserModule) {
    throw new Error("pdf-parse is not installed.");
  }

  const result = await parserModule.default(buffer);
  return { text: result.text, metadata: { pages: result.numpages } } satisfies ExtractedFile;
}

async function extractDocx(buffer: Buffer) {
  const parserModule = await import("mammoth").catch(() => null);
  if (!parserModule) {
    throw new Error("mammoth is not installed.");
  }

  const result = await parserModule.extractRawText({ buffer });
  return { text: result.value, metadata: {} } satisfies ExtractedFile;
}

async function extractCsvOrSpreadsheet(buffer: Buffer, extension: string) {
  const parserModule = await import("xlsx").catch(() => null);
  if (!parserModule) {
    const text = buffer.toString("utf8");
    return { text, metadata: { parser: "plain-text-fallback", extension } } satisfies ExtractedFile;
  }

  const workbook = parserModule.read(buffer, { type: "buffer" });
  const text = workbook.SheetNames.map((sheetName) =>
    parserModule.utils.sheet_to_csv(workbook.Sheets[sheetName]),
  ).join("\n\n");
  return { text, metadata: { sheets: workbook.SheetNames } } satisfies ExtractedFile;
}

export async function extractTextFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    return extractPdf(buffer);
  }

  if (extension === "docx") {
    return extractDocx(buffer);
  }

  if (extension === "csv" || extension === "xlsx") {
    return extractCsvOrSpreadsheet(buffer, extension);
  }

  if (extension === "jsonl") {
    const rows = buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.stringify(JSON.parse(line)))
      .join("\n");
    return { text: rows, metadata: { format: "jsonl" } } satisfies ExtractedFile;
  }

  return { text: buffer.toString("utf8"), metadata: { format: extension || "txt" } } satisfies ExtractedFile;
}

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

  if (uploadError) {
    throw uploadError;
  }

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

  if (error) {
    throw error;
  }

  return data;
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

  if (fileError || !uploadedFile) {
    throw fileError ?? new Error("Uploaded file not found.");
  }

  await supabase
    .from("uploaded_files")
    .update({ extraction_status: "processing", embedding_status: "processing" })
    .eq("id", input.uploadedFileId);

  const { data: binaryFile, error: downloadError } = await supabase.storage
    .from(env.UPLOAD_STORAGE_BUCKET)
    .download(uploadedFile.storage_path);

  if (downloadError || !binaryFile) {
    throw downloadError ?? new Error("Failed to download uploaded file.");
  }

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
      const embedding =
        openai
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
  if (chunkError) {
    throw chunkError;
  }

  const { error: fileUpdateError } = await supabase
    .from("uploaded_files")
    .update({
      extraction_status: "completed",
      embedding_status: openai ? "completed" : "pending",
      chunk_count: rows.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.uploadedFileId);

  if (fileUpdateError) {
    throw fileUpdateError;
  }

  return rows;
}

export async function listUploads() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("*, knowledge_documents(title)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function deleteUploadedFile(id: string) {
  const supabase = assertServiceClient();
  const { data: file, error } = await supabase.from("uploaded_files").select("*").eq("id", id).single();
  if (error || !file) {
    throw error ?? new Error("File not found.");
  }

  await supabase.from("knowledge_chunks").delete().eq("uploaded_file_id", id);
  await supabase.storage.from(env.UPLOAD_STORAGE_BUCKET).remove([file.storage_path]);
  await supabase.from("uploaded_files").delete().eq("id", id);
}
