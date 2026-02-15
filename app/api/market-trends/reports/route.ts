import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Scope = "site" | "all";
type Period = "daily" | "weekly";

const allowedScopes: Scope[] = ["site", "all"];
const allowedPeriods: Period[] = ["daily", "weekly"];

const clampInt = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeParam = (searchParams.get("scope") ?? "all").toLowerCase();
  const periodParam = (searchParams.get("period") ?? "weekly").toLowerCase();
  const provider = (searchParams.get("provider") ?? "").trim().toLowerCase();
  const limit = clampInt(searchParams.get("limit"), 20, 1, 100);
  const start = (searchParams.get("start") ?? "").trim();
  const end = (searchParams.get("end") ?? "").trim();

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
      "id, scope, provider, period, period_start, period_end, report_markdown, condensed_markdown, created_at, updated_at"
    )
    .eq("scope", scope)
    .eq("period", period)
    .order("period_start", { ascending: false })
    .limit(limit);

  if (scope === "site") {
    query = query.eq("provider", provider);
  }

  // Date filters are optional. Expect YYYY-MM-DD.
  if (start) {
    query = query.gte("period_start", start);
  }
  if (end) {
    query = query.lte("period_start", end);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({
      reports: [],
      error: "Unable to load market trends reports.",
      details: error.message,
    });
  }

  return NextResponse.json({ reports: data ?? [] });
}

