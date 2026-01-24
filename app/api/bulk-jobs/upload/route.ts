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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Missing JSON file." }, { status: 400 });
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  let payload: unknown;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON file." }, { status: 400 });
  }

  const itemCount = countItems(payload);
  if (itemCount === 0) {
    return NextResponse.json(
      { error: "No items found in JSON." },
      { status: 400 }
    );
  }

  const requestedWorkers = formData.get("workers");
  const workerCount = resolveWorkerCount(
    itemCount,
    requestedWorkers ? String(requestedWorkers) : null
  );
  const jobId = crypto.randomUUID();
  fs.mkdirSync(BULK_JOB_UPLOAD_DIR, { recursive: true });
  const inputPath = path.join(BULK_JOB_UPLOAD_DIR, `${jobId}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf8");

  const job: BulkJob = {
    jobId,
    status: "queued",
    inputPath,
    inputName: (file as File).name ?? `${jobId}.json`,
    itemCount,
    workerCount,
    createdAt: new Date().toISOString(),
    summary: null,
    error: null,
  };

  upsertJob(job);

  return NextResponse.json({ job });
}
