import { NextResponse } from "next/server";
import fs from "fs";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  BULK_JOB_UPLOAD_DIR,
  getJob,
  updateJob,
} from "@/lib/bulk-jobs";

export const runtime = "nodejs";

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

  if (job.status === "running") {
    return NextResponse.json({ job });
  }

  fs.mkdirSync(BULK_JOB_UPLOAD_DIR, { recursive: true });
  const updatedJob = updateJob(job.jobId, (current) => ({
    ...current,
    status: "queued",
    startedAt: undefined,
    finishedAt: undefined,
    pid: undefined,
    parallelLogPath: undefined,
    workerLogDir: undefined,
    outputFolder: null,
    outputExcelPath: null,
    outputZipPath: null,
    summary: null,
    error: null,
  }));

  return NextResponse.json({ job: updatedJob ?? job });
}
