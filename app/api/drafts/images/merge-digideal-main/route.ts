import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const OUTPUT_WIDTH = 1424;
const OUTPUT_HEIGHT = 752;
const RIGHT_FADE_PERCENT_DEFAULT = 35;
const LEFT_IMAGE_SCALE = 0.925;
const RIGHT_OVERFLOW_PX = 30;
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

const isInsideDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

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

const buildTimestampToken = () => {
  const iso = new Date().toISOString();
  const compact = iso.replace(/[-:]/g, "").replace(/\..+$/, "");
  return compact.replace("T", "-");
};

const clampFadePercent = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return RIGHT_FADE_PERCENT_DEFAULT;
  if (n < 1) return 1;
  if (n > 50) return 50;
  return Math.round(n);
};

const borderWhiteRatio = async (
  image: sharp.Sharp,
  extract: { left: number; top: number; width: number; height: number }
) => {
  const raw = await image
    .clone()
    .extract(extract)
    .raw()
    .toBuffer();
  const channels = 4;
  const pixelCount = Math.floor(raw.length / channels);
  if (!pixelCount) return 0;
  let whiteCount = 0;
  for (let i = 0; i < raw.length; i += channels) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const a = raw[i + 3];
    const isWhite = a < 16 || (r >= 245 && g >= 245 && b >= 245);
    if (isWhite) whiteCount += 1;
  }
  return whiteCount / pixelCount;
};

const measureWhiteBorderScore = async (absolutePath: string) => {
  const image = sharp(absolutePath).rotate().ensureAlpha();
  const meta = await image.metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) {
    return { whiteSides: 0, borderDensity: 0, score: 0 };
  }

  const stripe = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
  const top = await borderWhiteRatio(image, { left: 0, top: 0, width, height: stripe });
  const bottom = await borderWhiteRatio(image, {
    left: 0,
    top: Math.max(0, height - stripe),
    width,
    height: stripe,
  });
  const left = await borderWhiteRatio(image, { left: 0, top: 0, width: stripe, height });
  const right = await borderWhiteRatio(image, {
    left: Math.max(0, width - stripe),
    top: 0,
    width: stripe,
    height,
  });

  const ratios = [top, bottom, left, right];
  const whiteSides = ratios.filter((ratio) => ratio >= 0.93).length;
  const borderDensity = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  const score = whiteSides * 10 + borderDensity;
  return { whiteSides, borderDensity, score };
};

const buildRightFadeOverlay = (size: number, fadePercent: number) => {
  const fadeWidth = Math.max(1, Math.round(size * (fadePercent / 100)));
  const raw = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      raw[idx] = 255;
      raw[idx + 1] = 255;
      raw[idx + 2] = 255;
      if (x >= fadeWidth) {
        raw[idx + 3] = 0;
        continue;
      }
      const ratio = fadeWidth <= 1 ? 1 : 1 - x / (fadeWidth - 1);
      raw[idx + 3] = Math.max(0, Math.min(255, Math.round(ratio * 255)));
    }
  }
  return { raw, fadeWidth };
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

  const relativePaths = normalizePathList(body.paths);
  if (relativePaths.length !== 2) {
    return NextResponse.json(
      { error: "Select exactly two images for Merge DigiDeal Main." },
      { status: 400 }
    );
  }

  const resolvedImages: Array<{ relativePath: string; absolutePath: string; fileName: string }> =
    [];
  for (const relativePath of relativePaths) {
    const absolutePath = resolveDraftPath(relativePath);
    if (!absolutePath || !isInsideDraftRoot(absolutePath)) {
      return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
    }
    if (!IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      return NextResponse.json({ error: "Unsupported image extension." }, { status: 400 });
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    resolvedImages.push({
      relativePath,
      absolutePath,
      fileName: path.basename(absolutePath),
    });
  }

  const normalizedTargetPath = String(body.targetPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const fallbackTargetPath =
    resolvedImages[0].relativePath.slice(
      0,
      Math.max(0, resolvedImages[0].relativePath.lastIndexOf("/"))
    ) || "";
  const targetRelativePath = normalizedTargetPath || fallbackTargetPath;
  const targetAbsolutePath = resolveDraftPath(targetRelativePath);
  if (!targetAbsolutePath || !isInsideDraftRoot(targetAbsolutePath)) {
    return NextResponse.json({ error: "Invalid target folder." }, { status: 400 });
  }
  if (!fs.existsSync(targetAbsolutePath) || !fs.statSync(targetAbsolutePath).isDirectory()) {
    return NextResponse.json({ error: "Target folder not found." }, { status: 404 });
  }

  const firstScore = await measureWhiteBorderScore(resolvedImages[0].absolutePath);
  const secondScore = await measureWhiteBorderScore(resolvedImages[1].absolutePath);

  const useSecondAsLeft = secondScore.score > firstScore.score;
  const [leftImage, rightImage] = useSecondAsLeft
    ? [resolvedImages[1], resolvedImages[0]]
    : [resolvedImages[0], resolvedImages[1]];
  const leftScore = useSecondAsLeft ? secondScore : firstScore;
  const rightScore = useSecondAsLeft ? firstScore : secondScore;

  const fadePercent = clampFadePercent(body.fadePercent);
  const tile = OUTPUT_HEIGHT;
  const leftTileSize = Math.max(1, Math.round(tile * LEFT_IMAGE_SCALE));
  const leftTop = Math.max(0, Math.floor((OUTPUT_HEIGHT - leftTileSize) / 2));

  const leftTileBuffer = await sharp(leftImage.absolutePath)
    .rotate()
    .resize(leftTileSize, leftTileSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const rightTileBuffer = await sharp(rightImage.absolutePath)
    .rotate()
    .resize(tile, tile, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const { raw: fadeOverlayRaw, fadeWidth } = buildRightFadeOverlay(tile, fadePercent);
  const rightFadedBuffer = await sharp(rightTileBuffer)
    .composite([
      {
        input: fadeOverlayRaw,
        raw: { width: tile, height: tile, channels: 4 },
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  const rightLeft = Math.max(0, OUTPUT_WIDTH - tile + RIGHT_OVERFLOW_PX);
  const outputBuffer = await sharp({
    create: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: leftTileBuffer, left: 0, top: leftTop },
      { input: rightFadedBuffer, left: rightLeft, top: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const targetParts = toRelativePath(targetAbsolutePath)
    .split("/")
    .filter(Boolean);
  const spu = String(targetParts[1] || targetParts[0] || "SPU").trim();
  const fileBaseName = `${toSafeBaseName(spu)}-digideal-main-${buildTimestampToken()}`;
  const outputFileName = ensureUniqueName(targetAbsolutePath, fileBaseName, "jpg");
  const outputAbsolutePath = path.join(targetAbsolutePath, outputFileName);
  fs.writeFileSync(outputAbsolutePath, outputBuffer);
  const outputStat = fs.statSync(outputAbsolutePath);

  let pixelQualityScore: number | null = null;
  try {
    const refreshed = await refreshDraftImageScoreByAbsolutePath(outputAbsolutePath);
    pixelQualityScore = refreshed.pixelQualityScore;
  } catch {
    pixelQualityScore = null;
  }

  return NextResponse.json({
    item: {
      name: outputFileName,
      path: toRelativePath(outputAbsolutePath),
      size: outputStat.size,
      modifiedAt: new Date(outputStat.mtimeMs).toISOString(),
      pixelQualityScore,
      zimageUpscaled: false,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
    },
    merge: {
      leftSource: leftImage.relativePath,
      rightSource: rightImage.relativePath,
      rightFadePercent: fadePercent,
      rightFadePixels: fadeWidth,
      rightImageOffsetX: rightLeft,
      rightOverflowPixels: RIGHT_OVERFLOW_PX,
      leftScale: LEFT_IMAGE_SCALE,
      leftTilePixels: leftTileSize,
      leftOffsetY: leftTop,
      leftWhiteScore: leftScore.score,
      rightWhiteScore: rightScore.score,
    },
  });
}
