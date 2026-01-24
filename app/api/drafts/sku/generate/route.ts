import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STATUS_FILE =
  "/srv/partner-product-explorer/.cache/sku-generation-status.json";
const LOG_DIR = "/srv/node-tools/product-processor/logs";
const SCRIPT_PATH =
  "/srv/shopify-sync/api/scripts/sku-generate-and-images.mjs";

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

export async function POST(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const status = readStatus();
  if (status.status === "running" && isPidRunning(status.pid)) {
    return NextResponse.json({ ok: true, status }, { status: 202 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedSpus = Array.isArray(body?.spus)
    ? body.spus.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
    : [];

  let spus = requestedSpus;
  if (spus.length === 0) {
    const { data, error } = await adminClient
      .from("draft_products")
      .select("draft_spu")
      .eq("draft_status", "draft");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    spus = (data ?? [])
      .map((row) => String(row.draft_spu || "").trim())
      .filter(Boolean);
  }

  if (spus.length === 0) {
    return NextResponse.json(
      { error: "No draft products available for SKU generation." },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `sku-generate-${timestamp}.log`);
  const out = fs.openSync(logFile, "a");
  const args = [SCRIPT_PATH, "--spus", spus.join(",")];

  const startedAt = new Date().toISOString();
  const nextStatus: SkuStatus = {
    status: "running",
    spus,
    startedAt,
    logFile,
  };
  writeStatus(nextStatus);

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
    },
  });

  const pid = child.pid;
  if (pid) {
    writeStatus({ ...nextStatus, pid });
  }

  child.on("exit", (code) => {
    const finishedAt = new Date().toISOString();
    const updated: SkuStatus = {
      status: code === 0 ? "done" : "error",
      spus,
      startedAt,
      finishedAt,
      exitCode: code ?? null,
      logFile,
      pid,
      message:
        code === 0
          ? "SKU generation finished."
          : "SKU generation failed. Check logs.",
    };
    writeStatus(updated);
  });

  child.unref();
  fs.closeSync(out);

  return NextResponse.json({ ok: true, status: { ...nextStatus, pid } });
}
