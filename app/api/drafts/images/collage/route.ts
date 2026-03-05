import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const MAX_COLLAGE_IMAGES = 9;
const MIN_COLLAGE_IMAGES = 2;
const COLLAGE_CANVAS_SIZE = 1000;

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

const buildCollageRows = (count: number) => {
  if (count <= 0) return [] as number[];
  if (count === 1) return [1];
  if (count === 2) return [2];
  if (count === 3) return [2, 1];
  if (count === 4) return [2, 2];
  if (count === 5) return [3, 2];
  if (count === 6) return [3, 3];
  if (count === 7) return [3, 3, 1];
  if (count === 8) return [3, 3, 2];
  return [3, 3, 3];
};

const isInsideDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const buildTimestampToken = () => {
  const iso = new Date().toISOString(); // 2026-03-04T21:31:44.123Z
  const compact = iso.replace(/[-:]/g, "").replace(/\..+$/, ""); // 20260304T213144
  return compact.replace("T", "-"); // 20260304-213144
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

  const sourcePaths = normalizePathList(body.paths);
  if (sourcePaths.length < MIN_COLLAGE_IMAGES) {
    return NextResponse.json(
      { error: "Select at least two images to create a collage." },
      { status: 400 }
    );
  }

  const normalizedTargetPath = String(body.targetPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const fallbackParentPath =
    sourcePaths[0]?.slice(0, Math.max(0, sourcePaths[0].lastIndexOf("/"))) || "";
  const targetRelativePath = normalizedTargetPath || fallbackParentPath;
  const targetAbsolutePath = resolveDraftPath(targetRelativePath);
  if (!targetAbsolutePath || !isInsideDraftRoot(targetAbsolutePath)) {
    return NextResponse.json({ error: "Invalid target path." }, { status: 400 });
  }

  if (!fs.existsSync(targetAbsolutePath)) {
    return NextResponse.json({ error: "Target folder not found." }, { status: 404 });
  }
  const targetStat = fs.statSync(targetAbsolutePath);
  if (!targetStat.isDirectory()) {
    return NextResponse.json({ error: "Target path must be a folder." }, { status: 400 });
  }

  const errors: Array<{ path: string; error: string }> = [];
  const valid: Array<{ relativePath: string; absolutePath: string }> = [];

  for (const relativePath of sourcePaths.slice(0, MAX_COLLAGE_IMAGES)) {
    const absolutePath = resolveDraftPath(relativePath);
    if (!absolutePath || !isInsideDraftRoot(absolutePath)) {
      errors.push({ path: relativePath, error: "Invalid path outside draft root." });
      continue;
    }
    if (!IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      errors.push({ path: relativePath, error: "Unsupported image extension." });
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      errors.push({ path: relativePath, error: "Image not found." });
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      errors.push({ path: relativePath, error: "Not a file." });
      continue;
    }
    try {
      await sharp(absolutePath, { failOn: "none" }).metadata();
      valid.push({ relativePath, absolutePath });
    } catch {
      errors.push({ path: relativePath, error: "Unable to read image." });
    }
  }

  if (valid.length < MIN_COLLAGE_IMAGES) {
    return NextResponse.json(
      {
        error: "At least two valid images are required to create a collage.",
        errors,
      },
      { status: 400 }
    );
  }

  const rows = buildCollageRows(valid.length);
  const rowCount = rows.length;
  const rowHeight = Math.max(1, Math.floor(COLLAGE_CANVAS_SIZE / rowCount));
  const occupiedHeight = rowHeight * rowCount;
  const baseTop = Math.max(0, Math.floor((COLLAGE_CANVAS_SIZE - occupiedHeight) / 2));

  const composites: sharp.OverlayOptions[] = [];
  let imageIndex = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const columns = rows[rowIndex];
    const tileWidth = Math.max(1, Math.floor(COLLAGE_CANVAS_SIZE / columns));
    const occupiedWidth = tileWidth * columns;
    const baseLeft = Math.max(0, Math.floor((COLLAGE_CANVAS_SIZE - occupiedWidth) / 2));
    const top = baseTop + rowIndex * rowHeight;
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      if (imageIndex >= valid.length) break;
      const source = valid[imageIndex];
      const tileBuffer = await sharp(source.absolutePath, { failOn: "none" })
        .rotate()
        .resize(tileWidth, rowHeight, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
      composites.push({
        input: tileBuffer,
        left: baseLeft + columnIndex * tileWidth,
        top,
      });
      imageIndex += 1;
    }
  }

  const collageBuffer = await sharp({
    create: {
      width: COLLAGE_CANVAS_SIZE,
      height: COLLAGE_CANVAS_SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const targetParts = toRelativePath(targetAbsolutePath)
    .split("/")
    .filter(Boolean);
  const spu = String(targetParts[1] || targetParts[0] || "image").trim();
  const fileBaseName = `${toSafeBaseName(spu)}-collage-${buildTimestampToken()}`;
  const fileName = ensureUniqueName(targetAbsolutePath, fileBaseName, "jpg");
  const outputAbsolutePath = path.join(targetAbsolutePath, fileName);
  fs.writeFileSync(outputAbsolutePath, collageBuffer);
  const outputStat = fs.statSync(outputAbsolutePath);

  let pixelQualityScore: number | null = null;
  try {
    const refreshed = await refreshDraftImageScoreByAbsolutePath(outputAbsolutePath);
    pixelQualityScore = refreshed.pixelQualityScore;
  } catch {
    pixelQualityScore = null;
  }

  const truncatedCount = Math.max(0, sourcePaths.length - MAX_COLLAGE_IMAGES);

  return NextResponse.json({
    item: {
      name: fileName,
      path: toRelativePath(outputAbsolutePath),
      size: outputStat.size,
      modifiedAt: new Date(outputStat.mtimeMs).toISOString(),
      pixelQualityScore,
      zimageUpscaled: false,
    },
    usedImageCount: valid.length,
    rows,
    canvas: { width: COLLAGE_CANVAS_SIZE, height: COLLAGE_CANVAS_SIZE },
    truncatedCount,
    errors,
  });
}
