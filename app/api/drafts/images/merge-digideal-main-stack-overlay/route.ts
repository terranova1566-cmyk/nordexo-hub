import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath, toRelativePath } from "@/lib/drafts";
import { runAutoCenterWhiteInPlace } from "@/lib/draft-ai-edits";
import { refreshDraftImageScoreByAbsolutePath } from "@/lib/draft-image-score";

export const runtime = "nodejs";

const OUTPUT_WIDTH = 1424;
const OUTPUT_HEIGHT = 752;
const OUTPUT_STACK_OVERLAY_SIZE = 1000;
const STACK_OVERLAY_CANVAS_PADDING = 24;
const RIGHT_SCENE_COVERAGE = 0.7;
const RIGHT_FADE_PERCENT_DEFAULT = 30;
const RIGHT_FADE_PERCENT_MAX = 30;

const STACK_MIN_IMAGES = 3;
const STACK_OVERLAY_STANDALONE_MIN_IMAGES = 2;
const STACK_MAX_IMAGES = 9;
const STACK_ZONE_WIDTH = 770;
const STACK_ZONE_HEIGHT = 700;
const STACK_ZONE_LEFT_MARGIN = 21;
const STACK_ZONE_PADDING_X = 12;
const STACK_ZONE_PADDING_Y = 12;
const ALPHA_LIVE_THRESHOLD = 8;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const ZIMAGE_ROOT = "/srv/node-tools/zimage-api";
const ZIMAGE_BG_REMOVAL_SCRIPT_PATH = path.join(ZIMAGE_ROOT, "background_removal.js");
const ZIMAGE_INPUT_DIR = path.join(ZIMAGE_ROOT, "input");
const ZIMAGE_OUTPUT_DIR = path.join(ZIMAGE_ROOT, "output");
const ZIMAGE_TIMEOUT_MS = 240000;
const STACK_OVERLAY_CUTOUT_CACHE_DIR = "/srv/nordexo-hub/tmp/draft-stack-overlay-cutouts";
const STACK_OVERLAY_CUTOUT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

type ResolvedImage = {
  relativePath: string;
  absolutePath: string;
  fileName: string;
};

type CutoutCard = {
  sourceRelativePath: string;
  cutoutBuffer: Buffer;
  width: number;
  height: number;
};

type CutoutCacheResult = {
  cutoutAbsolutePath: string;
  cacheHit: boolean;
  cacheKey: string;
  tempInputPath?: string;
  tempOutputPath?: string;
};

type PreparedCard = CutoutCard & {
  renderBuffer: Buffer;
  renderWidth: number;
  renderHeight: number;
};

type CardPlacement = PreparedCard & {
  left: number;
  top: number;
  zIndex: number;
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
  const raw = await image.clone().extract(extract).raw().toBuffer();
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
      // Cosine fade profile; 100% white at fade start to 0% at fade end.
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
  const baseName = `draft-stack-overlay-${Date.now()}-${randomUUID().slice(0, 8)}`;
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

const ensureDir = (absolutePath: string) => {
  if (!absolutePath) return;
  fs.mkdirSync(absolutePath, { recursive: true });
};

const buildCutoutCacheKey = (sourceAbsolutePath: string) => {
  const stat = fs.statSync(sourceAbsolutePath);
  const mtimeToken = String(Math.round(stat.mtimeMs));
  const sizeToken = String(stat.size);
  const pathToken = createHash("sha1").update(sourceAbsolutePath).digest("hex").slice(0, 20);
  return `${pathToken}-${sizeToken}-${mtimeToken}.png`;
};

const pruneStaleCutoutCache = () => {
  try {
    ensureDir(STACK_OVERLAY_CUTOUT_CACHE_DIR);
    const now = Date.now();
    for (const entry of fs.readdirSync(STACK_OVERLAY_CUTOUT_CACHE_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(STACK_OVERLAY_CUTOUT_CACHE_DIR, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (now - stat.mtimeMs > STACK_OVERLAY_CUTOUT_CACHE_MAX_AGE_MS) {
        try {
          fs.unlinkSync(absolutePath);
        } catch {}
      }
    }
  } catch {}
};

const resolveCachedOrCreateCutout = async (sourceAbsolutePath: string): Promise<CutoutCacheResult> => {
  ensureDir(STACK_OVERLAY_CUTOUT_CACHE_DIR);
  const cacheKey = buildCutoutCacheKey(sourceAbsolutePath);
  const cachePath = path.join(STACK_OVERLAY_CUTOUT_CACHE_DIR, cacheKey);

  if (fs.existsSync(cachePath)) {
    return {
      cutoutAbsolutePath: cachePath,
      cacheHit: true,
      cacheKey,
    };
  }

  const zimage = await runZImageBackgroundRemovalPng(sourceAbsolutePath);
  let cutoutAbsolutePath = zimage.outputPath;
  try {
    fs.copyFileSync(zimage.outputPath, cachePath);
    cutoutAbsolutePath = cachePath;
  } catch {
    cutoutAbsolutePath = zimage.outputPath;
  }

  return {
    cutoutAbsolutePath,
    cacheHit: false,
    cacheKey,
    tempInputPath: zimage.tempInputPath,
    tempOutputPath: zimage.outputPath,
  };
};

const extractCutoutCard = async (
  cutoutAbsolutePath: string,
  sourceRelativePath: string
): Promise<CutoutCard> => {
  const rotated = sharp(cutoutAbsolutePath).rotate().ensureAlpha();
  const rawResult = await rotated.clone().raw().toBuffer({ resolveWithObject: true });
  const width = Number(rawResult.info.width || 0);
  const height = Number(rawResult.info.height || 0);
  const channels = Number(rawResult.info.channels || 4);

  if (!width || !height || channels < 4) {
    throw new Error("Invalid cutout dimensions.");
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const alpha = rawResult.data[idx + 3] ?? 0;
      if (alpha >= ALPHA_LIVE_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    const fallbackBuffer = await rotated.png().toBuffer();
    return {
      sourceRelativePath,
      cutoutBuffer: fallbackBuffer,
      width,
      height,
    };
  }

  const cropWidth = Math.max(1, maxX - minX + 1);
  const cropHeight = Math.max(1, maxY - minY + 1);
  const croppedBuffer = await rotated
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  return {
    sourceRelativePath,
    cutoutBuffer: croppedBuffer,
    width: cropWidth,
    height: cropHeight,
  };
};

const prepareRenderedCard = async (
  card: CutoutCard,
  slotSize: number,
  scale: number,
  angleDeg: number
): Promise<PreparedCard> => {
  const boxSize = Math.max(1, Math.round(slotSize * scale));
  const ratio = Math.min(boxSize / card.width, boxSize / card.height);
  const resizedWidth = Math.max(1, Math.round(card.width * ratio));
  const resizedHeight = Math.max(1, Math.round(card.height * ratio));

  if (Math.abs(angleDeg) >= 0.01) {
    const rotated = await sharp(card.cutoutBuffer)
      .resize(resizedWidth, resizedHeight, { fit: "fill" })
      .rotate(angleDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      ...card,
      renderBuffer: rotated.data,
      renderWidth: Math.max(1, Number(rotated.info.width || resizedWidth)),
      renderHeight: Math.max(1, Number(rotated.info.height || resizedHeight)),
    };
  }

  const renderBuffer = await sharp(card.cutoutBuffer)
    .resize(resizedWidth, resizedHeight, { fit: "fill" })
    .png()
    .toBuffer();
  return {
    ...card,
    renderBuffer,
    renderWidth: resizedWidth,
    renderHeight: resizedHeight,
  };
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

type StackLayoutSpec = {
  frontCount: number;
  backCount: number;
  frontScale: number;
  backScale: number;
  frontOverlap: number;
  backOverlap: number;
  frontCenterOffsetY: number;
  backCenterOffsetY: number;
};

type BuiltRow = {
  placements: CardPlacement[];
  stridePx: number;
  slotPx: number;
};

const getStackLayoutSpec = (cardCount: number): StackLayoutSpec => {
  switch (cardCount) {
    case 2:
      return {
        frontCount: 1,
        backCount: 1,
        frontScale: 1,
        backScale: 1,
        frontOverlap: 0,
        backOverlap: 0,
        frontCenterOffsetY: 0.14,
        backCenterOffsetY: 0.24,
      };
    case 3:
      return {
        frontCount: 1,
        backCount: 2,
        frontScale: 1.15,
        backScale: 1,
        frontOverlap: 0,
        backOverlap: 0.12,
        frontCenterOffsetY: 0.2,
        backCenterOffsetY: -0.3,
      };
    case 4:
      return {
        frontCount: 2,
        backCount: 2,
        frontScale: 1.1,
        backScale: 1,
        frontOverlap: 0.12,
        backOverlap: 0.12,
        frontCenterOffsetY: 0.12,
        backCenterOffsetY: -0.2,
      };
    case 5:
      return {
        frontCount: 2,
        backCount: 3,
        frontScale: 1.5,
        backScale: 1,
        frontOverlap: 0.16,
        backOverlap: 0.18,
        frontCenterOffsetY: 0.2,
        backCenterOffsetY: -0.3,
      };
    case 6:
      return {
        frontCount: 3,
        backCount: 3,
        frontScale: 1.28,
        backScale: 1,
        frontOverlap: 0.14,
        backOverlap: 0.16,
        frontCenterOffsetY: 0.18,
        backCenterOffsetY: -0.28,
      };
    case 7:
      return {
        frontCount: 3,
        backCount: 4,
        frontScale: 1.5,
        backScale: 1,
        frontOverlap: 0.16,
        backOverlap: 0.18,
        frontCenterOffsetY: 0.2,
        backCenterOffsetY: -0.3,
      };
    case 8:
      return {
        frontCount: 4,
        backCount: 4,
        frontScale: 1.3,
        backScale: 1,
        frontOverlap: 0.14,
        backOverlap: 0.16,
        frontCenterOffsetY: 0.18,
        backCenterOffsetY: -0.28,
      };
    default:
      return {
        frontCount: 4,
        backCount: 5,
        frontScale: 1.25,
        backScale: 1,
        frontOverlap: 0.14,
        backOverlap: 0.16,
        frontCenterOffsetY: 0.18,
        backCenterOffsetY: -0.28,
      };
  }
};

const computeRowWidthMultiplier = (count: number, scale: number, overlap: number) => {
  if (count <= 0) return 0;
  if (count === 1) return scale;
  const strideRatio = 1 - clamp(overlap, 0, 0.95);
  return scale * (1 + (count - 1) * strideRatio);
};

const buildRowPlacements = async ({
  cards,
  slotSize,
  scale,
  overlap,
  centerY,
  zIndexBase,
}: {
  cards: CutoutCard[];
  slotSize: number;
  scale: number;
  overlap: number;
  centerY: number;
  zIndexBase: number;
}): Promise<BuiltRow> => {
  if (!cards.length) {
    return { placements: [], stridePx: 0, slotPx: 0 };
  }

  const slotPx = Math.max(1, Math.round(slotSize * scale));
  const stridePx =
    cards.length > 1
      ? Math.max(1, Math.round(slotPx * (1 - clamp(overlap, 0, 0.95))))
      : 0;
  const rowWidth = cards.length === 1 ? slotPx : slotPx + stridePx * (cards.length - 1);
  const rowLeft = Math.round((STACK_ZONE_WIDTH - rowWidth) / 2);
  const rowTop = Math.round(centerY - slotPx / 2);

  const placements: CardPlacement[] = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const rendered = await prepareRenderedCard(card, slotSize, scale, 0);
    const cellLeft = rowLeft + index * stridePx;
    const cellTop = rowTop;
    const left = Math.round(cellLeft + (slotPx - rendered.renderWidth) / 2);
    const top = Math.round(cellTop + (slotPx - rendered.renderHeight) / 2);
    placements.push({
      ...rendered,
      left: clamp(left, 0, Math.max(0, STACK_ZONE_WIDTH - rendered.renderWidth)),
      top: clamp(top, 0, Math.max(0, STACK_ZONE_HEIGHT - rendered.renderHeight)),
      zIndex: zIndexBase + index,
    });
  }

  return { placements, stridePx, slotPx };
};

const splitFrontBackCards = (
  cards: CutoutCard[],
  frontCount: number,
  preferredTopSourcePath?: string
) => {
  const remaining = [...cards];
  let topImagePathApplied = "";

  let forcedTop: CutoutCard | null = null;
  if (preferredTopSourcePath) {
    const idx = remaining.findIndex((card) => card.sourceRelativePath === preferredTopSourcePath);
    if (idx >= 0) {
      forcedTop = remaining[idx];
      remaining.splice(idx, 1);
      topImagePathApplied = forcedTop.sourceRelativePath;
    }
  }

  if (!forcedTop && remaining.length) {
    forcedTop = remaining.shift() || null;
    if (forcedTop) {
      topImagePathApplied = forcedTop.sourceRelativePath;
    }
  }

  const front: CutoutCard[] = [];
  if (forcedTop) {
    front.push(forcedTop);
  }
  while (front.length < frontCount && remaining.length) {
    const next = remaining.shift();
    if (!next) break;
    front.push(next);
  }

  return {
    front,
    back: remaining,
    topImagePathApplied,
  };
};

const composeStackZone = async (
  cards: CutoutCard[],
  preferredTopSourcePath?: string
) => {
  const cardCount = cards.length;
  const spec = getStackLayoutSpec(cardCount);
  const split = splitFrontBackCards(cards, spec.frontCount, preferredTopSourcePath);
  const frontCards = split.front.slice(0, spec.frontCount);
  const backCards = split.back.slice(0, spec.backCount);
  const topImagePathApplied = split.topImagePathApplied;

  let selectedPlacements: CardPlacement[] = [];
  let selectedDx = 0;
  let selectedDy = 0;
  let selectedFirstTop = 0;
  let selectedCardBoxWidth = 0;
  let selectedCardBoxHeight = 0;

  if (cardCount === 2 && frontCards.length === 1 && backCards.length === 1) {
    // Two-card mode: no tilt, large coverage across the full stack zone,
    // slight diagonal offset where the back card is raised and shifted right.
    // Slightly enlarge pair footprint (+5%) from the previous tuning.
    const frontCard = await prepareRenderedCard(frontCards[0], 567, 1, 0);
    const backCard = await prepareRenderedCard(backCards[0], 529, 1, 0);

    // Reduce pair separation by 20%, while keeping the pair centered in stack zone.
    const pairCenterX = Math.round(STACK_ZONE_WIDTH / 2);
    const oldSeparationX = STACK_ZONE_WIDTH * (0.74 - 0.36);
    const newSeparationX = oldSeparationX * 0.8;
    const frontCenterX = Math.round(pairCenterX - newSeparationX / 2);
    const frontCenterY = Math.round(STACK_ZONE_HEIGHT * 0.63);
    const backCenterX = Math.round(pairCenterX + newSeparationX / 2);
    const backCenterY = Math.round(STACK_ZONE_HEIGHT * 0.48);

    const frontLeft = clamp(
      Math.round(frontCenterX - frontCard.renderWidth / 2),
      0,
      Math.max(0, STACK_ZONE_WIDTH - frontCard.renderWidth)
    );
    const frontTop = clamp(
      Math.round(frontCenterY - frontCard.renderHeight / 2),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - frontCard.renderHeight)
    );
    const backLeft = clamp(
      Math.round(backCenterX - backCard.renderWidth / 2),
      0,
      Math.max(0, STACK_ZONE_WIDTH - backCard.renderWidth)
    );
    const backTop = clamp(
      Math.round(backCenterY - backCard.renderHeight / 2),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - backCard.renderHeight)
    );

    selectedPlacements = [
      { ...backCard, left: backLeft, top: backTop, zIndex: 10 },
      { ...frontCard, left: frontLeft, top: frontTop, zIndex: 100 },
    ];

    // Normalize final pair placement:
    // - center horizontally inside stack zone (no forced left anchoring)
    // - center vertically for equal top/bottom spacing
    // - respect padding constraints
    const minLeft = Math.min(...selectedPlacements.map((card) => card.left));
    const maxRight = Math.max(
      ...selectedPlacements.map((card) => card.left + card.renderWidth)
    );
    const minTop = Math.min(...selectedPlacements.map((card) => card.top));
    const maxBottom = Math.max(
      ...selectedPlacements.map((card) => card.top + card.renderHeight)
    );
    const contentWidth = Math.max(1, maxRight - minLeft);
    const contentHeight = Math.max(1, maxBottom - minTop);

    const desiredLeftRaw = Math.round((STACK_ZONE_WIDTH - contentWidth) / 2);
    const desiredLeft = clamp(
      desiredLeftRaw,
      STACK_ZONE_PADDING_X,
      Math.max(STACK_ZONE_PADDING_X, STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X - contentWidth)
    );
    const desiredShiftX = desiredLeft - minLeft;
    const minShiftX = -minLeft;
    const maxShiftX = STACK_ZONE_WIDTH - maxRight;
    const shiftX = clamp(desiredShiftX, minShiftX, maxShiftX);

    const desiredTopRaw = Math.round((STACK_ZONE_HEIGHT - contentHeight) / 2);
    const desiredTop = clamp(
      desiredTopRaw,
      STACK_ZONE_PADDING_Y,
      Math.max(STACK_ZONE_PADDING_Y, STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y - contentHeight)
    );
    const desiredShiftY = desiredTop - minTop;
    const minShiftY = -minTop;
    const maxShiftY = STACK_ZONE_HEIGHT - maxBottom;
    const shiftY = clamp(desiredShiftY, minShiftY, maxShiftY);

    selectedPlacements = selectedPlacements.map((card) => ({
      ...card,
      left: clamp(
        card.left + shiftX,
        0,
        Math.max(0, STACK_ZONE_WIDTH - card.renderWidth)
      ),
      top: clamp(
        card.top + shiftY,
        0,
        Math.max(0, STACK_ZONE_HEIGHT - card.renderHeight)
      ),
    }));

    const frontPlaced = selectedPlacements.find((card) => card.zIndex === 100);
    const backPlaced = selectedPlacements.find((card) => card.zIndex === 10);
    selectedDx =
      frontPlaced && backPlaced
        ? Math.max(0, Math.round(backPlaced.left - frontPlaced.left))
        : 0;
    selectedDy =
      frontPlaced && backPlaced
        ? Math.max(0, Math.round(frontPlaced.top - backPlaced.top))
        : 0;
    selectedFirstTop = Math.min(...selectedPlacements.map((card) => card.top));
    selectedCardBoxWidth = 567;
    selectedCardBoxHeight = 567;
  } else if (cardCount === 3 && frontCards.length === 1 && backCards.length >= 2) {
    // Three-card mode:
    // - Card #1 (front/top) stays anchored.
    // - Card #2 is 7.5% smaller, pushed right by 30% from card #1 center, and lifted by 10%.
    // - Card #3 repeats the same rule from card #2 and is another 7.5% smaller.
    const frontSlot = 567;
    const secondSlot = Math.max(1, Math.round(frontSlot * 0.925));
    const thirdSlot = Math.max(1, Math.round(secondSlot * 0.925));

    const frontCard = await prepareRenderedCard(frontCards[0], frontSlot, 1, 0);
    const secondCard = await prepareRenderedCard(backCards[0], secondSlot, 1, 0);
    const thirdCard = await prepareRenderedCard(backCards[1], thirdSlot, 1, 0);

    // Keep front anchor stable and tail the rest up/right behind it.
    // X: left-align package with an added +5% left margin.
    // Y: second top is 7.5% higher than first top; third top is 7.5% higher than second top.
    // Reduce initial left margin by 25% (5% -> 3.75% of width).
    const frontLeftBase = STACK_ZONE_PADDING_X + Math.round(STACK_ZONE_WIDTH * 0.0375);
    const frontTopBase = clamp(
      Math.round(STACK_ZONE_HEIGHT * 0.7 - frontCard.renderHeight / 2),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - frontCard.renderHeight)
    );
    const frontCenterX = frontLeftBase + frontCard.renderWidth / 2;
    const secondCenterX = frontCenterX + frontCard.renderWidth * 0.45;
    const thirdCenterX = secondCenterX + secondCard.renderWidth * 0.5;

    const frontLeft = clamp(
      Math.round(frontLeftBase),
      0,
      Math.max(0, STACK_ZONE_WIDTH - frontCard.renderWidth)
    );
    const secondLeft = clamp(
      Math.round(secondCenterX - secondCard.renderWidth / 2),
      0,
      Math.max(0, STACK_ZONE_WIDTH - secondCard.renderWidth)
    );
    const thirdLeft = clamp(
      Math.round(thirdCenterX - thirdCard.renderWidth / 2),
      0,
      Math.max(0, STACK_ZONE_WIDTH - thirdCard.renderWidth)
    );

    const frontTop = frontTopBase;
    const secondTop = Math.round(frontTop - frontCard.renderHeight * 0.075);
    const thirdTop = Math.round(secondTop - secondCard.renderHeight * 0.075);

    // Keep requested spacing/offsets intact while fitting in stack-zone Y bounds.
    // Then center the full 3-card block vertically (equal top/bottom spacing).
    const minTopRaw = Math.min(frontTop, secondTop, thirdTop);
    const maxBottomRaw = Math.max(
      frontTop + frontCard.renderHeight,
      secondTop + secondCard.renderHeight,
      thirdTop + thirdCard.renderHeight
    );
    const contentHeight = Math.max(1, maxBottomRaw - minTopRaw);
    const desiredTop = Math.round((STACK_ZONE_HEIGHT - contentHeight) / 2);
    const desiredShiftY = desiredTop - minTopRaw;
    const minShiftY = STACK_ZONE_PADDING_Y - minTopRaw;
    const maxShiftY = STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y - maxBottomRaw;
    const shiftY =
      minShiftY <= maxShiftY ? clamp(desiredShiftY, minShiftY, maxShiftY) : maxShiftY;

    const frontTopFitted = clamp(
      Math.round(frontTop + shiftY),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - frontCard.renderHeight)
    );
    const secondTopFitted = clamp(
      Math.round(secondTop + shiftY),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - secondCard.renderHeight)
    );
    const thirdTopFitted = clamp(
      Math.round(thirdTop + shiftY),
      0,
      Math.max(0, STACK_ZONE_HEIGHT - thirdCard.renderHeight)
    );

    selectedPlacements = [
      { ...thirdCard, left: thirdLeft, top: thirdTopFitted, zIndex: 5 },
      { ...secondCard, left: secondLeft, top: secondTopFitted, zIndex: 10 },
      { ...frontCard, left: frontLeft, top: frontTopFitted, zIndex: 100 },
    ];

    selectedDx = Math.max(0, secondLeft - frontLeft);
    selectedDy = Math.max(0, frontTopFitted - secondTopFitted);
    selectedFirstTop = Math.min(...selectedPlacements.map((card) => card.top));
    selectedCardBoxWidth = frontSlot;
    selectedCardBoxHeight = frontSlot;
  } else if (cardCount === 4 && frontCards.length >= 1 && frontCards.length + backCards.length >= 4) {
    // Four-card mode: one trailing line (front -> 2nd -> 3rd -> 4th),
    // using compressed offsets to fit the added 4th card.
    const trailingCards = [...frontCards.slice(1), ...backCards];
    if (trailingCards.length < 3) {
      throw new Error("Four-card stack layout requires four product cards.");
    }

    const baseFrontSlot = 567;
    const baseSecondSlot = Math.max(1, Math.round(baseFrontSlot * 0.925));
    const baseThirdSlot = Math.max(1, Math.round(baseSecondSlot * 0.925));
    const baseFourthSlot = Math.max(1, Math.round(baseThirdSlot * 0.925));

    const frontLeftBase = STACK_ZONE_PADDING_X + Math.round(STACK_ZONE_WIDTH * 0.05);

    // Requested compression:
    // 2nd X offset reduced by 30% from current 3-card setup (0.45 -> 0.315)
    // 3rd X offset reduced by 40% from current 3-card setup (0.50 -> 0.30)
    // 4th follows same 3rd-vs-2nd pattern.
    const stepX12Ratio = 0.315;
    const stepX23Ratio = 0.3;
    const stepX34Ratio = stepX23Ratio;

    // Requested vertical compression:
    // take current vertical rise and reduce it by another 20%.
    const stepYRatio = 0.075 * 0.7 * 0.8;

    const buildFourPlacements = async (scaleMul: number) => {
      const frontSlot = Math.max(1, Math.round(baseFrontSlot * scaleMul));
      const secondSlot = Math.max(1, Math.round(baseSecondSlot * scaleMul));
      const thirdSlot = Math.max(1, Math.round(baseThirdSlot * scaleMul));
      const fourthSlot = Math.max(1, Math.round(baseFourthSlot * scaleMul));

      const frontCard = await prepareRenderedCard(frontCards[0], frontSlot, 1, 0);
      const secondCard = await prepareRenderedCard(trailingCards[0], secondSlot, 1, 0);
      const thirdCard = await prepareRenderedCard(trailingCards[1], thirdSlot, 1, 0);
      const fourthCard = await prepareRenderedCard(trailingCards[2], fourthSlot, 1, 0);

      const frontTop = Math.round(STACK_ZONE_HEIGHT * 0.7 - frontCard.renderHeight / 2);
      const secondTop = Math.round(frontTop - frontCard.renderHeight * stepYRatio);
      const thirdTop = Math.round(secondTop - secondCard.renderHeight * stepYRatio);
      const fourthTop = Math.round(thirdTop - thirdCard.renderHeight * stepYRatio);

      const frontLeft = frontLeftBase;
      const frontCenterX = frontLeft + frontCard.renderWidth / 2;
      const secondCenterX = frontCenterX + frontCard.renderWidth * stepX12Ratio;
      const thirdCenterX = secondCenterX + secondCard.renderWidth * stepX23Ratio;
      const fourthCenterX = thirdCenterX + thirdCard.renderWidth * stepX34Ratio;

      const secondLeft = Math.round(secondCenterX - secondCard.renderWidth / 2);
      const thirdLeft = Math.round(thirdCenterX - thirdCard.renderWidth / 2);
      const fourthLeft = Math.round(fourthCenterX - fourthCard.renderWidth / 2);

      const placementsRaw: CardPlacement[] = [
        { ...fourthCard, left: fourthLeft, top: fourthTop, zIndex: 4 },
        { ...thirdCard, left: thirdLeft, top: thirdTop, zIndex: 8 },
        { ...secondCard, left: secondLeft, top: secondTop, zIndex: 12 },
        { ...frontCard, left: frontLeft, top: frontTop, zIndex: 100 },
      ];

      const minLeft = Math.min(...placementsRaw.map((card) => card.left));
      const maxRight = Math.max(...placementsRaw.map((card) => card.left + card.renderWidth));
      const minTop = Math.min(...placementsRaw.map((card) => card.top));
      const maxBottom = Math.max(...placementsRaw.map((card) => card.top + card.renderHeight));

      return {
        placementsRaw,
        bounds: { minLeft, maxRight, minTop, maxBottom },
        slots: { frontSlot, secondSlot, thirdSlot, fourthSlot },
      };
    };

    let built = await buildFourPlacements(1);
    // Allow the four-card composition to use the full stack zone width (with side padding).
    const availableWidth = Math.max(1, STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X * 2);
    const availableHeight = Math.max(1, STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y * 2);
    const contentWidth = Math.max(1, built.bounds.maxRight - built.bounds.minLeft);
    const contentHeight = Math.max(1, built.bounds.maxBottom - built.bounds.minTop);
    const fitScale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);

    if (fitScale < 0.999) {
      built = await buildFourPlacements(fitScale);
    }

    const minTopRaw = built.bounds.minTop;
    const maxBottomRaw = built.bounds.maxBottom;
    const fittedHeight = Math.max(1, maxBottomRaw - minTopRaw);
    const desiredTop = Math.round((STACK_ZONE_HEIGHT - fittedHeight) / 2);
    const desiredShiftY = desiredTop - minTopRaw;
    const minShiftY = STACK_ZONE_PADDING_Y - minTopRaw;
    const maxShiftY = STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y - maxBottomRaw;
    const shiftY =
      minShiftY <= maxShiftY ? clamp(desiredShiftY, minShiftY, maxShiftY) : maxShiftY;

    // Evenly spread horizontal positions so the full composition fills the width.
    const targetMinLeft = STACK_ZONE_PADDING_X;
    const targetMaxRight = STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X;
    const targetSpan = Math.max(1, targetMaxRight - targetMinLeft);
    const rightMostCard = built.placementsRaw.reduce((maxCard, card) =>
      card.left + card.renderWidth > maxCard.left + maxCard.renderWidth ? card : maxCard
    );
    const sourceLead = Math.max(1, rightMostCard.left - built.bounds.minLeft);
    const targetLead = Math.max(1, targetSpan - rightMostCard.renderWidth);
    const spreadRatio = targetLead / sourceLead;
    const spreadRaw = built.placementsRaw.map((card) => ({
      ...card,
      left: Math.round(targetMinLeft + (card.left - built.bounds.minLeft) * spreadRatio),
    }));

    const spreadMinLeft = Math.min(...spreadRaw.map((card) => card.left));
    const spreadMaxRight = Math.max(...spreadRaw.map((card) => card.left + card.renderWidth));
    const minShiftX = targetMinLeft - spreadMinLeft;
    const maxShiftX = targetMaxRight - spreadMaxRight;
    const shiftX = minShiftX <= maxShiftX ? clamp(0, minShiftX, maxShiftX) : maxShiftX;

    selectedPlacements = spreadRaw.map((card) => ({
      ...card,
      left: clamp(
        Math.round(card.left + shiftX),
        0,
        Math.max(0, STACK_ZONE_WIDTH - card.renderWidth)
      ),
      top: clamp(
        Math.round(card.top + shiftY),
        0,
        Math.max(0, STACK_ZONE_HEIGHT - card.renderHeight)
      ),
    }));

    const frontPlaced = selectedPlacements.find((card) => card.zIndex === 100);
    const secondPlaced = selectedPlacements.find((card) => card.zIndex === 12);
    selectedDx =
      frontPlaced && secondPlaced
        ? Math.max(0, Math.round(secondPlaced.left - frontPlaced.left))
        : 0;
    selectedDy =
      frontPlaced && secondPlaced
        ? Math.max(0, Math.round(frontPlaced.top - secondPlaced.top))
        : 0;
    selectedFirstTop = Math.min(...selectedPlacements.map((card) => card.top));
    selectedCardBoxWidth = built.slots.frontSlot;
    selectedCardBoxHeight = built.slots.frontSlot;
  } else if (cardCount === 5 && frontCards.length >= 1 && frontCards.length + backCards.length >= 5) {
    // Five-card mode:
    // - Reuse the three-card leading layout (front -> 2nd -> 3rd).
    // - Reduce vertical rise between 1->2 and 2->3 by 30%.
    // - Add a back pair behind the trio, raised by 30% of front image height.
    // - Back pair uses the same internal relation as (2nd -> 3rd).
    const trailingCards = [...frontCards.slice(1), ...backCards];
    if (trailingCards.length < 4) {
      throw new Error("Five-card stack layout requires five product cards.");
    }

    const baseFrontSlot = 567;
    const baseSecondSlot = Math.max(1, Math.round(baseFrontSlot * 0.925));
    const baseThirdSlot = Math.max(1, Math.round(baseSecondSlot * 0.925));
    const basePairFirstSlot = baseSecondSlot;
    const basePairSecondSlot = Math.max(1, Math.round(basePairFirstSlot * 0.925));
    const backPairScale = 0.9; // shrink back pair by 10%

    const frontLeftBase = STACK_ZONE_PADDING_X + Math.round(STACK_ZONE_WIDTH * 0.05);
    const stepYMain = 0.075 * 0.7; // lowered by 30% from current 3-card step
    const stepX12Ratio = 0.45;
    const stepX23Ratio = 0.5;

    const buildFivePlacements = async (scaleMul: number) => {
      const frontSlot = Math.max(1, Math.round(baseFrontSlot * scaleMul));
      const secondSlot = Math.max(1, Math.round(baseSecondSlot * scaleMul));
      const thirdSlot = Math.max(1, Math.round(baseThirdSlot * scaleMul));
      const pairFirstSlot = Math.max(1, Math.round(basePairFirstSlot * scaleMul * backPairScale));
      const pairSecondSlot = Math.max(1, Math.round(basePairSecondSlot * scaleMul * backPairScale));

      const frontCard = await prepareRenderedCard(frontCards[0], frontSlot, 1, 0);
      const secondCard = await prepareRenderedCard(trailingCards[0], secondSlot, 1, 0);
      const thirdCard = await prepareRenderedCard(trailingCards[1], thirdSlot, 1, 0);
      const pairFirstCard = await prepareRenderedCard(trailingCards[2], pairFirstSlot, 1, 0);
      const pairSecondCard = await prepareRenderedCard(trailingCards[3], pairSecondSlot, 1, 0);

      const frontTop = Math.round(STACK_ZONE_HEIGHT * 0.7 - frontCard.renderHeight / 2);
      const secondTop = Math.round(frontTop - frontCard.renderHeight * stepYMain);
      const thirdTop = Math.round(secondTop - secondCard.renderHeight * stepYMain);

      const frontLeft = frontLeftBase;
      const frontCenterX = frontLeft + frontCard.renderWidth / 2;
      const secondCenterX = frontCenterX + frontCard.renderWidth * stepX12Ratio;
      const thirdCenterX = secondCenterX + secondCard.renderWidth * stepX23Ratio;

      const secondLeft = Math.round(secondCenterX - secondCard.renderWidth / 2);
      const thirdLeft = Math.round(thirdCenterX - thirdCard.renderWidth / 2);

      // Back pair sits behind the trio, lifted up to remain visible.
      const pairFirstTop = Math.round(frontTop - frontCard.renderHeight * 0.3);
      const pairSecondTop = Math.round(pairFirstTop - pairFirstCard.renderHeight * stepYMain);

      // Back pair should stay together as a pair, almost centered above the middle
      // lower image, with a small right shift.
      const pairCenterDelta = pairFirstCard.renderWidth * stepX23Ratio;
      const targetPairMidX = secondCenterX;
      const pairFirstCenterX = targetPairMidX - pairCenterDelta / 2;
      const pairSecondCenterX = pairFirstCenterX + pairCenterDelta;

      const pairFirstLeft = Math.round(pairFirstCenterX - pairFirstCard.renderWidth / 2);
      const pairSecondLeft = Math.round(pairSecondCenterX - pairSecondCard.renderWidth / 2);

      const placementsRaw: CardPlacement[] = [
        { ...pairSecondCard, left: pairSecondLeft, top: pairSecondTop, zIndex: 2 },
        { ...pairFirstCard, left: pairFirstLeft, top: pairFirstTop, zIndex: 4 },
        { ...thirdCard, left: thirdLeft, top: thirdTop, zIndex: 8 },
        { ...secondCard, left: secondLeft, top: secondTop, zIndex: 12 },
        { ...frontCard, left: frontLeft, top: frontTop, zIndex: 100 },
      ];

      const minLeft = Math.min(...placementsRaw.map((card) => card.left));
      const maxRight = Math.max(...placementsRaw.map((card) => card.left + card.renderWidth));
      const minTop = Math.min(...placementsRaw.map((card) => card.top));
      const maxBottom = Math.max(...placementsRaw.map((card) => card.top + card.renderHeight));

      return {
        placementsRaw,
        bounds: { minLeft, maxRight, minTop, maxBottom },
        slots: { frontSlot },
      };
    };

    let built = await buildFivePlacements(1);
    // Allow the five-card composition to use the full stack zone width (with side padding).
    const availableWidth = Math.max(1, STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X * 2);
    const availableHeight = Math.max(1, STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y * 2);
    const contentWidth = Math.max(1, built.bounds.maxRight - built.bounds.minLeft);
    const contentHeight = Math.max(1, built.bounds.maxBottom - built.bounds.minTop);
    const fitScale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);

    if (fitScale < 0.999) {
      built = await buildFivePlacements(fitScale);
    }

    const minTopRaw = built.bounds.minTop;
    const maxBottomRaw = built.bounds.maxBottom;
    const fittedHeight = Math.max(1, maxBottomRaw - minTopRaw);
    const desiredTop = Math.round((STACK_ZONE_HEIGHT - fittedHeight) / 2);
    const desiredShiftY = desiredTop - minTopRaw;
    const minShiftY = STACK_ZONE_PADDING_Y - minTopRaw;
    const maxShiftY = STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y - maxBottomRaw;
    const shiftY =
      minShiftY <= maxShiftY ? clamp(desiredShiftY, minShiftY, maxShiftY) : maxShiftY;

    // Evenly spread horizontal positions so the full composition fills the width.
    const targetMinLeft = STACK_ZONE_PADDING_X;
    const targetMaxRight = STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X;
    const targetSpan = Math.max(1, targetMaxRight - targetMinLeft);
    const rightMostCard = built.placementsRaw.reduce((maxCard, card) =>
      card.left + card.renderWidth > maxCard.left + maxCard.renderWidth ? card : maxCard
    );
    const sourceLead = Math.max(1, rightMostCard.left - built.bounds.minLeft);
    const targetLead = Math.max(1, targetSpan - rightMostCard.renderWidth);
    const spreadRatio = targetLead / sourceLead;
    const spreadRaw = built.placementsRaw.map((card) => ({
      ...card,
      left: Math.round(targetMinLeft + (card.left - built.bounds.minLeft) * spreadRatio),
    }));

    const spreadMinLeft = Math.min(...spreadRaw.map((card) => card.left));
    const spreadMaxRight = Math.max(...spreadRaw.map((card) => card.left + card.renderWidth));
    const minShiftX = targetMinLeft - spreadMinLeft;
    const maxShiftX = targetMaxRight - spreadMaxRight;
    const shiftX = minShiftX <= maxShiftX ? clamp(0, minShiftX, maxShiftX) : maxShiftX;

    selectedPlacements = spreadRaw.map((card) => ({
      ...card,
      left: clamp(
        Math.round(card.left + shiftX),
        0,
        Math.max(0, STACK_ZONE_WIDTH - card.renderWidth)
      ),
      top: clamp(
        Math.round(card.top + shiftY),
        0,
        Math.max(0, STACK_ZONE_HEIGHT - card.renderHeight)
      ),
    }));

    const frontPlaced = selectedPlacements.find((card) => card.zIndex === 100);
    const secondPlaced = selectedPlacements.find((card) => card.zIndex === 12);
    selectedDx =
      frontPlaced && secondPlaced
        ? Math.max(0, Math.round(secondPlaced.left - frontPlaced.left))
        : 0;
    selectedDy =
      frontPlaced && secondPlaced
        ? Math.max(0, Math.round(frontPlaced.top - secondPlaced.top))
        : 0;
    selectedFirstTop = Math.min(...selectedPlacements.map((card) => card.top));
    selectedCardBoxWidth = built.slots.frontSlot;
    selectedCardBoxHeight = built.slots.frontSlot;
  } else {
    const widthLimit =
      (STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X * 2) /
      Math.max(
        1,
        computeRowWidthMultiplier(frontCards.length, spec.frontScale, spec.frontOverlap),
        computeRowWidthMultiplier(backCards.length, spec.backScale, spec.backOverlap)
      );

    const frontCenterY = Math.round(
      STACK_ZONE_HEIGHT * (0.5 + spec.frontCenterOffsetY)
    );
    const backCenterY = Math.round(STACK_ZONE_HEIGHT * (0.5 + spec.backCenterOffsetY));

    const verticalLimitForRow = (centerY: number, scale: number) => {
      const topSpace = centerY - STACK_ZONE_PADDING_Y;
      const bottomSpace = STACK_ZONE_HEIGHT - STACK_ZONE_PADDING_Y - centerY;
      const halfSpace = Math.max(1, Math.min(topSpace, bottomSpace));
      return (halfSpace * 2) / Math.max(0.01, scale);
    };

    const verticalLimits = [
      verticalLimitForRow(frontCenterY, spec.frontScale),
      backCards.length ? verticalLimitForRow(backCenterY, spec.backScale) : Number.POSITIVE_INFINITY,
    ];

    const rawSlotSize = Math.floor(
      Math.min(widthLimit, ...verticalLimits, Math.floor(STACK_ZONE_HEIGHT * 0.7))
    );
    const slotSize = clamp(rawSlotSize, 90, Math.max(90, STACK_ZONE_WIDTH - STACK_ZONE_PADDING_X * 2));

    const builtBack = await buildRowPlacements({
      cards: backCards,
      slotSize,
      scale: spec.backScale,
      overlap: spec.backOverlap,
      centerY: backCenterY,
      zIndexBase: 10,
    });
    const builtFront = await buildRowPlacements({
      cards: frontCards,
      slotSize,
      scale: spec.frontScale,
      overlap: spec.frontOverlap,
      centerY: frontCenterY,
      zIndexBase: 100,
    });

    selectedPlacements = [...builtBack.placements, ...builtFront.placements];
    selectedDx = builtFront.stridePx || builtBack.stridePx || 0;
    selectedDy = Math.max(0, frontCenterY - backCenterY);
    selectedFirstTop = selectedPlacements.reduce((min, item) => Math.min(min, item.top), Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(selectedFirstTop)) selectedFirstTop = 0;
    selectedCardBoxWidth = slotSize;
    selectedCardBoxHeight = slotSize;
  }

  const selectedMaxWidth = selectedPlacements.reduce(
    (max, card) => Math.max(max, card.renderWidth),
    1
  );
  const selectedMaxHeight = selectedPlacements.reduce(
    (max, card) => Math.max(max, card.renderHeight),
    1
  );

  const compositeOrder = (() => {
    const byDepth = [...selectedPlacements].sort((a, b) => a.zIndex - b.zIndex);
    if (!topImagePathApplied) return byDepth;
    const topIndex = byDepth.findIndex((card) => card.sourceRelativePath === topImagePathApplied);
    if (topIndex < 0) return byDepth;
    const topCard = byDepth[topIndex];
    return [...byDepth.slice(0, topIndex), ...byDepth.slice(topIndex + 1), topCard];
  })();

  const zoneBuffer = await sharp({
    create: {
      width: STACK_ZONE_WIDTH,
      height: STACK_ZONE_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      compositeOrder.map((card) => ({
        input: card.renderBuffer,
        left: card.left,
        top: card.top,
      }))
    )
    .png()
    .toBuffer();

  return {
    zoneBuffer,
    placements: selectedPlacements,
    maxCardWidth: selectedMaxWidth,
    maxCardHeight: selectedMaxHeight,
    stepRightPx: selectedDx,
    stepUpPx: selectedDy,
    firstTopPx: selectedFirstTop,
    cardBoxWidth: selectedCardBoxWidth,
    cardBoxHeight: selectedCardBoxHeight,
    topImagePathApplied,
  };
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

  const standaloneStackOverlay =
    body.standalone === true ||
    String(body.mode || "")
      .trim()
      .toLowerCase() === "stack_overlay";

  const minSourceImages = standaloneStackOverlay
    ? STACK_OVERLAY_STANDALONE_MIN_IMAGES
    : STACK_MIN_IMAGES;
  const sourcePaths = normalizePathList(body.paths);
  if (sourcePaths.length < minSourceImages) {
    return NextResponse.json(
      {
        error: standaloneStackOverlay
          ? "Select at least two images for Stack Overlay."
          : "Select at least three images for DigiDeal Main Stack Overlay.",
      },
      { status: 400 }
    );
  }

  const limitedSourcePaths = sourcePaths.slice(0, STACK_MAX_IMAGES);
  const truncatedCount = Math.max(0, sourcePaths.length - limitedSourcePaths.length);
  const preferredTopImagePath = String(body.topImagePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  const resolvedImages: ResolvedImage[] = [];
  for (const relativePath of limitedSourcePaths) {
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

  const scoredImages = await Promise.all(
    resolvedImages.map(async (image) => ({
      ...image,
      whiteScore: await measureWhiteBorderScore(image.absolutePath),
    }))
  );

  let scenicImage: (typeof scoredImages)[number] | null = null;
  let productImages = scoredImages;
  if (!standaloneStackOverlay) {
    let scenicIndex = 0;
    for (let i = 1; i < scoredImages.length; i += 1) {
      if (scoredImages[i].whiteScore.score < scoredImages[scenicIndex].whiteScore.score) {
        scenicIndex = i;
      }
    }
    scenicImage = scoredImages[scenicIndex];
    productImages = scoredImages.filter((_, index) => index !== scenicIndex);
    if (productImages.length < 2) {
      return NextResponse.json(
        {
          error:
            "Need at least two white-background images plus one scenic image for stack overlay.",
        },
        { status: 400 }
      );
    }
  } else if (productImages.length < STACK_OVERLAY_STANDALONE_MIN_IMAGES) {
    return NextResponse.json(
      { error: "Need at least two images for Stack Overlay." },
      { status: 400 }
    );
  }

  const tempInputPaths: string[] = [];
  const cutoutTempPaths: string[] = [];
  pruneStaleCutoutCache();

  try {
    const cutoutCards: CutoutCard[] = [];
    let cutoutCacheHits = 0;
    let cutoutCacheMisses = 0;
    const cutoutCacheKeys: string[] = [];
    for (const productImage of productImages) {
      const cutout = await resolveCachedOrCreateCutout(productImage.absolutePath);
      if (cutout.cacheHit) {
        cutoutCacheHits += 1;
      } else {
        cutoutCacheMisses += 1;
      }
      cutoutCacheKeys.push(cutout.cacheKey);
      if (cutout.tempInputPath) tempInputPaths.push(cutout.tempInputPath);
      if (cutout.tempOutputPath) cutoutTempPaths.push(cutout.tempOutputPath);
      const cutoutCard = await extractCutoutCard(cutout.cutoutAbsolutePath, productImage.relativePath);
      cutoutCards.push(cutoutCard);
    }

    const preferredTopProductPath = productImages.some(
      (image) => image.relativePath === preferredTopImagePath
    )
      ? preferredTopImagePath
      : "";
    const stack = await composeStackZone(cutoutCards, preferredTopProductPath || undefined);
    let outputBuffer: Buffer;
    let outputWidth = OUTPUT_WIDTH;
    let outputHeight = OUTPUT_HEIGHT;
    let outputBaseNameSuffix = "digideal-main-stack-overlay";
    let mergeDetails: Record<string, unknown>;

    if (standaloneStackOverlay) {
      outputWidth = OUTPUT_STACK_OVERLAY_SIZE;
      outputHeight = OUTPUT_STACK_OVERLAY_SIZE;
      outputBaseNameSuffix = "stack-overlay";

      const minLeft = stack.placements.length
        ? Math.min(...stack.placements.map((card) => card.left))
        : 0;
      const maxRight = stack.placements.length
        ? Math.max(...stack.placements.map((card) => card.left + card.renderWidth))
        : STACK_ZONE_WIDTH;
      const minTop = stack.placements.length
        ? Math.min(...stack.placements.map((card) => card.top))
        : 0;
      const maxBottom = stack.placements.length
        ? Math.max(...stack.placements.map((card) => card.top + card.renderHeight))
        : STACK_ZONE_HEIGHT;

      const extractLeft = clamp(minLeft, 0, Math.max(0, STACK_ZONE_WIDTH - 1));
      const extractTop = clamp(minTop, 0, Math.max(0, STACK_ZONE_HEIGHT - 1));
      const extractWidth = clamp(
        Math.max(1, maxRight - minLeft),
        1,
        Math.max(1, STACK_ZONE_WIDTH - extractLeft)
      );
      const extractHeight = clamp(
        Math.max(1, maxBottom - minTop),
        1,
        Math.max(1, STACK_ZONE_HEIGHT - extractTop)
      );

      const extractedStackBuffer = await sharp(stack.zoneBuffer)
        .extract({
          left: extractLeft,
          top: extractTop,
          width: extractWidth,
          height: extractHeight,
        })
        .png()
        .toBuffer();

      const targetWidth = Math.max(1, outputWidth - STACK_OVERLAY_CANVAS_PADDING * 2);
      const targetHeight = Math.max(1, outputHeight - STACK_OVERLAY_CANVAS_PADDING * 2);
      const resizedStack = await sharp(extractedStackBuffer)
        .resize(targetWidth, targetHeight, {
          fit: "inside",
          withoutEnlargement: false,
          kernel: "lanczos3",
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      const fittedStackWidth = Math.max(1, Number(resizedStack.info.width || targetWidth));
      const fittedStackHeight = Math.max(1, Number(resizedStack.info.height || targetHeight));
      const stackLeft = Math.max(0, Math.floor((outputWidth - fittedStackWidth) / 2));
      const stackTop = Math.max(0, Math.floor((outputHeight - fittedStackHeight) / 2));

      outputBuffer = await sharp({
        create: {
          width: outputWidth,
          height: outputHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([{ input: resizedStack.data, left: stackLeft, top: stackTop }])
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();

      mergeDetails = {
        mode: "stack_overlay",
        productSources: productImages.map((image) => image.relativePath),
        stackCanvasWidth: outputWidth,
        stackCanvasHeight: outputHeight,
        leftStackZoneLeft: stackLeft,
        leftStackZoneWidth: fittedStackWidth,
        leftStackZoneHeight: fittedStackHeight,
        leftStackZoneTop: stackTop,
        leftStackSourceCropLeft: extractLeft,
        leftStackSourceCropTop: extractTop,
        leftStackSourceCropWidth: extractWidth,
        leftStackSourceCropHeight: extractHeight,
        leftStackPadding: STACK_OVERLAY_CANVAS_PADDING,
        leftStackCardCount: stack.placements.length,
        leftStackStepRightPx: stack.stepRightPx,
        leftStackStepUpPx: stack.stepUpPx,
        leftStackFirstTopPx: stack.firstTopPx,
        leftStackCardBoxWidth: stack.cardBoxWidth,
        leftStackCardBoxHeight: stack.cardBoxHeight,
        leftStackMaxCardWidth: stack.maxCardWidth,
        leftStackMaxCardHeight: stack.maxCardHeight,
        preferredTopImagePath,
        topImagePathApplied: stack.topImagePathApplied,
        cutoutCache: {
          dir: STACK_OVERLAY_CUTOUT_CACHE_DIR,
          hits: cutoutCacheHits,
          misses: cutoutCacheMisses,
          keys: cutoutCacheKeys,
        },
        productWhiteScores: productImages.map((image) => ({
          path: image.relativePath,
          score: image.whiteScore.score,
          whiteSides: image.whiteScore.whiteSides,
          borderDensity: image.whiteScore.borderDensity,
        })),
      };
    } else {
      const resolvedScenic = scenicImage;
      if (!resolvedScenic) {
        throw new Error("Unable to determine scenic image.");
      }

      const fadePercent = clampFadePercent(body.fadePercent);
      const rightPanelWidth = Math.max(
        1,
        Math.min(OUTPUT_WIDTH, Math.round(OUTPUT_WIDTH * RIGHT_SCENE_COVERAGE))
      );
      const rightPanelHeight = OUTPUT_HEIGHT;
      const sceneMetadata = await sharp(resolvedScenic.absolutePath).metadata();
      const sourceWidthRaw = Number(sceneMetadata.width || 0);
      const sourceHeightRaw = Number(sceneMetadata.height || 0);
      const orientation = Number(sceneMetadata.orientation || 1);
      const rotated90 = orientation >= 5 && orientation <= 8;
      const sourceWidth = rotated90 ? sourceHeightRaw : sourceWidthRaw;
      const sourceHeight = rotated90 ? sourceWidthRaw : sourceHeightRaw;
      const fitScale =
        sourceWidth > 0 && sourceHeight > 0
          ? Math.min(rightPanelWidth / sourceWidth, rightPanelHeight / sourceHeight)
          : 1;
      const fittedSceneWidth = Math.max(
        1,
        Math.min(rightPanelWidth, Math.round(sourceWidth * fitScale))
      );
      const fittedSceneHeight = Math.max(
        1,
        Math.min(rightPanelHeight, Math.round(sourceHeight * fitScale))
      );
      const sceneContentLeft = Math.max(0, rightPanelWidth - fittedSceneWidth);
      const sceneContentTop = Math.max(0, Math.floor((rightPanelHeight - fittedSceneHeight) / 2));

      const rightSceneBuffer = await sharp(resolvedScenic.absolutePath)
        .rotate()
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

      const rightLeft = Math.max(0, OUTPUT_WIDTH - rightPanelWidth);
      const leftZoneTop = Math.max(0, Math.floor((OUTPUT_HEIGHT - STACK_ZONE_HEIGHT) / 2));

      outputBuffer = await sharp({
        create: {
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([
          { input: rightSceneFadedBuffer, left: rightLeft, top: 0 },
          { input: stack.zoneBuffer, left: STACK_ZONE_LEFT_MARGIN, top: leftZoneTop },
        ])
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();

      mergeDetails = {
        mode: "digideal_main_stack_overlay",
        scenicSource: resolvedScenic.relativePath,
        productSources: productImages.map((image) => image.relativePath),
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
        leftStackZoneLeft: STACK_ZONE_LEFT_MARGIN,
        leftStackZoneWidth: STACK_ZONE_WIDTH,
        leftStackZoneHeight: STACK_ZONE_HEIGHT,
        leftStackZoneTop: leftZoneTop,
        leftStackCardCount: stack.placements.length,
        leftStackStepRightPx: stack.stepRightPx,
        leftStackStepUpPx: stack.stepUpPx,
        leftStackFirstTopPx: stack.firstTopPx,
        leftStackCardBoxWidth: stack.cardBoxWidth,
        leftStackCardBoxHeight: stack.cardBoxHeight,
        leftStackMaxCardWidth: stack.maxCardWidth,
        leftStackMaxCardHeight: stack.maxCardHeight,
        preferredTopImagePath,
        topImagePathApplied: stack.topImagePathApplied,
        cutoutCache: {
          dir: STACK_OVERLAY_CUTOUT_CACHE_DIR,
          hits: cutoutCacheHits,
          misses: cutoutCacheMisses,
          keys: cutoutCacheKeys,
        },
        scenicWhiteScore: resolvedScenic.whiteScore.score,
        productWhiteScores: productImages.map((image) => ({
          path: image.relativePath,
          score: image.whiteScore.score,
          whiteSides: image.whiteScore.whiteSides,
          borderDensity: image.whiteScore.borderDensity,
        })),
      };
    }

    const targetParts = toRelativePath(targetAbsolutePath)
      .split("/")
      .filter(Boolean);
    const spu = String(targetParts[1] || targetParts[0] || "SPU").trim();
    const fileBaseName = `${toSafeBaseName(spu)}-${outputBaseNameSuffix}-${buildTimestampToken()}`;
    const outputFileName = ensureUniqueName(targetAbsolutePath, fileBaseName, "jpg");
    const outputAbsolutePath = path.join(targetAbsolutePath, outputFileName);
    fs.writeFileSync(outputAbsolutePath, outputBuffer);
    if (standaloneStackOverlay) {
      await runAutoCenterWhiteInPlace(outputAbsolutePath);
    }
    const outputStat = fs.statSync(outputAbsolutePath);
    const outputMeta = await sharp(outputAbsolutePath).metadata();
    const finalWidth = Number(outputMeta.width || outputWidth);
    const finalHeight = Number(outputMeta.height || outputHeight);

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
        width: finalWidth,
        height: finalHeight,
      },
      merge: mergeDetails,
      truncatedCount,
    });
  } finally {
    for (const tempPath of tempInputPaths) {
      try {
        if (tempPath && fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {}
    }
    for (const tempPath of cutoutTempPaths) {
      try {
        if (tempPath && fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {}
    }
  }
}
