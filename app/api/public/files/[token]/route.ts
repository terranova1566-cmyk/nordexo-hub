import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PUBLIC_FILES_ROOT, ensureInsideRoot } from "@/lib/public-files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { token: rawToken } = await context.params;
  const token = String(rawToken || "").trim();
  if (!token || token.length < 24) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { data, error } = await admin
    .from("partner_public_file_links")
    .select("id,file_path,original_name,content_type,expires_at,disabled,download_count")
    .eq("token", token)
    .maybeSingle();

  if (error || !data || data.disabled) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const expiresAt = Date.parse(String(data.expires_at || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const absolutePath = path.resolve(PUBLIC_FILES_ROOT, String(data.file_path || ""));
  if (!ensureInsideRoot(absolutePath)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(absolutePath);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await admin
    .from("partner_public_file_links")
    .update({
      download_count: Number(data.download_count ?? 0) + 1,
      last_download_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  const filename = String(data.original_name || path.basename(absolutePath));
  const contentType = String(data.content_type || "application/octet-stream");

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.byteLength),
      "Content-Disposition": `attachment; filename=\"${filename.replace(/\"/g, "")}\"`,
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
