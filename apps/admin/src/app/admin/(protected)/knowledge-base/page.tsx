import { KnowledgeBaseManager } from "@/components/dashboard/knowledge-base-manager";
import { getKnowledgeDocuments } from "@/lib/admin/data";

export default async function KnowledgeBasePage() {
  const documents = await getKnowledgeDocuments();
  return <KnowledgeBaseManager documents={documents} />;
}
