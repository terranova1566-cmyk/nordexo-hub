import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STATUS_FILE =
  "/srv/partner-product-explorer/.cache/sku-generation-status.json";

type SkuStatus = {
  status: "idle" | "running" | "done" | "error";
  pid?: number;
  spus?: string[];
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  message?: string;
  logFile?: string;
};

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const readStatus = (): SkuStatus => {
  if (!fs.existsSync(STATUS_FILE)) return { status: "idle" };
  try {
    const raw = fs.readFileSync(STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as SkuStatus;
    }
  } catch {
    return { status: "idle" };
  }
  return { status: "idle" };
};

const writeStatus = (status: SkuStatus) => {
  const dir = path.dirname(STATUS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
};

const isPidRunning = (pid?: number) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function GET() {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const status = readStatus();
  if (status.status === "running" && !isPidRunning(status.pid)) {
    const finishedAt = status.finishedAt || new Date().toISOString();
    const next: SkuStatus = {
      ...status,
      status: status.exitCode === 0 ? "done" : "error",
      finishedAt,
      message:
        status.message ||
        (status.exitCode === 0
          ? "SKU generation finished."
          : "SKU generation exited unexpectedly."),
    };
    writeStatus(next);
  }

  const { count: totalCount, error: totalError } = await adminClient
    .from("draft_variants")
    .select("id", { count: "exact", head: true })
    .eq("draft_status", "draft");

  if (totalError) {
    return NextResponse.json({ error: totalError.message }, { status: 500 });
  }

  const { count: missingCount, error: missingError } = await adminClient
    .from("draft_variants")
    .select("id", { count: "exact", head: true })
    .eq("draft_status", "draft")
    .or("draft_sku.is.null,draft_sku.eq.");

  if (missingError) {
    return NextResponse.json({ error: missingError.message }, { status: 500 });
  }

  const current = readStatus();
  return NextResponse.json({
    status: current.status,
    message: current.message,
    startedAt: current.startedAt,
    finishedAt: current.finishedAt,
    spus: current.spus ?? [],
    logFile: current.logFile,
    totalCount: totalCount ?? 0,
    missingCount: missingCount ?? 0,
  });
}
