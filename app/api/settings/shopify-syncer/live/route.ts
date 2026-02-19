import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import {
  SYNCER_EVENT_LOG_FILE,
  isMissingTableError,
  parsePositiveInt,
  requireAdminSettingsUser,
} from "../lib";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

async function readLiveLinesFromFile(cursor: number, maxBytes: number) {
  const stats = await fs.stat(SYNCER_EVENT_LOG_FILE);
  const size = stats.size;

  let start = cursor > 0
    ? Math.max(0, Math.min(cursor, size))
    : Math.max(0, size - maxBytes);
  if (size - start > maxBytes) {
    start = Math.max(0, size - maxBytes);
  }

  const length = Math.max(0, size - start);
  if (length === 0) {
    return {
      source: "file" as const,
      cursor: size,
      file_path: SYNCER_EVENT_LOG_FILE,
      lines: [] as string[],
      file_exists: true,
    };
  }

  const handle = await fs.open(SYNCER_EVENT_LOG_FILE, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      if (firstNewline >= 0) {
        text = text.slice(firstNewline + 1);
      }
    }
    const lines = splitLines(text).slice(-300);
    return {
      source: "file" as const,
      cursor: size,
      file_path: SYNCER_EVENT_LOG_FILE,
      lines,
      file_exists: true,
    };
  } finally {
    await handle.close();
  }
}

async function readLiveLinesFromDb() {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("syncer_event_log")
    .select("created_at,level,event_type,message,cause_code,sku,spu,object_type,object_id")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    if (isMissingTableError(error.message || "")) {
      return {
        source: "none" as const,
        cursor: Date.now(),
        lines: [] as string[],
        warning:
          "No live source available: syncer_event_log table missing and log file not found.",
      };
    }
    throw new Error(error.message);
  }

  const lines = (data || [])
    .slice()
    .reverse()
    .map((row) =>
      JSON.stringify({
        ts: row.created_at,
        level: row.level,
        event_type: row.event_type,
        message: row.message,
        cause_code: row.cause_code,
        sku: row.sku,
        spu: row.spu,
        object_type: row.object_type,
        object_id: row.object_id,
      })
    );

  return {
    source: "db" as const,
    cursor: Date.now(),
    lines,
    warning: null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminSettingsUser();
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const cursor = parsePositiveInt(params.get("cursor"), 0, 0, Number.MAX_SAFE_INTEGER);
  const maxBytes = parsePositiveInt(params.get("max_bytes"), 65536, 1024, 262144);

  try {
    const fromFile = await readLiveLinesFromFile(cursor, maxBytes);
    return NextResponse.json(fromFile);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      const fromDb = await readLiveLinesFromDb();
      return NextResponse.json(fromDb);
    }
    return NextResponse.json({ error: err?.message || "Live read failed" }, { status: 500 });
  }
}
