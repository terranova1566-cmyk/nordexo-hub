import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  buildOutputPaths,
  findRunStamp,
  getJob,
  getProcess,
  removeProcess,
  safeRemove,
  updateJob,
} from "@/lib/bulk-jobs";
import { DRAFT_ROOT, safeRemoveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const parseEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  });
  return out;
};

const loadSupabaseEnv = () => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"];
  const env: Record<string, string | undefined> = {};
  keys.forEach((key) => {
    if (process.env[key]) env[key] = process.env[key];
  });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    const fromNodeTools = parseEnvFile("/srv/node-tools/.env");
    env.SUPABASE_URL = env.SUPABASE_URL ?? fromNodeTools.SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE =
      env.SUPABASE_SERVICE_ROLE ?? fromNodeTools.SUPABASE_SERVICE_ROLE;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    const fromShopify = parseEnvFile("/srv/shopify-sync/.env");
    env.SUPABASE_URL = env.SUPABASE_URL ?? fromShopify.SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE =
      env.SUPABASE_SERVICE_ROLE ?? fromShopify.SUPABASE_SERVICE_ROLE;
  }
  return env;
};

const extractBaseSpu = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/[A-Za-z]{1,5}-\d+/);
  if (!match) return null;
  return match[0].toUpperCase();
};

const collectSpusFromItem = (item: Record<string, unknown>) => {
  const keys = [
    "spu",
    "spu_id",
    "spuId",
    "spu_code",
    "spuCode",
    "sku",
    "SKU",
    "product_id",
    "productId",
  ];
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) {
      const spu = extractBaseSpu(item[key]);
      if (spu) return spu;
    }
  }
  const variationSets = ["variations", "variants_1688", "variant_images_1688"];
  for (const key of variationSets) {
    const list = item[key];
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (entry && typeof entry === "object") {
          const val =
            (entry as Record<string, unknown>).sku ??
            (entry as Record<string, unknown>).SKU ??
            (entry as Record<string, unknown>).spu;
          const spu = extractBaseSpu(val);
          if (spu) return spu;
        }
      }
    }
  }
  return null;
};

const loadJobSpus = (inputPath?: string | null) => {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  try {
    const raw = fs.readFileSync(inputPath, "utf8");
    const payload = JSON.parse(raw) as unknown;
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { items?: unknown[] }).items)
      ? (payload as { items: unknown[] }).items
      : [];
    const spus = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const spu = collectSpusFromItem(item as Record<string, unknown>);
      if (spu) spus.add(spu);
    }
    return [...spus];
  } catch {
    return [];
  }
};

const removeSpuFolders = (spus: string[]) => {
  if (spus.length === 0) return;
  if (!fs.existsSync(DRAFT_ROOT)) return;
  const entries = fs.readdirSync(DRAFT_ROOT, { withFileTypes: true });
  entries
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const base = path.join(DRAFT_ROOT, entry.name);
      spus.forEach((spu) => {
        const candidate = path.join(base, spu);
        if (fs.existsSync(candidate)) {
          safeRemoveDraftPath(candidate);
        }
      });
    });
};

const deleteDraftRows = async (spus: string[]) => {
  if (spus.length === 0) return;
  const env = loadSupabaseEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const chunkSize = 100;
  for (let i = 0; i < spus.length; i += chunkSize) {
    const chunk = spus.slice(i, i + chunkSize);
    await supabase.from("draft_variants").delete().in("draft_spu", chunk);
    await supabase.from("draft_products").delete().in("draft_spu", chunk);
  }
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const jobSpus = loadJobSpus(job.inputPath);

  const proc = getProcess(job.jobId);
  if (proc) {
    try {
      proc.kill("SIGTERM");
    } catch {}
    removeProcess(job.jobId);
  } else if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {}
  }

  if (job.inputPath) {
    safeRemove(job.inputPath);
  }

  const runStamp = findRunStamp(job);
  if (runStamp) {
    const outputs = buildOutputPaths(job, runStamp);
    safeRemove(outputs.outputExcel);
    safeRemove(outputs.outputZip);
    safeRemove(outputs.finalFolder);
    safeRemove(outputs.tempFolder);
  }
  if (job.parallelLogPath) {
    safeRemove(job.parallelLogPath);
  }

  removeSpuFolders(jobSpus);
  await deleteDraftRows(jobSpus);

  const updated = updateJob(job.jobId, (current) => ({
    ...current,
    status: "killed",
    finishedAt: new Date().toISOString(),
    error: "Stopped by user.",
  }));

  return NextResponse.json({ job: updated ?? job });
}
