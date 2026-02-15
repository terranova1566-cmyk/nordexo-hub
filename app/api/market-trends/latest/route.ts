import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Scope = "site" | "all";
type Period = "daily" | "weekly";

const allowedScopes: Scope[] = ["site", "all"];
const allowedPeriods: Period[] = ["daily", "weekly"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeParam = (searchParams.get("scope") ?? "all").toLowerCase();
  const periodParam = (searchParams.get("period") ?? "weekly").toLowerCase();
  const provider = (searchParams.get("provider") ?? "").trim().toLowerCase();

  const scope = allowedScopes.includes(scopeParam as Scope)
    ? (scopeParam as Scope)
    : "all";
  const period = allowedPeriods.includes(periodParam as Period)
    ? (periodParam as Period)
    : "weekly";

  if (scope === "site" && !provider) {
    return NextResponse.json(
      { error: "Missing provider (required when scope=site)." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("market_trend_reports")
    .select(
      "id, scope, provider, period, period_start, period_end, report_markdown, condensed_markdown, report_json, condensed_json, created_at, updated_at"
    )
    .eq("scope", scope)
    .eq("period", period)
    .order("period_start", { ascending: false })
    .limit(1);

  if (scope === "site") {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({
      report: null,
      error: "Unable to load market trends report.",
      details: error.message,
    });
  }

  return NextResponse.json({ report: data ?? null });
}

