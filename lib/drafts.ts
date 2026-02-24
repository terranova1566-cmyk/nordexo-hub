import fs from "fs";
import path from "path";
import {
  applyDraftImageOrder,
  readDraftImageOrderSync,
} from "@/lib/draft-image-order";
import { isDraftImageUpscaled } from "@/lib/draft-image-upscale";

export const DRAFT_ROOT = "/srv/resources/media/images/draft_products";

export type DraftEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
  pixelQualityScore?: number | null;
  zimageUpscaled?: boolean;
  whiteSides?: number | null;
  borderWhiteDensity?: number | null;
  hasNonChineseText?: boolean | null;
  densityProxyKb?: number | null;
};

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

const isImageFileName = (name: string) =>
  IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

const normalizeRelative = (value: string) => {
  const trimmed = value.replace(/^\/+/, "");
  return trimmed.replace(/\.\.+/g, "");
};

type ImageQualityIndex = {
  productRoot: string;
  byRelativePath: Map<string, ImageQualityEntry>;
  byBaseName: Map<string, ImageQualityEntry>;
};

const IMAGE_SCORE_FILE_CANDIDATES = [
  "Files (F)/image_scores.json",
  "files/image_scores.json",
  "Files (F)/image_engine_v2/image_scores.json",
  "files/image_engine_v2/image_scores.json",
  "Files (F)/image-engine-v2/image_scores.json",
  "files/image-engine-v2/image_scores.json",
];

const OCR_TEXT_FILE_CANDIDATES = [
  "Files (F)/ocr_readable_text.json",
  "files/ocr_readable_text.json",
];
const STAGE1_ANALYTICS_DIR_CANDIDATES = [
  "Files (F)/vision/contact-sheets",
  "files/vision/contact-sheets",
  "contact-sheets",
];

type OcrTextEntry = {
  text: string;
  hasNonChineseText: boolean;
};

type OcrTextIndex = {
  productRoot: string;
  byBaseName: Map<string, OcrTextEntry>;
};

type Stage1AnalyticsEntry = {
  technicalQualityScore: number | null;
  hasTextOverlay: boolean | null;
};

type Stage1AnalyticsIndex = {
  productRoot: string;
  byBaseName: Map<string, Stage1AnalyticsEntry>;
};

type ImageQualityEntry = {
  pixelQualityScore: number;
  whiteSides: number | null;
  borderWhiteDensity: number | null;
  hasNonChineseText: boolean | null;
  densityProxyKb: number | null;
};

const imageQualityCache = new Map<
  string,
  { mtimeMs: number; index: ImageQualityIndex }
>();
const ocrTextCache = new Map<string, { mtimeMs: number; index: OcrTextIndex }>();
const stage1AnalyticsCache = new Map<
  string,
  { mtimeMs: number; index: Stage1AnalyticsIndex }
>();

const normalizePathToken = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();

const TAG_SUFFIX_PAREN_REGEX = /\s*\((?:MAIN|ENV|INF|ENF|VAR|DIGI)\)\s*$/i;
const TAG_SUFFIX_TOKEN_REGEX = /(?:[-_ ]+)(?:MAIN|ENV|INF|ENF|VAR|DIGI)\s*$/i;
const TAG_TOKEN_REGEX = (tag: string) =>
  new RegExp(
    `(?:\\(\\s*${tag}\\s*\\)|(?:^|[-_ ])${tag}(?=$|[-_ .)]))`,
    "i"
  );

const stripImageTagSuffixes = (fileName: string) => {
  const raw = String(fileName || "");
  if (!raw) return raw;
  const ext = path.extname(raw);
  const base = ext ? raw.slice(0, -ext.length) : raw;
  let cleanedBase = base.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const noParen = cleanedBase.replace(TAG_SUFFIX_PAREN_REGEX, "").trim();
    if (noParen !== cleanedBase) {
      cleanedBase = noParen;
      changed = true;
      continue;
    }
    const noToken = cleanedBase.replace(TAG_SUFFIX_TOKEN_REGEX, "").trim();
    if (noToken !== cleanedBase) {
      cleanedBase = noToken;
      changed = true;
    }
  }
  return `${cleanedBase || base}${ext}`;
};

const normalizeLookupPathVariants = (value: string) => {
  const normalized = normalizePathToken(value);
  if (!normalized) return { normalized: "", stripped: "" };
  const dirName = path.posix.dirname(normalized);
  const baseName = path.posix.basename(normalized);
  const strippedBaseName = normalizePathToken(stripImageTagSuffixes(baseName));
  const stripped =
    strippedBaseName && strippedBaseName !== baseName
      ? (dirName && dirName !== "." ? `${dirName}/${strippedBaseName}` : strippedBaseName)
      : normalized;
  return { normalized, stripped };
};

const toScore = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
};

const hasLatinText = (value: string) => /[A-Za-z]/.test(String(value || ""));

const resolveWhiteSides = (row: Record<string, unknown>) => {
  const border = row.border_detection;
  if (!border || typeof border !== "object") return null;
  const borderRow = border as Record<string, unknown>;
  const direct = asNumber(borderRow.white_sides);
  if (direct !== null) return Math.round(clamp(direct, 0, 4));

  const ratiosRaw = borderRow.border_ratios;
  if (!ratiosRaw || typeof ratiosRaw !== "object") return null;
  const ratios = ratiosRaw as Record<string, unknown>;
  const values = ["top", "bottom", "left", "right"]
    .map((key) => asNumber(ratios[key]))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.filter((value) => value >= 0.92).length;
};

const resolveBorderWhiteDensity = (row: Record<string, unknown>) => {
  const border = row.border_detection;
  if (!border || typeof border !== "object") return null;
  const borderRow = border as Record<string, unknown>;
  const ratiosRaw = borderRow.border_ratios;
  if (ratiosRaw && typeof ratiosRaw === "object") {
    const ratios = ratiosRaw as Record<string, unknown>;
    const values = ["top", "bottom", "left", "right"]
      .map((key) => asNumber(ratios[key]))
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return clamp(avg, 0, 1);
    }
  }
  const fallback = asNumber(borderRow.border_size_ratio);
  if (fallback !== null) return clamp(fallback, 0, 1);
  return null;
};

const resolveNonChineseTextFlag = (row: Record<string, unknown>) => {
  const ocrPresent = toBoolean(row.ocr_text_present);
  const ocrLanguage = String(row.ocr_text_language || "").trim().toLowerCase();
  const imageType = String(row.image_type || "").trim().toLowerCase();

  if (ocrPresent) {
    const englishLanguageHint =
      ocrLanguage.includes("english") ||
      ocrLanguage.includes("latin") ||
      /(?:^|[,;|\s])en(?:$|[,;|\s])/.test(ocrLanguage);
    const chineseLanguageHint =
      ocrLanguage.includes("chinese") ||
      /(?:^|[,;|\s])zh(?:$|[,;|\s])/.test(ocrLanguage);
    if (englishLanguageHint) return true;
    if (!chineseLanguageHint) return true;
  }

  if (
    imageType.includes("infographic") ||
    imageType.includes("dimension") ||
    imageType.includes("diagram")
  ) {
    return true;
  }

  return null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const asNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const scale = (value: number, min: number, max: number) => {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
};

const readNestedNumber = (
  row: Record<string, unknown>,
  key: string,
  nestedKey: string
) => {
  const nested = row[key];
  if (!nested || typeof nested !== "object") return null;
  return asNumber((nested as Record<string, unknown>)[nestedKey]);
};

const readBorderRatios = (row: Record<string, unknown>) => {
  const borderDetection = row.border_detection;
  if (!borderDetection || typeof borderDetection !== "object") return null;
  const borderRatios = (borderDetection as Record<string, unknown>).border_ratios;
  if (!borderRatios || typeof borderRatios !== "object") return null;
  const top = asNumber((borderRatios as Record<string, unknown>).top);
  const bottom = asNumber((borderRatios as Record<string, unknown>).bottom);
  const left = asNumber((borderRatios as Record<string, unknown>).left);
  const right = asNumber((borderRatios as Record<string, unknown>).right);
  if (
    top === null ||
    bottom === null ||
    left === null ||
    right === null
  ) {
    return null;
  }
  return { top, bottom, left, right };
};

const scoreFromBlockinessArtifacts = (row: Record<string, unknown>) => {
  const ratio = readNestedNumber(row, "pixel_quality_raw", "blockiness_ratio");
  if (ratio === null) return null;
  const excess = Math.max(0, ratio - 1);
  const compressionPenalty = scale(excess, 0.02, 0.42) * 90;
  const smallBonus =
    ratio < 1 ? scale(1 - ratio, 0.01, 0.2) * 8 : 0;
  return Math.round(clamp(100 - compressionPenalty + smallBonus, 10, 100));
};

const scoreFromUpscaleIntegrity = (row: Record<string, unknown>) => {
  const mad = readNestedNumber(row, "pixel_quality_raw", "downscale_upscale_mad");
  if (mad === null) return null;
  const density = readImageByteDensity(row);
  const ratio = readNestedNumber(row, "pixel_quality_raw", "blockiness_ratio");

  // Smooth/low-detail products are valid; penalize low MAD only when paired with
  // compression/blockiness signals that suggest true quality breakdown.
  const weakDetail = scale(2.4 - mad, 0, 2.0);
  const blockinessSignal =
    ratio === null ? 0 : scale(Math.max(0, ratio - 1.02), 0, 0.35);
  const lowDensitySignal = density
    ? scale(
        (density.minSide >= 1000 ? 0.09 : 0.075) - density.bytesPerPixel,
        0,
        density.minSide >= 1000 ? 0.07 : 0.055
      )
    : 0;
  const penalty = weakDetail * (blockinessSignal * 0.55 + lowDensitySignal * 0.45) * 70;
  const gentleBonus = scale(mad, 2.4, 9.5) * 8;
  return Math.round(clamp(88 + gentleBonus - penalty, 25, 100));
};

const scoreFromEdgeStability = (row: Record<string, unknown>) => {
  const boundaryMean = readNestedNumber(
    row,
    "pixel_quality_raw",
    "blockiness_boundary_mean"
  );
  const baselineMean = readNestedNumber(
    row,
    "pixel_quality_raw",
    "blockiness_baseline_mean"
  );
  if (boundaryMean === null || baselineMean === null) return null;
  if (baselineMean <= 0) return null;
  const drift = Math.abs(boundaryMean - baselineMean) / Math.max(1, baselineMean);
  return Math.round(clamp(100 - scale(drift, 0.06, 0.75) * 70, 20, 100));
};

const readImageByteDensity = (row: Record<string, unknown>) => {
  const width =
    asNumber(row.normalized_width) ??
    asNumber(row.width);
  const height =
    asNumber(row.normalized_height) ??
    asNumber(row.height);
  const sizeKb =
    asNumber(row.normalized_filesize_kb) ??
    asNumber(row.file_size_kb);
  if (width === null || height === null || width <= 0 || height <= 0 || sizeKb === null) {
    return null as { bytesPerPixel: number; minSide: number } | null;
  }
  return {
    bytesPerPixel: (sizeKb * 1024) / (width * height),
    minSide: Math.min(width, height),
  };
};

const scoreFromCompressionDensity = (row: Record<string, unknown>) => {
  const density = readImageByteDensity(row);
  if (!density) return null;

  const { bytesPerPixel, minSide } = density;
  const floor = minSide >= 1000 ? 0.05 : 0.04;
  const healthy = minSide >= 1000 ? 0.22 : 0.18;
  let score = 58 + scale(bytesPerPixel, floor, healthy) * 42;

  // Very low byte density is only strongly penalized when artifact signals exist.
  const ratio = readNestedNumber(row, "pixel_quality_raw", "blockiness_ratio");
  const boundaryMean = readNestedNumber(
    row,
    "pixel_quality_raw",
    "blockiness_boundary_mean"
  );
  const baselineMean = readNestedNumber(
    row,
    "pixel_quality_raw",
    "blockiness_baseline_mean"
  );
  const blockinessSignal =
    ratio === null ? 0 : scale(Math.max(0, ratio - 1.02), 0, 0.35);
  const boundaryDrift =
    boundaryMean !== null && baselineMean !== null && baselineMean > 0
      ? scale(Math.abs(boundaryMean - baselineMean) / Math.max(1, baselineMean), 0.08, 0.65)
      : 0;
  const veryLowDensity = scale(
    (minSide >= 1000 ? 0.085 : 0.07) - bytesPerPixel,
    0,
    minSide >= 1000 ? 0.06 : 0.05
  );
  const artifactWeight = 0.25 + blockinessSignal * 0.55 + boundaryDrift * 0.2;
  score -= veryLowDensity * artifactWeight * 65;
  return Math.round(clamp(score, 12, 100));
};

const scoreFromBorderConsistency = (row: Record<string, unknown>) => {
  const backgroundType = String(row.background_type || "").toLowerCase();
  if (backgroundType !== "white" && backgroundType !== "mixed") return null;
  const ratios = readBorderRatios(row);
  if (!ratios) return null;
  const values = [ratios.top, ratios.bottom, ratios.left, ratios.right];
  const spread = Math.max(...values) - Math.min(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const uniformity = 1 - scale(spread, 0.04, 0.35);
  const whiteness = scale(mean, 0.55, 0.995);
  return Math.round(clamp(35 + uniformity * 45 + whiteness * 20, 0, 100));
};

const scoreFromResolution = (row: Record<string, unknown>) => {
  const existing = asNumber(row.resolution_score);
  if (existing !== null) return Math.round(clamp(existing, 0, 100));
  const width = asNumber(row.normalized_width) ?? asNumber(row.width);
  const height = asNumber(row.normalized_height) ?? asNumber(row.height);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return Math.round(clamp((Math.min(width, height) / 1200) * 100, 0, 100));
};

export const computeDisplayPixelQualityScore = (row: Record<string, unknown>) => {
  const baseScore = toScore(row.pixel_quality_score);
  const artifactScore = scoreFromBlockinessArtifacts(row);
  const upscaleScore = scoreFromUpscaleIntegrity(row);
  const edgeStabilityScore = scoreFromEdgeStability(row);
  const compressionDensityScore = scoreFromCompressionDensity(row);
  const borderConsistencyScore = scoreFromBorderConsistency(row);
  const resolutionScore = scoreFromResolution(row);

  let weightedSum = 0;
  let totalWeight = 0;
  const push = (score: number | null, weight: number) => {
    if (score === null) return;
    weightedSum += score * weight;
    totalWeight += weight;
  };

  // Blur/smoothness is intentionally not a primary quality signal.
  // We focus on compression artifacts, upscale breakdown, and edge integrity.
  push(artifactScore, 0.39);
  push(compressionDensityScore, 0.22);
  push(upscaleScore, 0.11);
  push(edgeStabilityScore, 0.15);
  push(resolutionScore, 0.08);
  push(baseScore, 0.04);
  push(borderConsistencyScore, 0.01);

  if (totalWeight <= 0) return baseScore;

  let combined = Math.round(weightedSum / totalWeight);
  if (row.pixel_quality_reliable === false) {
    combined = Math.round(combined * 0.94);
  }
  return clamp(combined, 0, 100);
};

const findImageScoreContext = (absolutePath: string) => {
  let cursor = absolutePath;
  while (
    cursor === DRAFT_ROOT ||
    cursor.startsWith(`${DRAFT_ROOT}${path.sep}`)
  ) {
    for (const candidate of IMAGE_SCORE_FILE_CANDIDATES) {
      const scoreFile = path.join(cursor, candidate);
      if (!fs.existsSync(scoreFile)) continue;
      const stat = fs.statSync(scoreFile);
      if (!stat.isFile()) continue;
      return { productRoot: cursor, scoreFile, mtimeMs: stat.mtimeMs };
    }
    if (cursor === DRAFT_ROOT) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null as { productRoot: string; scoreFile: string; mtimeMs: number } | null;
};

const loadImageQualityIndex = (
  scoreFile: string,
  productRoot: string,
  mtimeMs: number
) => {
  const cached = imageQualityCache.get(scoreFile);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.index;
  }

  const byRelativePath = new Map<string, ImageQualityEntry>();
  const byBaseName = new Map<string, ImageQualityEntry>();

  try {
    const raw = fs.readFileSync(scoreFile, "utf8");
    const parsed = JSON.parse(raw) as { images?: unknown };
    const images = Array.isArray(parsed?.images) ? parsed.images : [];

    for (const item of images) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const score = computeDisplayPixelQualityScore(row);
      if (score === null) continue;

      const entry: ImageQualityEntry = {
        pixelQualityScore: score,
        whiteSides: resolveWhiteSides(row),
        borderWhiteDensity: resolveBorderWhiteDensity(row),
        hasNonChineseText: resolveNonChineseTextFlag(row),
        densityProxyKb:
          asNumber(row.normalized_filesize_kb) ??
          asNumber(row.file_size_kb) ??
          null,
      };

      const rawCandidates = [
        row.file_path,
        row.image_id,
        row.normalized_path,
      ].filter((value) => typeof value === "string") as string[];

      for (const candidate of rawCandidates) {
        const normalized = normalizePathToken(candidate);
        if (!normalized) continue;
        if (!byRelativePath.has(normalized)) {
          byRelativePath.set(normalized, entry);
        }
        const baseName = normalizePathToken(path.posix.basename(normalized));
        if (baseName && !byBaseName.has(baseName)) {
          byBaseName.set(baseName, entry);
        }
        const strippedBaseName = normalizePathToken(stripImageTagSuffixes(baseName));
        if (strippedBaseName && !byBaseName.has(strippedBaseName)) {
          byBaseName.set(strippedBaseName, entry);
        }
      }
    }
  } catch {
    // Best effort only. Missing/unreadable score files should not block listing.
  }

  const index: ImageQualityIndex = {
    productRoot,
    byRelativePath,
    byBaseName,
  };
  imageQualityCache.set(scoreFile, { mtimeMs, index });
  return index;
};

const findOcrTextContext = (absolutePath: string) => {
  let cursor = absolutePath;
  while (
    cursor === DRAFT_ROOT ||
    cursor.startsWith(`${DRAFT_ROOT}${path.sep}`)
  ) {
    for (const candidate of OCR_TEXT_FILE_CANDIDATES) {
      const ocrFile = path.join(cursor, candidate);
      if (!fs.existsSync(ocrFile)) continue;
      const stat = fs.statSync(ocrFile);
      if (!stat.isFile()) continue;
      return { productRoot: cursor, ocrFile, mtimeMs: stat.mtimeMs };
    }
    if (cursor === DRAFT_ROOT) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null as { productRoot: string; ocrFile: string; mtimeMs: number } | null;
};

const parseOcrReadableText = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => Boolean(entry));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => `${String(key || "").trim()}: ${String(raw ?? "").trim()}`)
      .filter((entry) => Boolean(entry));
  }
  return [] as string[];
};

const loadOcrTextIndex = (ocrFile: string, productRoot: string, mtimeMs: number) => {
  const cached = ocrTextCache.get(ocrFile);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.index;
  }

  const byBaseName = new Map<string, OcrTextEntry>();

  try {
    const raw = fs.readFileSync(ocrFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const rows = parseOcrReadableText(parsed);

    rows.forEach((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const fileName = normalizePathToken(path.basename(match[1]));
      if (!fileName) return;
      const text = String(match[2] || "").trim();
      if (!text) return;
      const entry: OcrTextEntry = {
        text,
        hasNonChineseText: hasLatinText(text),
      };
      if (!byBaseName.has(fileName)) {
        byBaseName.set(fileName, entry);
      }
    });
  } catch {
    // Best effort only.
  }

  const index: OcrTextIndex = {
    productRoot,
    byBaseName,
  };
  ocrTextCache.set(ocrFile, { mtimeMs, index });
  return index;
};

const extractTagHints = (fileName: string) => {
  const source = String(fileName || "");
  return {
    isMain: TAG_TOKEN_REGEX("MAIN").test(source),
    isEnv: TAG_TOKEN_REGEX("ENV").test(source),
    isInf:
      TAG_TOKEN_REGEX("INF").test(source) || TAG_TOKEN_REGEX("ENF").test(source),
    isDigi: TAG_TOKEN_REGEX("DIGI").test(source),
    isVar: TAG_TOKEN_REGEX("VAR").test(source),
  };
};

const findStage1AnalyticsContext = (absolutePath: string) => {
  let cursor = absolutePath;
  while (
    cursor === DRAFT_ROOT ||
    cursor.startsWith(`${DRAFT_ROOT}${path.sep}`)
  ) {
    for (const dirCandidate of STAGE1_ANALYTICS_DIR_CANDIDATES) {
      const candidateDir = path.join(cursor, dirCandidate);
      if (!fs.existsSync(candidateDir) || !fs.statSync(candidateDir).isDirectory()) {
        continue;
      }
      const candidateFile = fs
        .readdirSync(candidateDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /-contacts-stage1-analytics\.json$/i.test(name))
        .map((name) => path.join(candidateDir, name))
        .sort((left, right) => {
          const leftM = fs.statSync(left).mtimeMs;
          const rightM = fs.statSync(right).mtimeMs;
          return rightM - leftM;
        })[0];
      if (!candidateFile) continue;
      const stat = fs.statSync(candidateFile);
      return {
        productRoot: cursor,
        analyticsFile: candidateFile,
        mtimeMs: stat.mtimeMs,
      };
    }
    if (cursor === DRAFT_ROOT) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null as {
    productRoot: string;
    analyticsFile: string;
    mtimeMs: number;
  } | null;
};

const loadStage1AnalyticsIndex = (
  analyticsFile: string,
  productRoot: string,
  mtimeMs: number
) => {
  const cached = stage1AnalyticsCache.get(analyticsFile);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.index;
  }

  const byBaseName = new Map<string, Stage1AnalyticsEntry>();
  try {
    const raw = fs.readFileSync(analyticsFile, "utf8");
    const parsed = JSON.parse(raw) as { images?: unknown };
    const images = Array.isArray(parsed?.images) ? parsed.images : [];

    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const row = image as Record<string, unknown>;
      const imageId = normalizePathToken(path.basename(String(row.image_id || "")));
      if (!imageId) continue;
      const imageType = String(row.image_type || "").trim().toLowerCase();
      const hasTextOverlayRaw = toBoolean(row.has_heavy_text_overlay);
      const hasTextOverlay =
        hasTextOverlayRaw ??
        (imageType.includes("infographic") ||
        imageType.includes("dimension") ||
        imageType.includes("diagram")
          ? true
          : null);
      const technicalQualityScore =
        toScore(row.technical_quality_score) ??
        toScore(row.webshop_suitability_score) ??
        null;
      if (!byBaseName.has(imageId)) {
        byBaseName.set(imageId, {
          technicalQualityScore,
          hasTextOverlay,
        });
      }
    }
  } catch {
    // Best effort only.
  }

  const index: Stage1AnalyticsIndex = {
    productRoot,
    byBaseName,
  };
  stage1AnalyticsCache.set(analyticsFile, { mtimeMs, index });
  return index;
};

type ImageSortSnapshot = {
  hasNonChineseText: boolean;
  whiteSides: number;
  borderWhiteDensity: number;
  densityProxyKb: number;
  pixelQualityScore: number;
};

const buildImageSortSnapshot = (entry: DraftEntry, options: {
  quality: ImageQualityEntry | null;
  ocrText: OcrTextEntry | null;
  stage1: Stage1AnalyticsEntry | null;
}) => {
  const tags = extractTagHints(entry.name);
  const quality = options.quality;
  const inferredText =
    quality?.hasNonChineseText === true ||
    options.ocrText?.hasNonChineseText === true ||
    options.stage1?.hasTextOverlay === true;
  const hasNonChineseText = inferredText || tags.isInf;
  const whiteSides = quality?.whiteSides ?? (tags.isMain ? 4 : 0);
  const borderWhiteDensity = quality?.borderWhiteDensity ?? (tags.isMain ? 1 : 0);
  const densityProxyKb = quality?.densityProxyKb ?? entry.size / 1024;
  const pixelQualityScore =
    quality?.pixelQualityScore ?? options.stage1?.technicalQualityScore ?? 0;
  return {
    hasNonChineseText,
    whiteSides,
    borderWhiteDensity,
    densityProxyKb,
    pixelQualityScore,
  } satisfies ImageSortSnapshot;
};

const compareImagesForSmartView = (
  left: DraftEntry,
  right: DraftEntry,
  leftMeta: ImageSortSnapshot,
  rightMeta: ImageSortSnapshot
) => {
  const leftTags = extractTagHints(left.name);
  const rightTags = extractTagHints(right.name);

  const isWhiteBackgroundPriority = (meta: ImageSortSnapshot) =>
    meta.whiteSides >= 4 || meta.borderWhiteDensity >= 0.97;

  const isWhiteBorderPriority = (meta: ImageSortSnapshot) => {
    const whiteBorderBySides = meta.whiteSides >= 2 && meta.whiteSides < 4;
    const whiteBorderByDensity =
      meta.borderWhiteDensity >= 0.88 && meta.borderWhiteDensity < 0.97;
    return whiteBorderBySides || whiteBorderByDensity;
  };

  const getPrimaryRank = (tags: ReturnType<typeof extractTagHints>, meta: ImageSortSnapshot) => {
    if (tags.isMain) return 0;
    const hasNonMainTag = tags.isEnv || tags.isInf || tags.isDigi || tags.isVar;
    // White-priority is only for untagged images after MAIN.
    if (!hasNonMainTag) {
      if (isWhiteBackgroundPriority(meta)) return 1;
      if (isWhiteBorderPriority(meta)) return 2;
      return 3;
    }
    // Tagged images come after all untagged buckets.
    return 4;
  };

  const getTagRank = (tags: ReturnType<typeof extractTagHints>) => {
    // Tagged section order:
    // INF/ENF -> ENV -> DIGI -> VAR
    if (tags.isInf) return 1;
    if (tags.isEnv) return 2;
    if (tags.isDigi) return 3;
    if (tags.isVar) return 4;
    return 0;
  };

  const leftPrimaryRank = getPrimaryRank(leftTags, leftMeta);
  const rightPrimaryRank = getPrimaryRank(rightTags, rightMeta);
  if (leftPrimaryRank !== rightPrimaryRank) {
    return leftPrimaryRank - rightPrimaryRank;
  }

  if (leftPrimaryRank === 4 && rightPrimaryRank === 4) {
    const leftTagRank = getTagRank(leftTags);
    const rightTagRank = getTagRank(rightTags);
    if (leftTagRank !== rightTagRank) {
      return leftTagRank - rightTagRank;
    }
  }

  if (leftMeta.hasNonChineseText !== rightMeta.hasNonChineseText) {
    return leftMeta.hasNonChineseText ? 1 : -1;
  }
  if (leftMeta.whiteSides !== rightMeta.whiteSides) {
    return rightMeta.whiteSides - leftMeta.whiteSides;
  }
  if (leftMeta.borderWhiteDensity !== rightMeta.borderWhiteDensity) {
    return rightMeta.borderWhiteDensity - leftMeta.borderWhiteDensity;
  }
  if (leftMeta.densityProxyKb !== rightMeta.densityProxyKb) {
    return leftMeta.densityProxyKb - rightMeta.densityProxyKb;
  }
  if (leftMeta.pixelQualityScore !== rightMeta.pixelQualityScore) {
    return rightMeta.pixelQualityScore - leftMeta.pixelQualityScore;
  }
  return left.name.localeCompare(right.name);
};

export const resolveDraftPath = (relativePath: string) => {
  const safeRel = normalizeRelative(relativePath);
  const target = path.resolve(DRAFT_ROOT, safeRel);
  if (!target.startsWith(`${DRAFT_ROOT}${path.sep}`) && target !== DRAFT_ROOT) {
    return null;
  }
  return target;
};

export const toRelativePath = (absolutePath: string) => {
  const rel = path.relative(DRAFT_ROOT, absolutePath);
  return rel.split(path.sep).join("/");
};

export const listFolders = (): DraftEntry[] => {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  const entries = fs.readdirSync(DRAFT_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(DRAFT_ROOT, entry.name);
      const stat = fs.statSync(full);
      return {
        name: entry.name,
        path: entry.name,
        type: "dir" as const,
        size: 0,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
};

export const listEntries = (relativePath: string): DraftEntry[] => {
  const absolute = resolveDraftPath(relativePath);
  if (!absolute) return [];
  if (!fs.existsSync(absolute)) return [];
  const qualityContext = findImageScoreContext(absolute);
  const qualityIndex = qualityContext
    ? loadImageQualityIndex(
        qualityContext.scoreFile,
        qualityContext.productRoot,
        qualityContext.mtimeMs
      )
    : null;
  const ocrContext = findOcrTextContext(absolute);
  const ocrIndex = ocrContext
    ? loadOcrTextIndex(ocrContext.ocrFile, ocrContext.productRoot, ocrContext.mtimeMs)
    : null;
  const stage1Context = findStage1AnalyticsContext(absolute);
  const stage1Index = stage1Context
    ? loadStage1AnalyticsIndex(
        stage1Context.analyticsFile,
        stage1Context.productRoot,
        stage1Context.mtimeMs
      )
    : null;
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const mapped = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const full = path.join(absolute, entry.name);
      const stat = fs.statSync(full);
      const isDir = entry.isDirectory();
      const isImageFile = !isDir && isImageFileName(entry.name);
      let pixelQualityScore: number | null = null;
      let zimageUpscaled = false;
      let whiteSides: number | null = null;
      let borderWhiteDensity: number | null = null;
      let hasNonChineseText: boolean | null = null;
      let densityProxyKb: number | null = null;
      const baseName = normalizePathToken(path.basename(full));
      const strippedBaseName = normalizePathToken(stripImageTagSuffixes(path.basename(full)));
      const tagHints = extractTagHints(entry.name);
      let resolvedQualityEntry: ImageQualityEntry | null = null;
      if (!isDir && qualityIndex) {
        const relativeToProductRootRaw = path.relative(qualityIndex.productRoot, full);
        const relativeLookup = normalizeLookupPathVariants(relativeToProductRootRaw);
        resolvedQualityEntry =
          qualityIndex.byRelativePath.get(relativeLookup.normalized) ??
          qualityIndex.byRelativePath.get(relativeLookup.stripped) ??
          qualityIndex.byRelativePath.get(baseName) ??
          qualityIndex.byRelativePath.get(strippedBaseName) ??
          qualityIndex.byBaseName.get(baseName) ??
          qualityIndex.byBaseName.get(strippedBaseName) ??
          null;
        pixelQualityScore = resolvedQualityEntry?.pixelQualityScore ?? null;
      }
      if (!isDir && isImageFile) {
        const stage1Entry =
          stage1Index?.byBaseName.get(baseName) ??
          stage1Index?.byBaseName.get(strippedBaseName) ??
          null;
        const ocrEntry =
          ocrIndex?.byBaseName.get(baseName) ??
          ocrIndex?.byBaseName.get(strippedBaseName) ??
          null;

        hasNonChineseText =
          resolvedQualityEntry?.hasNonChineseText === true ||
          ocrEntry?.hasNonChineseText === true ||
          stage1Entry?.hasTextOverlay === true ||
          tagHints.isInf;
        whiteSides = resolvedQualityEntry?.whiteSides ?? (tagHints.isMain ? 4 : 0);
        borderWhiteDensity =
          resolvedQualityEntry?.borderWhiteDensity ?? (tagHints.isMain ? 1 : 0);
        densityProxyKb = resolvedQualityEntry?.densityProxyKb ?? stat.size / 1024;

        if (pixelQualityScore === null) {
          pixelQualityScore = stage1Entry?.technicalQualityScore ?? null;
        }
      }
      if (!isDir && pixelQualityScore === null) {
        pixelQualityScore =
          stage1Index?.byBaseName.get(baseName)?.technicalQualityScore ??
          stage1Index?.byBaseName.get(strippedBaseName)?.technicalQualityScore ??
          null;
      }
      if (isImageFile) {
        zimageUpscaled = isDraftImageUpscaled(full);
      }
      return {
        name: entry.name,
        path: toRelativePath(full),
        type: isDir ? ("dir" as const) : ("file" as const),
        size: isDir ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...(isDir ? {} : { pixelQualityScore }),
        ...(!isDir && isImageFile
          ? {
              zimageUpscaled,
              whiteSides,
              borderWhiteDensity,
              hasNonChineseText,
              densityProxyKb,
            }
          : {}),
      };
    });

  const dirs = mapped
    .filter((entry) => entry.type === "dir")
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = mapped.filter((entry) => entry.type === "file");
  const imageFiles = files.filter((entry) => isImageFileName(entry.name));
  const nonImageFiles = files
    .filter((entry) => !isImageFileName(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const imageOrder = readDraftImageOrderSync(absolute);
  const hasExplicitManualOrder = imageOrder.length > 0;
  const sortedImages = (() => {
    if (hasExplicitManualOrder) {
      const orderedImageNames = applyDraftImageOrder(
        imageFiles.map((entry) => entry.name),
        imageOrder
      );
      const imageOrderIndex = new Map<string, number>();
      orderedImageNames.forEach((name, index) => {
        imageOrderIndex.set(name.toLowerCase(), index);
      });
      return [...imageFiles].sort((left, right) => {
        const leftIndex = imageOrderIndex.get(left.name.toLowerCase());
        const rightIndex = imageOrderIndex.get(right.name.toLowerCase());
        if (
          leftIndex !== undefined &&
          rightIndex !== undefined &&
          leftIndex !== rightIndex
        ) {
          return leftIndex - rightIndex;
        }
        if (leftIndex !== undefined && rightIndex === undefined) return -1;
        if (leftIndex === undefined && rightIndex !== undefined) return 1;
        return left.name.localeCompare(right.name);
      });
    }

    return [...imageFiles].sort((left, right) => {
      const leftBaseName = normalizePathToken(path.basename(left.name));
      const rightBaseName = normalizePathToken(path.basename(right.name));
      const leftStrippedBaseName = normalizePathToken(stripImageTagSuffixes(path.basename(left.name)));
      const rightStrippedBaseName = normalizePathToken(stripImageTagSuffixes(path.basename(right.name)));
      const leftPathLookup = normalizeLookupPathVariants(left.path);
      const rightPathLookup = normalizeLookupPathVariants(right.path);

      const leftQuality =
        qualityIndex?.byRelativePath.get(leftPathLookup.normalized) ??
        qualityIndex?.byRelativePath.get(leftPathLookup.stripped) ??
        qualityIndex?.byBaseName.get(leftBaseName) ??
        qualityIndex?.byBaseName.get(leftStrippedBaseName) ??
        null;
      const rightQuality =
        qualityIndex?.byRelativePath.get(rightPathLookup.normalized) ??
        qualityIndex?.byRelativePath.get(rightPathLookup.stripped) ??
        qualityIndex?.byBaseName.get(rightBaseName) ??
        qualityIndex?.byBaseName.get(rightStrippedBaseName) ??
        null;

      const leftOcr =
        ocrIndex?.byBaseName.get(leftBaseName) ??
        ocrIndex?.byBaseName.get(leftStrippedBaseName) ??
        null;
      const rightOcr =
        ocrIndex?.byBaseName.get(rightBaseName) ??
        ocrIndex?.byBaseName.get(rightStrippedBaseName) ??
        null;
      const leftStage1 =
        stage1Index?.byBaseName.get(leftBaseName) ??
        stage1Index?.byBaseName.get(leftStrippedBaseName) ??
        null;
      const rightStage1 =
        stage1Index?.byBaseName.get(rightBaseName) ??
        stage1Index?.byBaseName.get(rightStrippedBaseName) ??
        null;

      const leftMeta = buildImageSortSnapshot(left, {
        quality: leftQuality,
        ocrText: leftOcr,
        stage1: leftStage1,
      });
      const rightMeta = buildImageSortSnapshot(right, {
        quality: rightQuality,
        ocrText: rightOcr,
        stage1: rightStage1,
      });
      return compareImagesForSmartView(left, right, leftMeta, rightMeta);
    });
  })();

  return [...dirs, ...sortedImages, ...nonImageFiles];
};

export const safeRemoveDraftPath = (absolutePath: string) => {
  try {
    if (!fs.existsSync(absolutePath)) return;
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(absolutePath);
    }
  } catch {
    return;
  }
};

export const removeSpuFolders = (spus: string[]) => {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  const target = new Set(spus.map((value) => value.trim()).filter(Boolean));
  if (target.size === 0) return [];

  const removed: string[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (target.has(entry.name)) {
        safeRemoveDraftPath(full);
        removed.push(toRelativePath(full));
        continue;
      }
      walk(full);
    }
  };

  walk(DRAFT_ROOT);

  return removed;
};
