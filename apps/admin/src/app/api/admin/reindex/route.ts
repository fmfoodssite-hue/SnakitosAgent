import { NextResponse } from "next/server";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { ingestUploadedFile } from "@/lib/services/ingestion";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = (await request.json()) as { uploadedFileId?: string; documentId?: string };
    if (!body.uploadedFileId || !body.documentId) {
      return NextResponse.json({ error: "uploadedFileId and documentId are required" }, { status: 400 });
    }

    const chunks = await ingestUploadedFile({
      uploadedFileId: body.uploadedFileId,
      documentId: body.documentId,
      overwrite: true,
    });

    await safeAudit({
      adminId: admin.id,
      action: "upload.reindex",
      entityType: "uploaded_file",
      entityId: body.uploadedFileId,
      details: { chunkCount: chunks.length },
      ipAddress,
    });

    return NextResponse.json({ success: true, chunkCount: chunks.length });
  });
}

