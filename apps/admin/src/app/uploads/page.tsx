import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listUploads } from "@/lib/services/ingestion";

export default async function UploadsPage() {
  await requirePageAccess(["owner", "admin", "content_manager", "viewer"]);
  const uploads = (await listUploads()) as Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
    extraction_status: string;
    embedding_status: string;
    chunk_count: number;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Uploads" title="File ingestion pipeline" description="Upload PDF, TXT, CSV, DOCX, and JSONL knowledge sources, preview chunking, and track embedding status." />
      <div className="grid gap-4 md:grid-cols-3">
        {uploads.slice(0, 3).map((upload) => (
          <DataCard key={upload.id} title={upload.file_name} description={`${upload.file_type} • ${(upload.file_size / 1024).toFixed(1)} KB`}>
            <div className="flex flex-wrap gap-2">
              <Badge tone={upload.extraction_status === "completed" ? "success" : upload.extraction_status === "failed" ? "danger" : "warning"}>
                {upload.extraction_status}
              </Badge>
              <Badge tone={upload.embedding_status === "completed" ? "success" : upload.embedding_status === "failed" ? "danger" : "warning"}>
                {upload.embedding_status}
              </Badge>
            </div>
            <p className="text-sm text-zinc-400">{upload.chunk_count} chunks indexed</p>
          </DataCard>
        ))}
      </div>
      <DataCard title="All Uploaded Files">
        <div className="space-y-3">
          {uploads.map((upload) => (
            <div key={upload.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{upload.file_name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{upload.storage_path}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{upload.chunk_count} chunks</Badge>
                  <Badge tone={upload.embedding_status === "completed" ? "success" : "warning"}>{upload.embedding_status}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DataCard>
    </AdminPage>
  );
}
