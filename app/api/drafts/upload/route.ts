import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath } from "@/lib/drafts";
import { convertBufferToJpeg, looksLikeImageFileName } from "@/lib/image-jpeg";

const ensureUniqueName = (dirPath: string, baseName: string, ext: string) => {
  const safeExt = ext.replace(/^\./, "") || "jpg";
  let candidate = `${baseName}.${safeExt}`;
  let index = 2;
  while (fs.existsSync(path.join(dirPath, candidate))) {
    candidate = `${baseName}-${index}.${safeExt}`;
    index += 1;
  }
  return candidate;
};

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

  const targetPathRaw = formData.get("targetPath")?.toString() ?? "";
  const targetPath = resolveDraftPath(targetPathRaw || ".");
  if (!targetPath) {
    return NextResponse.json({ error: "Invalid target path." }, { status: 400 });
  }

  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  fs.mkdirSync(targetPath, { recursive: true });

  let uploaded = 0;
  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    const safeName = path.basename(entry.name || "file");
    const buffer = Buffer.from(await entry.arrayBuffer());
    const isImage =
      String(entry.type || "").toLowerCase().startsWith("image/") ||
      looksLikeImageFileName(safeName);

    if (isImage) {
      const baseName = path.parse(safeName).name || "image";
      const outputName = ensureUniqueName(targetPath, baseName, "jpg");
      const outAbs = path.join(targetPath, outputName);
      const jpeg = await convertBufferToJpeg(buffer);
      fs.writeFileSync(outAbs, jpeg);
    } else {
      fs.writeFileSync(path.join(targetPath, safeName), buffer);
    }
    uploaded += 1;
  }

  return NextResponse.json({ uploaded });
}
