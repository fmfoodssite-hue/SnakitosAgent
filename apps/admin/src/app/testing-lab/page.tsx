import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listTestCases } from "@/lib/services/tests";

export default async function TestingLabPage() {
  await requirePageAccess(["owner", "admin", "content_manager", "viewer"]);
  const testCases = (await listTestCases()) as Array<{
    id: string;
    test_name: string;
    user_message: string;
    rag_test_runs?: Array<{ pass_fail: string; hallucination_risk: string }>;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Testing Lab" title="Regression testing for prompts and retrieval" description="Store prompt tests, upload bulk cases, and review pass/fail plus hallucination risk before publishing new behavior." />
      <DataCard title="Saved Test Cases" description="Bulk CSV or XLSX imports can be normalized into these records through `/api/admin/tests`.">
        <div className="space-y-3">
          {testCases.map((testCase) => {
            const latestRun = testCase.rag_test_runs?.[0];
            return (
              <div key={testCase.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{testCase.test_name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{testCase.user_message}</p>
                  </div>
                  {latestRun ? (
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={latestRun.pass_fail === "pass" ? "success" : latestRun.pass_fail === "fail" ? "danger" : "warning"}>
                        {latestRun.pass_fail}
                      </Badge>
                      <Badge>{latestRun.hallucination_risk}</Badge>
                    </div>
                  ) : (
                    <Badge>No runs yet</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DataCard>
    </AdminPage>
  );
}
