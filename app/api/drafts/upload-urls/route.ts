import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath } from "@/lib/drafts";
import { convertBufferToJpeg } from "@/lib/image-jpeg";

export const runtime = "nodejs";

const toSafeBaseName = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "") || "image";

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

const normalizeUrls = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    const raw = String(entry || "").trim();
    if (!raw) return;
    try {
      const parsed = new URL(raw);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      const normalized = parsed.toString();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      return;
    }
  });
  return out;
};

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const targetPathRaw = String(body.targetPath || "").trim();
  const targetPath = resolveDraftPath(targetPathRaw || ".");
  if (!targetPath) {
    return NextResponse.json({ error: "Invalid target path." }, { status: 400 });
  }

  const urls = normalizeUrls(body.urls);
  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid image URLs provided." }, { status: 400 });
  }

  fs.mkdirSync(targetPath, { recursive: true });

  const errors: Array<{ url: string; error: string }> = [];
  let uploaded = 0;

  for (let index = 0; index < urls.length; index += 1) {
    const sourceUrl = urls[index];
    try {
      const response = await fetch(sourceUrl, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const mimeType = String(response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (mimeType && !mimeType.startsWith("image/")) {
        throw new Error(`Unsupported content type: ${mimeType}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) {
        throw new Error("Empty image response.");
      }

      const parsedUrl = new URL(sourceUrl);
      const rawName = path.basename(parsedUrl.pathname || "").replace(/\.[^.]+$/, "");
      const baseName = toSafeBaseName(rawName || `image-${index + 1}`);
      // Always store downloaded images as JPEG.
      const fileName = ensureUniqueName(targetPath, baseName, "jpg");
      const jpeg = await convertBufferToJpeg(buffer);
      fs.writeFileSync(path.join(targetPath, fileName), jpeg);
      uploaded += 1;
    } catch (err) {
      errors.push({
        url: sourceUrl,
        error: err instanceof Error ? err.message : "Download failed.",
      });
    }
  }

  if (uploaded === 0) {
    return NextResponse.json(
      {
        error: "Unable to add images from provided URLs.",
        uploaded,
        failed: errors.length,
        errors,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    uploaded,
    failed: errors.length,
    errors,
  });
}
