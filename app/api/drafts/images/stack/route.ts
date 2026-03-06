import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const MIN_STACK_IMAGES = 2;
const MAX_STACK_IMAGES = 9;
const STACK_CANVAS_SIZE = 1000;
const STACK_TOTAL_GAP_RATIO = 0.1; // 10% of final height

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

const isInsideDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const buildTimestampToken = () => {
  const iso = new Date().toISOString(); // 2026-03-04T21:31:44.123Z
  const compact = iso.replace(/[-:]/g, "").replace(/\..+$/, ""); // 20260304T213144
  return compact.replace("T", "-"); // 20260304-213144
};

const isWhiteBackgroundPixel = (r: number, g: number, b: number, a: number) => {
  if (a <= 10) return true;
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const saturation = max <= 0 ? 0 : (max - min) / max;
  return max >= 0.98 && min >= 0.94 && saturation <= 0.06;
};

const detectVerticalTrimBounds = (raw: Buffer, width: number, height: number) => {
  const minLivePixelsInRow = Math.max(3, Math.ceil(width * 0.003));
  const channels = 4;

  const rowHasLivePixels = (row: number) => {
    const start = row * width * channels;
    let livePixels = 0;
    for (let x = 0; x < width; x += 1) {
      const index = start + x * channels;
      const r = raw[index] ?? 255;
      const g = raw[index + 1] ?? 255;
      const b = raw[index + 2] ?? 255;
      const a = raw[index + 3] ?? 255;
      if (!isWhiteBackgroundPixel(r, g, b, a)) {
        livePixels += 1;
        if (livePixels >= minLivePixelsInRow) {
          return true;
        }
      }
    }
    return false;
  };

  let top = 0;
  while (top < height && !rowHasLivePixels(top)) {
    top += 1;
  }
  if (top >= height) {
    return { top: 0, height };
  }

  let bottom = height - 1;
  while (bottom >= top && !rowHasLivePixels(bottom)) {
    bottom -= 1;
  }
  if (bottom < top) {
    return { top: 0, height };
  }

  // Keep one extra pixel as a safety margin to avoid clipping soft shadows.
  const safeTop = Math.max(0, top - 1);
  const safeBottom = Math.min(height - 1, bottom + 1);
  return {
    top: safeTop,
    height: Math.max(1, safeBottom - safeTop + 1),
  };
};

type PreparedImage = {
  relativePath: string;
  absolutePath: string;
  normalizedBuffer: Buffer;
  width: number;
  height: number;
  trimTop: number;
  trimHeight: number;
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
  if (sourcePaths.length < MIN_STACK_IMAGES) {
    return NextResponse.json(
      { error: "Select at least two images to stack." },
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
  const valid: PreparedImage[] = [];

  for (const relativePath of sourcePaths.slice(0, MAX_STACK_IMAGES)) {
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
      const normalized = sharp(absolutePath, { failOn: "none" }).rotate();
      const [normalizedBuffer, rawResult] = await Promise.all([
        normalized.clone().toBuffer(),
        normalized.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      const width = rawResult.info.width;
      const height = rawResult.info.height;
      if (!width || !height) {
        throw new Error("Invalid image dimensions.");
      }

      const trim = detectVerticalTrimBounds(rawResult.data, width, height);

      valid.push({
        relativePath,
        absolutePath,
        normalizedBuffer,
        width,
        height,
        trimTop: trim.top,
        trimHeight: trim.height,
      });
    } catch {
      errors.push({ path: relativePath, error: "Unable to read image." });
    }
  }

  if (valid.length < MIN_STACK_IMAGES) {
    return NextResponse.json(
      {
        error: "At least two valid images are required to stack.",
        errors,
      },
      { status: 400 }
    );
  }

  const gapCount = Math.max(0, valid.length - 1);
  const totalGapHeight = gapCount > 0 ? STACK_CANVAS_SIZE * STACK_TOTAL_GAP_RATIO : 0;
  const gapPx = gapCount > 0 ? totalGapHeight / gapCount : 0;
  const availableImageHeight = STACK_CANVAS_SIZE - totalGapHeight;
  const totalTrimmedHeight = valid.reduce((sum, item) => sum + item.trimHeight, 0);
  const maxSourceWidth = valid.reduce((max, item) => Math.max(max, item.width), 1);
  const heightScale =
    totalTrimmedHeight > 0 ? availableImageHeight / totalTrimmedHeight : 1;
  const widthScale = STACK_CANVAS_SIZE / maxSourceWidth;
  const scale = Math.max(0.0001, Math.min(heightScale, widthScale));

  const scaled = valid.map((item) => ({
    ...item,
    renderWidth: Math.max(1, Math.floor(item.width * scale)),
    renderHeight: Math.max(1, Math.floor(item.trimHeight * scale)),
  }));

  const contentHeight =
    scaled.reduce((sum, item) => sum + item.renderHeight, 0) + gapPx * gapCount;
  const baseTop = Math.max(0, (STACK_CANVAS_SIZE - contentHeight) / 2);
  let cursorTop = baseTop;
  const composites: sharp.OverlayOptions[] = [];

  for (const item of scaled) {
    const top = Math.max(0, Math.round(cursorTop));
    const left = Math.max(0, Math.floor((STACK_CANVAS_SIZE - item.renderWidth) / 2));
    const tileBuffer = await sharp(item.normalizedBuffer, { failOn: "none" })
      .extract({
        left: 0,
        top: item.trimTop,
        width: item.width,
        height: item.trimHeight,
      })
      .resize(item.renderWidth, item.renderHeight, { fit: "fill" })
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    composites.push({
      input: tileBuffer,
      left,
      top,
    });
    cursorTop += item.renderHeight + gapPx;
  }

  const stackedBuffer = await sharp({
    create: {
      width: STACK_CANVAS_SIZE,
      height: STACK_CANVAS_SIZE,
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
  const fileBaseName = `${toSafeBaseName(spu)}-stack-${buildTimestampToken()}`;
  const fileName = ensureUniqueName(targetAbsolutePath, fileBaseName, "jpg");
  const outputAbsolutePath = path.join(targetAbsolutePath, fileName);
  fs.writeFileSync(outputAbsolutePath, stackedBuffer);
  const outputStat = fs.statSync(outputAbsolutePath);

  let pixelQualityScore: number | null = null;
  try {
    const refreshed = await refreshDraftImageScoreByAbsolutePath(outputAbsolutePath);
    pixelQualityScore = refreshed.pixelQualityScore;
  } catch {
    pixelQualityScore = null;
  }

  const truncatedCount = Math.max(0, sourcePaths.length - MAX_STACK_IMAGES);

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
    canvas: { width: STACK_CANVAS_SIZE, height: STACK_CANVAS_SIZE },
    spacing: {
      totalGapHeightPx: totalGapHeight,
      eachGapPx: gapPx,
      gapCount,
    },
    truncatedCount,
    errors,
  });
}
