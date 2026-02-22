import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

const IMAGE_SCORE_FILE_CANDIDATES = [
  "Files (F)/image_scores.json",
  "files/image_scores.json",
  "Files (F)/image_engine_v2/image_scores.json",
  "files/image_engine_v2/image_scores.json",
  "Files (F)/image-engine-v2/image_scores.json",
  "files/image-engine-v2/image_scores.json",
];

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

const PROCESSOR_PACKAGE_JSON_PATH = "/srv/node-tools/product-processor/package.json";

type ScoreRefreshResult = {
  pixelQualityScore: number | null;
  scoreFile: string;
  updated: boolean;
};

type ScoreContext = {
  productRoot: string;
  scoreFile: string;
};

type ProcessorDeps = {
  sharp: any;
  computePixelQuality: (imagePath: string) => Promise<Record<string, unknown>>;
  computeExternalBlurScoresBatch?: (
    items: Array<{ id: string; path: string }>,
    options?: Record<string, unknown>
  ) =>
    | {
        byId?: Map<
          string,
          {
            external_blur_score?: number | null;
            external_blur_score_mapped?: number | null;
          }
        >;
        error?: string;
      }
    | null
    | undefined;
};

let processorDeps: ProcessorDeps | null = null;
let scoreRefreshQueueTail: Promise<void> = Promise.resolve();

const normalizePathToken = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const asFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toScore = (value: unknown) => {
  const numeric = asFiniteNumber(value);
  if (numeric === null) return null;
  return Math.round(clamp(numeric, 0, 100));
};

const resolutionScore = (width: number | null, height: number | null) => {
  if (!width || !height) return null;
  return Math.max(0, Math.min(100, Math.round((Math.min(width, height) / 1200) * 100)));
};

const isImageAbsolutePath = (absolutePath: string) =>
  IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase());

const getProcessorDeps = (): ProcessorDeps => {
  if (processorDeps) return processorDeps;
  const requireFromProcessor = createRequire(PROCESSOR_PACKAGE_JSON_PATH);
  const sharp = requireFromProcessor("sharp");
  const pixelQualityModule = requireFromProcessor(
    "./src/image-engine/pixelQuality"
  ) as Record<string, unknown>;

  const computePixelQuality = pixelQualityModule.computePixelQuality as
    | ((imagePath: string) => Promise<Record<string, unknown>>)
    | undefined;

  if (typeof computePixelQuality !== "function") {
    throw new Error("Unable to load computePixelQuality() from product processor.");
  }

  const computeExternalBlurScoresBatch = pixelQualityModule.computeExternalBlurScoresBatch as
    | ProcessorDeps["computeExternalBlurScoresBatch"]
    | undefined;

  processorDeps = {
    sharp,
    computePixelQuality,
    computeExternalBlurScoresBatch,
  };
  return processorDeps;
};

const withScoreRefreshQueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = scoreRefreshQueueTail.then(task, task);
  scoreRefreshQueueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

const findScoreContextForImage = (absoluteImagePath: string): ScoreContext => {
  let cursor = path.dirname(absoluteImagePath);
  while (cursor === DRAFT_ROOT || cursor.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    for (const candidate of IMAGE_SCORE_FILE_CANDIDATES) {
      const scoreFile = path.join(cursor, candidate);
      if (!fs.existsSync(scoreFile)) continue;
      const stat = fs.statSync(scoreFile);
      if (!stat.isFile()) continue;
      return { productRoot: cursor, scoreFile };
    }
    if (cursor === DRAFT_ROOT) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  const relative = path.relative(DRAFT_ROOT, absoluteImagePath);
  const parts = relative.split(path.sep).filter(Boolean);
  const defaultProductRoot =
    parts.length >= 2 ? path.join(DRAFT_ROOT, parts[0], parts[1]) : path.dirname(absoluteImagePath);

  return {
    productRoot: defaultProductRoot,
    scoreFile: path.join(defaultProductRoot, "Files (F)", "image_scores.json"),
  };
};

const readScorePayload = (scoreFile: string) => {
  if (!fs.existsSync(scoreFile)) {
    return { payload: {} as Record<string, unknown>, images: [] as Record<string, unknown>[] };
  }
  try {
    const raw = fs.readFileSync(scoreFile, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const images = Array.isArray(parsed.images)
      ? (parsed.images as Record<string, unknown>[])
      : [];
    return { payload: parsed, images };
  } catch {
    return { payload: {} as Record<string, unknown>, images: [] as Record<string, unknown>[] };
  }
};

const writeScorePayloadAtomic = (scoreFile: string, payload: Record<string, unknown>) => {
  fs.mkdirSync(path.dirname(scoreFile), { recursive: true });
  const tmp = `${scoreFile}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(tmp, json, "utf8");
  try {
    fs.renameSync(tmp, scoreFile);
  } catch {
    fs.copyFileSync(tmp, scoreFile);
    fs.unlinkSync(tmp);
  }
};

const pixelIsWhite = (r: number, g: number, b: number, a: number | null) => {
  if (typeof a === "number" && a < 16) return true;
  return r >= 245 && g >= 245 && b >= 245;
};

const measureWhiteBorder = async (sharp: any, imagePath: string) => {
  try {
    const meta = await sharp(imagePath).metadata();
    const width = Number(meta?.width || 0);
    const height = Number(meta?.height || 0);
    if (!width || !height) return null;

    const image = sharp(imagePath).rotate().ensureAlpha();
    const channels = 4;

    const ratioFor = async (extract: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) => {
      const buf = (await image.clone().extract(extract).raw().toBuffer()) as Buffer;
      const pixels = Math.floor(buf.length / channels);
      if (!pixels) return 0;
      let white = 0;
      for (let i = 0; i < buf.length; i += channels) {
        const r = buf[i];
        const g = buf[i + 1];
        const b = buf[i + 2];
        const a = buf[i + 3];
        if (pixelIsWhite(r, g, b, a)) {
          white += 1;
        }
      }
      return white / pixels;
    };

    const top = await ratioFor({ left: 0, top: 0, width, height: 1 });
    const bottom = await ratioFor({
      left: 0,
      top: Math.max(0, height - 1),
      width,
      height: 1,
    });
    const left = await ratioFor({ left: 0, top: 0, width: 1, height });
    const right = await ratioFor({
      left: Math.max(0, width - 1),
      top: 0,
      width: 1,
      height,
    });

    const borderRatios = { top, bottom, left, right };
    const whiteSides = Object.values(borderRatios).filter((value) => value >= 0.97).length;

    return {
      has_white_border: whiteSides >= 2,
      white_sides: whiteSides,
      border_size_ratio: 0,
      border_ratios: borderRatios,
    };
  } catch {
    return null;
  }
};

const findScoreRowIndex = (
  images: Array<Record<string, unknown>>,
  normalizedRelativePath: string,
  normalizedBaseName: string
) => {
  const byPath = images.findIndex((row) => {
    const filePath = normalizePathToken(String(row.file_path || ""));
    const normalizedPath = normalizePathToken(String(row.normalized_path || ""));
    return filePath === normalizedRelativePath || normalizedPath === normalizedRelativePath;
  });
  if (byPath >= 0) return byPath;

  const byImageId = images.findIndex(
    (row) => normalizePathToken(String(row.image_id || "")) === normalizedBaseName
  );
  if (byImageId >= 0) return byImageId;

  return images.findIndex((row) => {
    const fileBase = normalizePathToken(path.basename(String(row.file_path || "")));
    const normalizedBase = normalizePathToken(path.basename(String(row.normalized_path || "")));
    return fileBase === normalizedBaseName || normalizedBase === normalizedBaseName;
  });
};

const resolveFinalPixelQuality = (
  base: Record<string, unknown>,
  internal: Record<string, unknown>,
  externalMapped: number | null
) => {
  const methodPref = String(process.env.PIXEL_QUALITY_METHOD || "")
    .trim()
    .toLowerCase();
  const internalScore = toScore(internal.pixel_quality_score);
  const baseScore = toScore(base.pixel_quality_score);
  const externalScore = toScore(externalMapped);

  if ((methodPref === "external" || methodPref === "external_script") && externalScore !== null) {
    return { score: externalScore, method: "external_script" };
  }

  if (
    (methodPref === "combined" || methodPref === "external+internal") &&
    externalScore !== null
  ) {
    const merged = Math.round(externalScore * 0.6 + Number(internalScore || 0) * 0.4);
    return { score: clamp(merged, 0, 100), method: "external_script+internal" };
  }

  return {
    score: internalScore ?? baseScore ?? null,
    method: String(internal.pixel_quality_method || base.pixel_quality_method || "internal_fallback"),
  };
};

export const refreshDraftImageScoreByAbsolutePath = async (
  absoluteImagePath: string
): Promise<ScoreRefreshResult> =>
  withScoreRefreshQueue(async () => {
    const absolute = path.resolve(absoluteImagePath);
    if (!absolute.startsWith(`${DRAFT_ROOT}${path.sep}`) && absolute !== DRAFT_ROOT) {
      throw new Error("Image path is outside draft root.");
    }
    if (!isImageAbsolutePath(absolute)) {
      return { pixelQualityScore: null, scoreFile: "", updated: false };
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error("Image file not found.");
    }

    const { sharp, computePixelQuality, computeExternalBlurScoresBatch } = getProcessorDeps();
    const context = findScoreContextForImage(absolute);
    const relativePath = normalizePathToken(path.relative(context.productRoot, absolute));
    const relativePathDisplay = path.relative(context.productRoot, absolute).replace(/\\/g, "/");
    const baseName = path.basename(absolute);
    const normalizedBaseName = normalizePathToken(baseName);

    const { payload, images } = readScorePayload(context.scoreFile);
    const index = findScoreRowIndex(images, relativePath, normalizedBaseName);
    const baseRow = index >= 0 ? { ...images[index] } : {};

    const stat = fs.statSync(absolute);
    const meta = await sharp(absolute).metadata();
    const width = asFiniteNumber(meta?.width);
    const height = asFiniteNumber(meta?.height);
    const aspectRatio =
      width && height && height > 0 ? Number((width / height).toFixed(6)) : null;
    const sizeKb = Math.round(stat.size / 1024);

    const border = await measureWhiteBorder(sharp, absolute);
    const backgroundType =
      border && typeof border.white_sides === "number"
        ? border.white_sides >= 3
          ? "white"
          : border.white_sides === 2
            ? "mixed"
            : "scene"
        : String(baseRow.background_type || "").trim() || null;

    const internal = await computePixelQuality(absolute);
    let externalMapped: number | null = null;
    let externalPayload: Record<string, unknown> | null = null;
    if (typeof computeExternalBlurScoresBatch === "function") {
      try {
        const external = computeExternalBlurScoresBatch([{ id: baseName, path: absolute }]);
        const byId = external?.byId;
        const entry =
          byId && typeof (byId as Map<string, unknown>).get === "function"
            ? (byId as Map<string, Record<string, unknown>>).get(baseName)
            : null;
        externalMapped = toScore(entry?.external_blur_score_mapped);
        externalPayload = entry || (external?.error ? { error: external.error } : null);
      } catch (err) {
        externalPayload = {
          error: err instanceof Error ? err.message : "external-quality-failed",
        };
      }
    }

    const finalScore = resolveFinalPixelQuality(baseRow, internal, externalMapped);
    const livePixelRatio =
      asFiniteNumber(internal.live_pixel_ratio) ??
      asFiniteNumber(baseRow.live_pixel_ratio) ??
      null;
    const reliable =
      typeof internal.pixel_quality_reliable === "boolean"
        ? internal.pixel_quality_reliable
        : typeof baseRow.pixel_quality_reliable === "boolean"
          ? baseRow.pixel_quality_reliable
          : null;

    const nextRow: Record<string, unknown> = {
      ...baseRow,
      image_id: baseName,
      file_path: relativePathDisplay,
      normalized_path: relativePathDisplay,
      normalized_width: width,
      normalized_height: height,
      normalized_filesize_kb: sizeKb,
      file_size_kb: sizeKb,
      width,
      height,
      aspect_ratio: aspectRatio,
      resolution_score: resolutionScore(width, height),
      background_type: backgroundType,
      border_detection: border ?? baseRow.border_detection ?? null,
      sharpness_score:
        asFiniteNumber((internal.pixel_quality_raw as Record<string, unknown> | null)?.live_grad_mean) ??
        asFiniteNumber(baseRow.sharpness_score),
      pixel_quality_raw: internal.pixel_quality_raw ?? baseRow.pixel_quality_raw ?? null,
      pixel_quality_score: finalScore.score,
      pixel_quality_method: finalScore.method,
      pixel_quality_reliable: reliable,
      live_pixel_ratio: livePixelRatio,
      pixel_quality_external:
        externalPayload ?? (baseRow.pixel_quality_external as Record<string, unknown> | null) ?? null,
      updated_at: new Date().toISOString(),
    };

    if (index >= 0) {
      images[index] = nextRow;
    } else {
      images.push(nextRow);
    }

    const nextPayload: Record<string, unknown> = {
      ...payload,
      images,
    };
    writeScorePayloadAtomic(context.scoreFile, nextPayload);

    return {
      pixelQualityScore: toScore(nextRow.pixel_quality_score),
      scoreFile: context.scoreFile,
      updated: true,
    };
  });

export const refreshDraftImageScore = async (relativePath: string) => {
  const absolute = resolveDraftPath(relativePath);
  if (!absolute) {
    throw new Error("Invalid draft image path.");
  }
  return refreshDraftImageScoreByAbsolutePath(absolute);
};

export const refreshDraftImageScores = async (relativePaths: string[]) => {
  const results: ScoreRefreshResult[] = [];
  for (const relativePath of relativePaths) {
    try {
      const result = await refreshDraftImageScore(relativePath);
      results.push(result);
    } catch {
      // Best effort at batch level.
    }
  }
  return results;
};
