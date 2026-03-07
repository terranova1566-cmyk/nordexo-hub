import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { getCampaignSearchRun } from "@/lib/campaign-search/service";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { runId } = await context.params;
  if (!runId) {
    return NextResponse.json({ error: "Missing runId." }, { status: 400 });
  }

  try {
    const run = await getCampaignSearchRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
