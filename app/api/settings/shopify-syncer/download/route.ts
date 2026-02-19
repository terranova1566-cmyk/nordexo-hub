import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  SYNCER_EVENT_LOG_FILE,
  escapeCsvCell,
  isMissingTableError,
  parsePositiveInt,
  requireAdminSettingsUser,
} from "../lib";

export const runtime = "nodejs";

type SyncerEventRow = {
  created_at: string;
  level: string | null;
  source: string | null;
  event_type: string | null;
  cause_code: string | null;
  recovery_status: string | null;
  sku: string | null;
  spu: string | null;
  object_type: string | null;
  object_id: string | null;
  outbox_id: string | null;
  message: string | null;
};

const toNdjson = (rows: SyncerEventRow[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const toCsv = (rows: SyncerEventRow[]) => {
  const header = [
    "created_at",
    "level",
    "source",
    "event_type",
    "cause_code",
    "recovery_status",
    "sku",
    "spu",
    "object_type",
    "object_id",
    "outbox_id",
    "message",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.created_at,
        row.level,
        row.source,
        row.event_type,
        row.cause_code,
        row.recovery_status,
        row.sku,
        row.spu,
        row.object_type,
        row.object_id,
        row.outbox_id,
        row.message,
      ]
        .map((value) => escapeCsvCell(value))
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
};

async function fallbackReadFile(hours: number): Promise<SyncerEventRow[]> {
  const text = await fs.readFile(SYNCER_EVENT_LOG_FILE, "utf8");
  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  const rows: SyncerEventRow[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const createdAt = String(parsed.ts || parsed.created_at || "").trim();
      const createdMs = Date.parse(createdAt);
      if (Number.isFinite(createdMs) && createdMs < sinceMs) continue;
      rows.push({
        created_at: createdAt || new Date().toISOString(),
        level: String(parsed.level || "").trim() || null,
        source: String(parsed.source || "worker-outbox").trim() || "worker-outbox",
        event_type: String(parsed.event_type || "").trim() || null,
        cause_code: String(parsed.cause_code || "").trim() || null,
        recovery_status: String(parsed.recovery_status || "").trim() || null,
        sku: String(parsed.sku || "").trim() || null,
        spu: String(parsed.spu || "").trim() || null,
        object_type: String(parsed.object_type || "").trim() || null,
        object_id: String(parsed.object_id || "").trim() || null,
        outbox_id: String(parsed.outbox_id || "").trim() || null,
        message: String(parsed.message || "").trim() || null,
      });
    } catch {
      // ignore malformed lines
    }
  }

  return rows.slice(-20000);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminSettingsUser();
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const hours = parsePositiveInt(params.get("hours"), 24, 1, 24 * 30);
  const format = String(params.get("format") || "ndjson").toLowerCase() === "csv"
    ? "csv"
    : "ndjson";

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from("syncer_event_log")
    .select(
      "created_at,level,source,event_type,cause_code,recovery_status,sku,spu,object_type,object_id,outbox_id,message"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50000);

  let rows: SyncerEventRow[] = [];

  if (error) {
    if (!isMissingTableError(error.message || "")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    try {
      rows = await fallbackReadFile(hours);
    } catch (fileError) {
      const fileErr = fileError as NodeJS.ErrnoException;
      return NextResponse.json(
        {
          error:
            fileErr?.code === "ENOENT"
              ? "syncer_event_log table missing and sync event log file not found."
              : fileErr?.message || "Failed to build export.",
        },
        { status: 500 }
      );
    }
  } else {
    rows = (data || []) as SyncerEventRow[];
  }

  const body = format === "csv" ? toCsv(rows) : toNdjson(rows);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const filename = `shopify-syncer-${hours}h-${stamp}.${format === "csv" ? "csv" : "ndjson"}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename=\"${filename}\"`,
      "cache-control": "no-store",
    },
  });
}
