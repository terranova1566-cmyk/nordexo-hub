import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { saveDraftImageUndoBackup } from "@/lib/draft-image-undo";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const MAX_BATCH_IMAGES = 12;

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

const normalizePathList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) =>
          String(item ?? "")
            .trim()
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
        )
        .filter(Boolean)
    )
  );
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
};

const isInsideDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const encodeBufferForFormat = async (pipeline: sharp.Sharp, format: string | undefined) => {
  switch (String(format || "").toLowerCase()) {
    case "jpeg":
    case "jpg":
      return pipeline
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
    case "png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "webp":
      return pipeline.webp({ quality: 92 }).toBuffer();
    case "avif":
      return pipeline.avif({ quality: 70 }).toBuffer();
    case "tiff":
      return pipeline.tiff({ quality: 92 }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    default:
      return pipeline.toBuffer();
  }
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const relativePaths = normalizePathList(body.paths).slice(0, MAX_BATCH_IMAGES);
  if (relativePaths.length === 0) {
    return NextResponse.json({ updated: [], errors: [] });
  }

  const updated: Array<{
    path: string;
    name: string;
    size: number;
    modifiedAt: string;
    pixelQualityScore: number | null;
  }> = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const relativePath of relativePaths) {
    const absolutePath = resolveDraftPath(relativePath);
    if (!absolutePath || !isInsideDraftRoot(absolutePath)) {
      errors.push({ path: relativePath, error: "Invalid path outside draft root." });
      continue;
    }

    if (!IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      errors.push({ path: relativePath, error: "Unsupported image extension." });
      continue;
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      errors.push({ path: relativePath, error: "Image not found." });
      continue;
    }

    try {
      saveDraftImageUndoBackup(absolutePath);

      const image = sharp(absolutePath, { failOn: "none" });
      const metadata = await image.metadata();
      const mirrored = image.rotate().flop();
      const outputBuffer = await encodeBufferForFormat(mirrored, metadata.format);
      fs.writeFileSync(absolutePath, outputBuffer);

      const stat = fs.statSync(absolutePath);
      let pixelQualityScore: number | null = null;
      try {
        const refreshed = await refreshDraftImageScoreByAbsolutePath(absolutePath);
        pixelQualityScore = refreshed.pixelQualityScore;
      } catch {
        pixelQualityScore = null;
      }

      updated.push({
        path: toRelativePath(absolutePath),
        name: path.basename(absolutePath),
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
        pixelQualityScore,
      });
    } catch (error) {
      errors.push({
        path: relativePath,
        error: error instanceof Error ? error.message : "Flip horizontal failed.",
      });
    }
  }

  return NextResponse.json({
    updated,
    errors,
    truncatedCount: Math.max(0, normalizePathList(body.paths).length - relativePaths.length),
  });
}
