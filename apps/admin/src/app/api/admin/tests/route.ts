import { NextResponse } from "next/server";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { ragTestCaseSchema, ragTestRunSchema } from "@/lib/validations";
import { createTestCase, createTestRun, listTestCases } from "@/lib/services/tests";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const testCases = await listTestCases();
    return NextResponse.json({ testCases });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = await request.json();
    if (body.mode === "run") {
      const parsedRun = ragTestRunSchema.safeParse(body);
      if (!parsedRun.success) {
        return NextResponse.json({ error: "Validation failed", issues: parsedRun.error.issues }, { status: 400 });
      }

      const run = await createTestRun({
        ...parsedRun.data,
        run_by: admin.id,
      });
      await safeAudit({
        adminId: admin.id,
        action: "test.run",
        entityType: "rag_test_run",
        entityId: String(run.id),
        details: { pass_fail: run.pass_fail },
        ipAddress,
      });
      return NextResponse.json({ run }, { status: 201 });
    }

    const parsed = ragTestCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
    }

    const testCase = await createTestCase({
      ...parsed.data,
      created_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "test.create_case",
      entityType: "rag_test_case",
      entityId: String(testCase.id),
      details: { testName: testCase.test_name },
      ipAddress,
    });

    return NextResponse.json({ testCase }, { status: 201 });
  });
}
