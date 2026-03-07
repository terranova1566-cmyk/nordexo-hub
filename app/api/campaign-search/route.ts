import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { startCampaignSearchRun } from "@/lib/campaign-search/service";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = createAdminSupabase();
  const { data, error } = await adminClient
    .from("campaign_search_runs")
    .select(
      "id,input_text,status,created_at,started_at,finished_at,fingerprint_version,fingerprint_model,error_message,debug_json"
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    runs: (data ?? []).map((row) => ({
      id: row.id,
      inputTextPreview: String(row.input_text ?? "").trim().slice(0, 180),
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      fingerprintVersion: row.fingerprint_version,
      fingerprintModel: row.fingerprint_model,
      errorMessage: row.error_message,
      progressPercent: Number((row.debug_json as { progress?: { percent?: number } } | null)?.progress?.percent ?? 0),
      progressLabel: String((row.debug_json as { progress?: { label?: string } } | null)?.progress?.label ?? ""),
      estimatedRemainingMs: Number(
        (row.debug_json as { progress?: { estimatedRemainingMs?: number } } | null)?.progress?.estimatedRemainingMs ?? 0
      ) || null,
      etaAt: String((row.debug_json as { progress?: { etaAt?: string } } | null)?.progress?.etaAt ?? "") || null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const inputText = String(body?.inputText ?? "").trim();
  if (!inputText) {
    return NextResponse.json({ error: "Missing inputText." }, { status: 400 });
  }

  try {
    const run = await startCampaignSearchRun({
      inputText,
      createdBy: auth.userId,
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
