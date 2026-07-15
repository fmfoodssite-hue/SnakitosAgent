import { withAdminAccess } from "@/lib/server";
import { getAdminInteractions } from "@/lib/admin-data";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const sessions = await getAdminInteractions();
      return successResponse(sessions);
    } catch (error) {
      console.error("Failed to load interactions", error);
      return errorResponse("INTERACTIONS_LOAD_FAILED", "Failed to load interactions.", 500);
    }
  });
}
