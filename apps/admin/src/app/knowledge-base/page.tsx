import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageAccess } from "@/lib/page-auth";
import { listKnowledgeDocuments } from "@/lib/services/knowledge";

export default async function KnowledgeBasePage() {
  await requirePageAccess(["owner", "admin", "content_manager", "support_agent", "viewer"]);
  const documents = await listKnowledgeDocuments();

  return (
    <AdminPage>
      <PageIntro eyebrow="Knowledge Base" title="Manage live RAG documents" description="Create, activate, archive, and review the source content powering product, policy, and support answers." />
      <DataCard title="Knowledge Documents" description="Use `/api/admin/knowledge` to create, edit, archive, and delete records.">
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Source</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Updated</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className="font-medium text-white">{document.title}</TableCell>
                  <TableCell>{document.category}</TableCell>
                  <TableCell>{document.source_type}</TableCell>
                  <TableCell><Badge tone={document.status === "active" ? "success" : document.status === "archived" ? "warning" : "default"}>{document.status}</Badge></TableCell>
                  <TableCell>{document.priority}</TableCell>
                  <TableCell>{new Date(document.updated_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataCard>
    </AdminPage>
  );
}

