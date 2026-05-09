import { FailedQuestionsManager } from "@/components/dashboard/failed-questions-manager";
import { getFailedQuestions } from "@/lib/admin/data";

export default async function FailedQuestionsPage() {
  const items = await getFailedQuestions();

  return <FailedQuestionsManager items={items} />;
}
