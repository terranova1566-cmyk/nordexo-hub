import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const OUTPUT_WIDTH = 1424;
const OUTPUT_HEIGHT = 752;
const RIGHT_SCENE_ZOOM = 1;
const RIGHT_SCENE_COVERAGE = 0.7;
const RIGHT_FADE_PERCENT_DEFAULT = 30;
const RIGHT_FADE_PERCENT_MAX = 30;
const PRODUCT_OVERLAY_SCALE = 0.9;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const ZIMAGE_ROOT = "/srv/node-tools/zimage-api";
const ZIMAGE_BG_REMOVAL_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "background_removal.js");
const ZIMAGE_INPUT_DIR = path.join(ZIMAGE_ROOT, "input");
const ZIMAGE_OUTPUT_DIR = path.join(ZIMAGE_ROOT, "output");
const ZIMAGE_TIMEOUT_MS = 240000;

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
  if (n > RIGHT_FADE_PERCENT_MAX) return RIGHT_FADE_PERCENT_MAX;
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

const buildRightFadeOverlay = (
  width: number,
  height: number,
  fadePercent: number,
  fadeStartX: number,
  fadeBaseWidth: number
) => {
  const safeFadeBaseWidth = Math.max(1, fadeBaseWidth);
  const fadeWidth = Math.max(1, Math.round(safeFadeBaseWidth * (fadePercent / 100)));
  const startX = Math.max(0, Math.min(width - 1, fadeStartX));
  const endX = Math.max(startX, Math.min(width, startX + fadeWidth));
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      raw[idx] = 255;
      raw[idx + 1] = 255;
      raw[idx + 2] = 255;
      if (x < startX || x >= endX) {
        raw[idx + 3] = 0;
        continue;
      }
      // Cosine fade profile (variant #7), starting at the visible border.
      const t = fadeWidth <= 1 ? 1 : (x - startX) / (fadeWidth - 1);
      const whiteMix = Math.max(0, Math.cos((Math.PI / 2) * t));
      raw[idx + 3] = Math.max(0, Math.min(255, Math.round(whiteMix * 255)));
    }
  }
  return { raw, fadeWidth, fadeStartX: startX, fadeEndX: endX };
};

type RunScriptOptions = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
};

const runScript = async ({
  command,
  args,
  env,
  cwd,
  timeoutMs,
}: RunScriptOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      cwd,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            try {
              proc.kill("SIGKILL");
            } catch {}
          }, timeoutMs)
        : null;

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      if (timedOut) {
        reject(
          new Error(
            `Z-Image background removal timed out after ${timeoutMs}ms${
              detail ? `: ${detail}` : ""
            }`
          )
        );
        return;
      }
      reject(new Error(detail || `Z-Image process exited with code ${code}.`));
    });
  });

const findNewestOutputForBase = (baseName: string, sinceMs: number) => {
  if (!fs.existsSync(ZIMAGE_OUTPUT_DIR)) return null;
  const files = fs
    .readdirSync(ZIMAGE_OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${baseName}-`))
    .map((name) => path.join(ZIMAGE_OUTPUT_DIR, name))
    .map((absolutePath) => ({
      absolutePath,
      mtimeMs: fs.statSync(absolutePath).mtimeMs,
    }))
    .filter((entry) => entry.mtimeMs >= sinceMs - 1000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.absolutePath ?? null;
};

const runZImageBackgroundRemovalPng = async (sourceAbsolutePath: string) => {
  fs.mkdirSync(ZIMAGE_INPUT_DIR, { recursive: true });
  fs.mkdirSync(ZIMAGE_OUTPUT_DIR, { recursive: true });

  const ext = path.extname(sourceAbsolutePath).toLowerCase() || ".jpg";
  const baseName = `draft-overlay-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const tempInputPath = path.join(ZIMAGE_INPUT_DIR, `${baseName}${ext}`);
  const expectedOutputPath = path.join(ZIMAGE_OUTPUT_DIR, `${baseName}-background-removed.png`);
  const startedAtMs = Date.now();

  try {
    fs.copyFileSync(sourceAbsolutePath, tempInputPath);
    await runScript({
      command: process.execPath,
      args: [ZIMAGE_BG_REMOVAL_SCRIPT_PATH, "--image", tempInputPath],
      cwd: ZIMAGE_ROOT,
      timeoutMs: ZIMAGE_TIMEOUT_MS,
      env: {
        ...process.env,
        ZIMAGE_BG_REMOVAL_FORMAT: "png",
        ZIMAGE_AUTO_CENTER: "false",
        ZIMAGE_BATCH: "false",
        ZIMAGE_STRICT_QUEUE: "true",
        ZIMAGE_CONCURRENCY: "1",
        ZIMAGE_STOP_ON_ERROR: "true",
      },
    });

    if (fs.existsSync(expectedOutputPath)) {
      return { outputPath: expectedOutputPath, tempInputPath };
    }

    const fallback = findNewestOutputForBase(baseName, startedAtMs);
    if (fallback && fs.existsSync(fallback)) {
      return { outputPath: fallback, tempInputPath };
    }

    throw new Error("Z-Image returned no PNG output.");
  } catch (error) {
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
    } catch {}
    throw error;
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

  const relativePaths = normalizePathList(body.paths);
  if (relativePaths.length !== 2) {
    return NextResponse.json(
      { error: "Select exactly two images for DigiDeal Main Overlay." },
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

  const useSecondAsProduct = secondScore.score > firstScore.score;
  const [productImage, sceneImage] = useSecondAsProduct
    ? [resolvedImages[1], resolvedImages[0]]
    : [resolvedImages[0], resolvedImages[1]];
  const productScore = useSecondAsProduct ? secondScore : firstScore;
  const sceneScore = useSecondAsProduct ? firstScore : secondScore;

  let cutoutPngAbsolutePath = "";
  let tempInputAbsolutePath = "";
  try {
    const fadePercent = clampFadePercent(body.fadePercent);
    const zimage = await runZImageBackgroundRemovalPng(productImage.absolutePath);
    cutoutPngAbsolutePath = zimage.outputPath;
    tempInputAbsolutePath = zimage.tempInputPath;

    const rightPanelWidth = Math.max(
      1,
      Math.min(OUTPUT_WIDTH, Math.round(OUTPUT_WIDTH * RIGHT_SCENE_COVERAGE))
    );
    const rightPanelHeight = OUTPUT_HEIGHT;
    const sceneMetadata = await sharp(sceneImage.absolutePath).metadata();
    const sourceWidthRaw = Number(sceneMetadata.width || 0);
    const sourceHeightRaw = Number(sceneMetadata.height || 0);
    const orientation = Number(sceneMetadata.orientation || 1);
    const rotated90 = orientation >= 5 && orientation <= 8;
    const sourceWidth = rotated90 ? sourceHeightRaw : sourceWidthRaw;
    const sourceHeight = rotated90 ? sourceWidthRaw : sourceHeightRaw;
    const fallbackScale = 1;
    const fitScale =
      sourceWidth > 0 && sourceHeight > 0
        ? Math.min(rightPanelWidth / sourceWidth, rightPanelHeight / sourceHeight)
        : fallbackScale;
    const fittedSceneWidth = Math.max(
      1,
      Math.min(rightPanelWidth, Math.round(sourceWidth * fitScale))
    );
    const fittedSceneHeight = Math.max(
      1,
      Math.min(rightPanelHeight, Math.round(sourceHeight * fitScale))
    );
    // Right-align the scenic image so any white padding appears only on the fade/left side.
    const sceneContentLeft = Math.max(0, rightPanelWidth - fittedSceneWidth);
    const sceneContentTop = Math.max(0, Math.floor((rightPanelHeight - fittedSceneHeight) / 2));

    const rightSceneBuffer = await sharp(sceneImage.absolutePath)
      .rotate()
      // Keep the full scene frame visible (no crop), and fit into the wider right panel.
      .resize(rightPanelWidth, rightPanelHeight, {
        fit: "contain",
        position: "right",
        background: { r: 255, g: 255, b: 255 },
      })
      .png()
      .toBuffer();

    const { raw: rightFadeOverlayRaw, fadeWidth, fadeStartX, fadeEndX } = buildRightFadeOverlay(
      rightPanelWidth,
      rightPanelHeight,
      fadePercent,
      sceneContentLeft,
      fittedSceneWidth
    );
    const rightSceneFadedBuffer = await sharp(rightSceneBuffer)
      .composite([
        {
          input: rightFadeOverlayRaw,
          raw: { width: rightPanelWidth, height: rightPanelHeight, channels: 4 },
          blend: "over",
        },
      ])
      .png()
      .toBuffer();

    const productTileSize = Math.max(1, Math.round(OUTPUT_HEIGHT * PRODUCT_OVERLAY_SCALE));
    const productTop = Math.max(0, Math.floor((OUTPUT_HEIGHT - productTileSize) / 2));

    const leftCutoutBuffer = await sharp(cutoutPngAbsolutePath)
      .rotate()
      .resize(productTileSize, productTileSize, {
        fit: "contain",
        position: "left",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const rightLeft = Math.max(0, OUTPUT_WIDTH - rightPanelWidth);
    const outputBuffer = await sharp({
      create: {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: rightSceneFadedBuffer, left: rightLeft, top: 0 },
        { input: leftCutoutBuffer, left: 0, top: productTop },
      ])
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();

    const targetParts = toRelativePath(targetAbsolutePath)
      .split("/")
      .filter(Boolean);
    const spu = String(targetParts[1] || targetParts[0] || "SPU").trim();
    const fileBaseName = `${toSafeBaseName(spu)}-digideal-main-overlay-v2-${buildTimestampToken()}`;
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
        mode: "digideal_main_overlay_v2",
        leftSource: productImage.relativePath,
        rightSource: sceneImage.relativePath,
        rightZoom: RIGHT_SCENE_ZOOM,
        rightCoverage: RIGHT_SCENE_COVERAGE,
        rightPanelWidth,
        rightPanelHeight,
        rightFadePercent: fadePercent,
        rightFadePixels: fadeWidth,
        rightFadeStartX: fadeStartX,
        rightFadeEndX: fadeEndX,
        rightSceneContentLeft: sceneContentLeft,
        rightSceneContentTop: sceneContentTop,
        rightSceneFittedWidth: fittedSceneWidth,
        rightSceneFittedHeight: fittedSceneHeight,
        rightImageOffsetX: rightLeft,
        productOverlayScale: PRODUCT_OVERLAY_SCALE,
        productOverlayLeft: 0,
        productOverlayTop: productTop,
        cutoutFormat: "png",
        productWhiteScore: productScore.score,
        sceneWhiteScore: sceneScore.score,
      },
    });
  } finally {
    try {
      if (tempInputAbsolutePath && fs.existsSync(tempInputAbsolutePath)) {
        fs.unlinkSync(tempInputAbsolutePath);
      }
    } catch {}
    try {
      if (cutoutPngAbsolutePath && fs.existsSync(cutoutPngAbsolutePath)) {
        fs.unlinkSync(cutoutPngAbsolutePath);
      }
    } catch {}
  }
}
