import { getOverviewAnalytics } from "@/lib/services/analytics";
import { listPromptVersions } from "@/lib/services/prompts";
import { listSettings } from "@/lib/services/settings";

export async function getDashboardData() {
  const [overview, prompts, settings] = await Promise.all([
    getOverviewAnalytics(),
    listPromptVersions(),
    listSettings(),
  ]);

  return {
    overview,
    activePrompt: prompts.find((item) => item.is_active) ?? prompts[0] ?? null,
    settings,
  };
}

