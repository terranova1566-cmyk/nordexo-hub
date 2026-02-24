import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const clampInt = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = (searchParams.get("date") || "").trim();
  const limit = clampInt(searchParams.get("limit"), 100, 10, 200);

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("market_sales_vector_snapshots")
    .select("id, snapshot_date, total_items, source_counts, generation_meta, created_at, updated_at")
    .order("snapshot_date", { ascending: false })
    .limit(30);

  if (snapshotsError) {
    return NextResponse.json(
      {
        snapshot: null,
        report: null,
        items: [],
        available_dates: [],
        source_stats: [],
        error: "Unable to load sales vector snapshots.",
        details: snapshotsError.message,
      },
      { status: 500 }
    );
  }

  const snapshotRows = snapshots ?? [];
  if (snapshotRows.length === 0) {
    return NextResponse.json({
      snapshot: null,
      report: null,
      items: [],
      available_dates: [],
      source_stats: [],
    });
  }

  const targetSnapshot =
    snapshotRows.find((row) => row.snapshot_date === requestedDate) ?? snapshotRows[0];

  const [{ data: report, error: reportError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("market_sales_vector_reports")
        .select(
          "snapshot_id, model, summary_markdown, report_json, hottest_top10, categories, created_at, updated_at"
        )
        .eq("snapshot_id", targetSnapshot.id)
        .maybeSingle(),
      supabase
        .from("market_sales_vector_items")
        .select(
          "rank, source, source_scrape_date, product_id, title, product_url, image_url, price, currency, sales_total, delta_1d, delta_7d, baseline_7d, spike_ratio, signal_score, is_new_release, is_resurgence, first_seen_at, last_seen_at, taxonomy_path, meta"
        )
        .eq("snapshot_id", targetSnapshot.id)
        .order("rank", { ascending: true })
        .limit(limit),
    ]);

  if (reportError || itemsError) {
    return NextResponse.json(
      {
        snapshot: targetSnapshot,
        report: report ?? null,
        items: [],
        available_dates: snapshotRows.map((row) => row.snapshot_date),
        source_stats: [],
        error: "Unable to load sales vector details.",
        details: reportError?.message || itemsError?.message || null,
      },
      { status: 500 }
    );
  }

  const itemRows = items ?? [];
  const sourceStatsMap = new Map<
    string,
    { source: string; items: number; total_delta_1d: number; avg_score: number }
  >();
  for (const item of itemRows) {
    const source = String(item.source || "").toLowerCase();
    const current = sourceStatsMap.get(source) || {
      source,
      items: 0,
      total_delta_1d: 0,
      avg_score: 0,
    };
    current.items += 1;
    current.total_delta_1d += Number(item.delta_1d || 0);
    current.avg_score += Number(item.signal_score || 0);
    sourceStatsMap.set(source, current);
  }

  const sourceStats = Array.from(sourceStatsMap.values())
    .map((stat) => ({
      ...stat,
      avg_score: stat.items > 0 ? Number((stat.avg_score / stat.items).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.items - a.items);

  return NextResponse.json({
    snapshot: targetSnapshot,
    report: report ?? null,
    items: itemRows,
    available_dates: snapshotRows.map((row) => row.snapshot_date),
    source_stats: sourceStats,
  });
}

