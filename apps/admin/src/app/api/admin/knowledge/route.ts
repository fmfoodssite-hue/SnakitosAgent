import { NextResponse } from "next/server";
import { withAdminAccess, parseJson, safeAudit } from "@/lib/server";
import { knowledgeSchema } from "@/lib/validations";
import { createKnowledgeDocument, deleteKnowledgeDocument, listKnowledgeDocuments, updateKnowledgeDocument } from "@/lib/services/knowledge";
import type { Json } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "support_agent", "viewer"], async () => {
    const documents = await listKnowledgeDocuments();
    return NextResponse.json({ documents });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const parsed = await parseJson(request, knowledgeSchema);
    if (parsed instanceof NextResponse) {
      return parsed;
    }

    const document = await createKnowledgeDocument({
      ...parsed,
      metadata: parsed.metadata as Record<string, Json>,
      created_by: admin.id,
      updated_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "knowledge.create",
      entityType: "knowledge_document",
      entityId: document.id,
      details: { title: document.title, category: document.category },
      ipAddress,
    });

    return NextResponse.json({ document }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const parsed = knowledgeSchema.partial().safeParse(body);

    if (!id || !parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.success ? [] : parsed.error.issues }, { status: 400 });
    }

    const document = await updateKnowledgeDocument(id, {
      ...parsed.data,
      metadata: parsed.data.metadata as Record<string, Json> | undefined,
      updated_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "knowledge.update",
      entityType: "knowledge_document",
      entityId: id,
      details: parsed.data,
      ipAddress,
    });

    return NextResponse.json({ document });
  });
}

export async function DELETE(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await deleteKnowledgeDocument(id);
    await safeAudit({
      adminId: admin.id,
      action: "knowledge.delete",
      entityType: "knowledge_document",
      entityId: id,
      ipAddress,
    });

    return NextResponse.json({ success: true });
  });
}
