import { NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  BULK_JOB_UPLOAD_DIR,
  BulkJob,
  countItems,
  resolveWorkerCount,
  upsertJob,
} from "@/lib/bulk-jobs";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  let payload: { name?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const name = payload?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Missing file name." }, { status: 400 });
  }

  const safeName = path.basename(name);
  if (safeName !== name) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const sourcePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(sourcePath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  let raw = "";
  try {
    raw = fs.readFileSync(sourcePath, "utf8");
  } catch {
    return NextResponse.json({ error: "Unable to read file." }, { status: 500 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON file." }, { status: 400 });
  }

  const itemCount = countItems(parsed);
  if (itemCount === 0) {
    return NextResponse.json(
      { error: "No items found in JSON." },
      { status: 400 }
    );
  }

  const workerCount = resolveWorkerCount(itemCount, null);
  const jobId = crypto.randomUUID();
  fs.mkdirSync(BULK_JOB_UPLOAD_DIR, { recursive: true });
  const inputPath = path.join(BULK_JOB_UPLOAD_DIR, `${jobId}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(parsed, null, 2), "utf8");

  const job: BulkJob = {
    jobId,
    status: "queued",
    inputPath,
    inputName: safeName,
    itemCount,
    workerCount,
    createdAt: new Date().toISOString(),
    summary: null,
    error: null,
  };

  upsertJob(job);

  return NextResponse.json({ job });
}
