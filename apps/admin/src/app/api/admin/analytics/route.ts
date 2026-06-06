import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/server";
import { getDeepAnalytics, getOverviewAnalytics } from "@/lib/services/analytics";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    const [overview, analytics] = await Promise.all([getOverviewAnalytics(), getDeepAnalytics()]);
    return NextResponse.json({ overview, analytics });
  });
}

