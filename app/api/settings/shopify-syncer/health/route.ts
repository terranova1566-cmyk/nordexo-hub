import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  SYNCER_API_BASE_URL,
  fetchJsonWithTimeout,
  isMissingTableError,
  parsePositiveInt,
  requireAdminSettingsUser,
} from "../lib";

export const runtime = "nodejs";

type SyncerHealthRow = {
  created_at: string;
  level: string | null;
  cause_code: string | null;
  sku: string | null;
  spu: string | null;
  object_type: string | null;
  object_id: string | null;
  message: string | null;
};

type SyncerMetricsPayload = {
  queue?: Record<string, number>;
  outbox_observability?: {
    dead_cause_counts?: Record<string, number>;
    active_cause_counts?: Record<string, number>;
    recovery_status_counts?: Record<string, number>;
    preventable_counts?: Record<string, number>;
    transient_counts?: Record<string, number>;
  };
  running_health?: Record<string, unknown>;
  last_success_at?: string | null;
  now?: string;
};

type WorkerHealthPayload = {
  id?: string;
  last_beat?: string;
  processed?: number;
  age_seconds?: number;
};

const byCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1];

export async function GET(request: NextRequest) {
  const auth = await requireAdminSettingsUser();
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const hours = parsePositiveInt(params.get("hours"), 24, 1, 24 * 30);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("syncer_event_log")
    .select("created_at,level,cause_code,sku,spu,object_type,object_id,message")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error && !isMissingTableError(error.message || "")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data || []) as SyncerHealthRow[]).filter(Boolean);
  const levelCounts: Record<string, number> = {
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  };
  const causeCounts: Record<string, number> = {};
  const skuCounts: Record<string, number> = {};
  const objectCounts: Record<string, number> = {};

  for (const row of rows) {
    const level = String(row.level || "info").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(levelCounts, level)) {
      levelCounts[level] = 0;
    }
    levelCounts[level] += 1;

    if (level === "warn" || level === "error" || level === "critical") {
      const cause = String(row.cause_code || "unknown");
      causeCounts[cause] = (causeCounts[cause] || 0) + 1;

      const sku = String(row.sku || row.spu || "").trim();
      if (sku) {
        skuCounts[sku] = (skuCounts[sku] || 0) + 1;
      }

      const objectKey = [row.object_type || "unknown", row.object_id || "?"].join(":");
      objectCounts[objectKey] = (objectCounts[objectKey] || 0) + 1;
    }
  }

  const topCauses = Object.entries(causeCounts).sort(byCountDesc).slice(0, 12);
  const topSkus = Object.entries(skuCounts).sort(byCountDesc).slice(0, 12);
  const topObjects = Object.entries(objectCounts).sort(byCountDesc).slice(0, 12);

  const [metricsRes, workerRes] = await Promise.all([
    fetchJsonWithTimeout<SyncerMetricsPayload>(`${SYNCER_API_BASE_URL}/metrics`),
    fetchJsonWithTimeout<WorkerHealthPayload>(`${SYNCER_API_BASE_URL}/health/worker`),
  ]);

  return NextResponse.json({
    since,
    hours,
    sampled_event_rows: rows.length,
    event_levels: levelCounts,
    top_causes: topCauses.map(([cause_code, count]) => ({ cause_code, count })),
    top_skus: topSkus.map(([sku, count]) => ({ sku, count })),
    top_objects: topObjects.map(([object_key, count]) => ({ object_key, count })),
    table_available: !error,
    warning:
      error && isMissingTableError(error.message || "")
        ? "syncer_event_log table is missing. Apply sql/2026-02-18-syncer-event-log.sql in shopify-sync."
        : null,
    syncer_metrics: metricsRes.ok ? metricsRes.data : null,
    syncer_metrics_error: metricsRes.ok ? null : metricsRes.error,
    worker_health: workerRes.ok ? workerRes.data : null,
    worker_health_error: workerRes.ok ? null : workerRes.error,
  });
}
