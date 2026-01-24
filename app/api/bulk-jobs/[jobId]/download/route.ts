import fs from "fs";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getJob } from "@/lib/bulk-jobs";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const filePath =
    type === "zip" ? job.outputZipPath : type === "excel" ? job.outputExcelPath : null;

  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const stream = fs.createReadStream(filePath);
  const fileName = filePath.split("/").pop() ?? "download";
  const contentType =
    type === "zip"
      ? "application/zip"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
