import fs from "fs";
import path from "path";
import {
  applyDraftImageOrder,
  readDraftImageOrderSync,
} from "@/lib/draft-image-order";

export const DRAFT_ROOT = "/srv/resources/media/images/draft_products";

export type DraftEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
  pixelQualityScore?: number | null;
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
  byRelativePath: Map<string, number>;
  byBaseName: Map<string, number>;
};

const IMAGE_SCORE_FILE_CANDIDATES = [
  "Files (F)/image_scores.json",
  "files/image_scores.json",
  "Files (F)/image_engine_v2/image_scores.json",
  "files/image_engine_v2/image_scores.json",
  "Files (F)/image-engine-v2/image_scores.json",
  "files/image-engine-v2/image_scores.json",
];

const imageQualityCache = new Map<
  string,
  { mtimeMs: number; index: ImageQualityIndex }
>();

const normalizePathToken = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();

const toScore = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
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

const computeCombinedPixelScore = (row: Record<string, unknown>) => {
  const baseScore = toScore(row.pixel_quality_score);
  const blurScore =
    toScore(readNestedNumber(row, "pixel_quality_external", "external_blur_score_mapped")) ??
    (() => {
      const liveGrad = readNestedNumber(row, "pixel_quality_raw", "live_grad_mean");
      if (liveGrad === null) return null;
      return Math.round(20 + scale(liveGrad, 6, 36) * 75);
    })();

  const upscaleSignal = readNestedNumber(
    row,
    "pixel_quality_raw",
    "downscale_upscale_mad"
  );
  const upscaleScore =
    upscaleSignal === null
      ? null
      : Math.round(20 + scale(upscaleSignal, 2.5, 11.5) * 75);

  const blockinessRatio = readNestedNumber(row, "pixel_quality_raw", "blockiness_ratio");
  const artifactScore =
    blockinessRatio === null
      ? null
      : (() => {
          const distanceFromNeutral = Math.abs(blockinessRatio - 1);
          const penalty = scale(distanceFromNeutral, 0.05, 0.8) * 55;
          return Math.round(clamp(100 - penalty, 35, 100));
        })();

  const liveGrad = readNestedNumber(row, "pixel_quality_raw", "live_grad_mean");
  const infoDensityScore =
    liveGrad === null ? null : Math.round(15 + scale(liveGrad, 6, 36) * 85);

  const liveRatio =
    asNumber(row.live_pixel_ratio) ??
    readNestedNumber(row, "pixel_quality_raw", "live_tile_ratio");
  const livePixelScore =
    liveRatio === null
      ? null
      : Math.round(55 + scale(liveRatio, 0.04, 0.28) * 45);

  let weightedSum = 0;
  let totalWeight = 0;
  const push = (score: number | null, weight: number) => {
    if (score === null) return;
    weightedSum += score * weight;
    totalWeight += weight;
  };

  push(blurScore, 0.34);
  push(upscaleScore, 0.23);
  push(artifactScore, 0.18);
  push(infoDensityScore, 0.10);
  push(baseScore, 0.13);
  push(livePixelScore, 0.02); // intentionally tiny weight so white-bg listings are not punished

  if (totalWeight <= 0) return baseScore;

  let combined = Math.round(weightedSum / totalWeight);
  if (row.pixel_quality_reliable === false) {
    combined = Math.round(combined * 0.92);
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

  const byRelativePath = new Map<string, number>();
  const byBaseName = new Map<string, number>();

  try {
    const raw = fs.readFileSync(scoreFile, "utf8");
    const parsed = JSON.parse(raw) as { images?: unknown };
    const images = Array.isArray(parsed?.images) ? parsed.images : [];

    for (const item of images) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const score = computeCombinedPixelScore(row);
      if (score === null) continue;

      const rawCandidates = [
        row.file_path,
        row.image_id,
        row.normalized_path,
      ].filter((value) => typeof value === "string") as string[];

      for (const candidate of rawCandidates) {
        const normalized = normalizePathToken(candidate);
        if (!normalized) continue;
        if (!byRelativePath.has(normalized)) {
          byRelativePath.set(normalized, score);
        }
        const baseName = normalizePathToken(path.posix.basename(normalized));
        if (baseName && !byBaseName.has(baseName)) {
          byBaseName.set(baseName, score);
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
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const mapped = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const full = path.join(absolute, entry.name);
      const stat = fs.statSync(full);
      const isDir = entry.isDirectory();
      let pixelQualityScore: number | null = null;
      if (!isDir && qualityIndex) {
        const relativeToProductRoot = normalizePathToken(
          path.relative(qualityIndex.productRoot, full)
        );
        const baseName = normalizePathToken(path.basename(full));
        const resolvedScore =
          qualityIndex.byRelativePath.get(relativeToProductRoot) ??
          qualityIndex.byRelativePath.get(baseName) ??
          qualityIndex.byBaseName.get(baseName) ??
          null;
        pixelQualityScore = resolvedScore;
      }
      return {
        name: entry.name,
        path: toRelativePath(full),
        type: isDir ? ("dir" as const) : ("file" as const),
        size: isDir ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...(isDir ? {} : { pixelQualityScore }),
      };
    });

  const dirs = mapped
    .filter((entry) => entry.type === "dir")
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = mapped.filter((entry) => entry.type === "file");

  const imageOrder = readDraftImageOrderSync(absolute);
  const orderedImageNames = applyDraftImageOrder(
    files.filter((entry) => isImageFileName(entry.name)).map((entry) => entry.name),
    imageOrder
  );
  const imageOrderIndex = new Map<string, number>();
  orderedImageNames.forEach((name, index) => {
    imageOrderIndex.set(name.toLowerCase(), index);
  });

  const sortedFiles = files.sort((left, right) => {
    const leftIsImage = isImageFileName(left.name);
    const rightIsImage = isImageFileName(right.name);
    if (leftIsImage && rightIsImage) {
      const leftIndex = imageOrderIndex.get(left.name.toLowerCase());
      const rightIndex = imageOrderIndex.get(right.name.toLowerCase());
      if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      if (leftIndex !== undefined && rightIndex === undefined) return -1;
      if (leftIndex === undefined && rightIndex !== undefined) return 1;
    }
    return left.name.localeCompare(right.name);
  });

  return [...dirs, ...sortedFiles];
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
