import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  EVENT_LEVELS,
  isMissingTableError,
  normalizeEventLevel,
  parseDateCursor,
  parsePositiveInt,
  requireAdminSettingsUser,
} from "../lib";

export const runtime = "nodejs";

type SyncerEventRow = {
  id: number;
  created_at: string;
  level: string;
  source: string | null;
  event_type: string | null;
  cause_code: string | null;
  recovery_status: string | null;
  preventable: boolean | null;
  transient: boolean | null;
  shop_id: string | null;
  object_type: string | null;
  object_id: string | null;
  action: string | null;
  outbox_id: string | null;
  attempts: number | null;
  sku: string | null;
  spu: string | null;
  catalog_product_id: string | null;
  http_status: number | null;
  retry_after_seconds: number | null;
  message: string | null;
  details: unknown;
};

const toSearchText = (row: SyncerEventRow) =>
  [
    row.message,
    row.cause_code,
    row.event_type,
    row.sku,
    row.spu,
    row.object_id,
    row.object_type,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

export async function GET(request: NextRequest) {
  const auth = await requireAdminSettingsUser();
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const limit = parsePositiveInt(params.get("limit"), 150, 1, 500);
  const hours = parsePositiveInt(params.get("hours"), 24, 1, 24 * 30);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const level = normalizeEventLevel(params.get("level"));
  const sku = String(params.get("sku") || "").trim();
  const spu = String(params.get("spu") || "").trim();
  const cause = String(params.get("cause_code") || "").trim();
  const objectType = String(params.get("object_type") || "").trim();
  const shopId = String(params.get("shop_id") || "").trim();
  const queryText = String(params.get("q") || "").trim().toLowerCase();
  const cursor = parseDateCursor(params.get("cursor"));

  let queryLimit = limit;
  if (queryText) {
    queryLimit = Math.min(1000, Math.max(limit * 3, 300));
  }

  const admin = createAdminSupabase();
  let query = admin
    .from("syncer_event_log")
    .select(
      "id,created_at,level,source,event_type,cause_code,recovery_status,preventable,transient,shop_id,object_type,object_id,action,outbox_id,attempts,sku,spu,catalog_product_id,http_status,retry_after_seconds,message,details"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (cursor) query = query.lt("created_at", cursor);
  if (level) query = query.eq("level", level);
  if (sku) query = query.ilike("sku", `%${sku}%`);
  if (spu) query = query.ilike("spu", `%${spu}%`);
  if (cause) query = query.ilike("cause_code", `%${cause}%`);
  if (objectType) query = query.eq("object_type", objectType);
  if (shopId) query = query.eq("shop_id", shopId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error.message || "")) {
      return NextResponse.json(
        {
          events: [],
          levels: EVENT_LEVELS,
          next_cursor: null,
          has_more: false,
          warning:
            "syncer_event_log table is missing. Apply sql/2026-02-18-syncer-event-log.sql in shopify-sync.",
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data || []) as SyncerEventRow[];

  if (queryText) {
    rows = rows.filter((row) => toSearchText(row).includes(queryText));
  }

  const sliced = rows.slice(0, limit);
  const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1]?.created_at || null : null;

  return NextResponse.json({
    events: sliced,
    levels: EVENT_LEVELS,
    next_cursor: nextCursor,
    has_more: rows.length > limit,
    since,
    count: sliced.length,
  });
}
