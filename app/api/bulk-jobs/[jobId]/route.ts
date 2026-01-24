import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getJob, getProcess, updateJob } from "@/lib/bulk-jobs";

export const runtime = "nodejs";

export async function GET(
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

  let job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (job.status === "running" && !getProcess(job.jobId) && job.pid) {
    let stillRunning = true;
    try {
      process.kill(job.pid, 0);
    } catch {
      stillRunning = false;
    }
    if (!stillRunning) {
      job =
        updateJob(job.jobId, (current) => ({
          ...current,
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: "Process not running.",
        })) ?? job;
    }
  }

  return NextResponse.json({ job });
}
