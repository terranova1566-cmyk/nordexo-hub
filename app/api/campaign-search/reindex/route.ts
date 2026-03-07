import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { rebuildCampaignSearchIndex } from "@/lib/campaign-search/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const result = await rebuildCampaignSearchIndex();
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
