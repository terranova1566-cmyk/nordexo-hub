import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const encodeRFC5987ValueChars = (value: string) =>
  encodeURIComponent(value)
    .replace(/['()]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/\*/g, "%2A");

const toAsciiFilename = (value: string) =>
  value
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "download";

const getContentType = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".zip":
      return "application/zip";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
};

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  const absolute = resolveDraftPath(relativePath);
  if (!absolute || !absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  if (!fs.existsSync(absolute)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file." }, { status: 400 });
  }

  const stream = fs.createReadStream(absolute);
  const fileName = path.basename(absolute);
  const contentType = getContentType(fileName);
  const asciiName = toAsciiFilename(fileName);
  const encodedName = encodeRFC5987ValueChars(fileName);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    },
  });
}
