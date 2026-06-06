import { NextResponse } from "next/server";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { ingestUploadedFile, listUploads, storeUploadedFile, deleteUploadedFile } from "@/lib/services/ingestion";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const uploads = await listUploads();
    return NextResponse.json({ uploads });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const formData = await request.formData();
    const file = formData.get("file");
    const documentId = formData.get("documentId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const uploaded = await storeUploadedFile({
      file,
      uploadedBy: admin.id,
      documentId: typeof documentId === "string" ? documentId : null,
    });

    if (typeof documentId === "string" && documentId) {
      await ingestUploadedFile({ uploadedFileId: uploaded.id, documentId, overwrite: false });
    }

    await safeAudit({
      adminId: admin.id,
      action: "upload.create",
      entityType: "uploaded_file",
      entityId: uploaded.id,
      details: { fileName: uploaded.file_name },
      ipAddress,
    });

    return NextResponse.json({ upload: uploaded }, { status: 201 });
  });
}

export async function DELETE(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await deleteUploadedFile(id);
    await safeAudit({
      adminId: admin.id,
      action: "upload.delete",
      entityType: "uploaded_file",
      entityId: id,
      ipAddress,
    });
    return NextResponse.json({ success: true });
  });
}

