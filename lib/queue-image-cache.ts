import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";

const IMAGE_CACHE_DIR = path.join(EXTRACTOR_UPLOAD_DIR, "_image_cache");
const CACHE_VERSION = 1;

const ALLOWED_HOSTS = [
  "cbu01.alicdn.com",
  "img.alicdn.com",
  "gw.alicdn.com",
  "images.sello.io",
  "cdn.sello.io",
];

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const sanitizeDimension = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 16 || rounded > 2048) return null;
  return rounded;
};

const ensureDir = () => {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
};

const isAllowedHost = (host: string) =>
  ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );

const getCacheFilePath = (sourceUrl: string, width: number | null, height: number | null) => {
  const digest = crypto
    .createHash("sha1")
    .update(`${CACHE_VERSION}|${sourceUrl}|w:${width ?? 0}|h:${height ?? 0}`)
    .digest("hex");
  return path.join(IMAGE_CACHE_DIR, `${digest}.jpg`);
};

const fetchSourceImage = async (sourceUrl: string) => {
  const response = await fetch(sourceUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: "https://www.1688.com/",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Image source returned ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer };
};

const resizeToJpeg = async (
  sourceBuffer: Buffer,
  width: number | null,
  height: number | null
) => {
  const w = sanitizeDimension(width);
  const h = sanitizeDimension(height);
  if (!w && !h) {
    return sharp(sourceBuffer)
      .rotate()
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  }
  return sharp(sourceBuffer)
    .rotate()
    .resize({
      width: w ?? undefined,
      height: h ?? undefined,
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
};

const readJsonEntries = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as Record<
      string,
      unknown
    >[];
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["items", "urls", "data", "products", "results"]) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter(
        (item) => item && typeof item === "object"
      ) as Record<string, unknown>[];
    }
  }
  return [];
};

const firstArrayUrl = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  for (const item of value) {
    const text = asText(item);
    if (text) return text;
  }
  return "";
};

const extractMainImageUrl = (entry: Record<string, unknown>) => {
  const direct = asText(entry.main_image_1688) || asText(entry.main_image_url);
  if (direct) return direct;
  const from1688 = firstArrayUrl(entry.image_urls_1688);
  if (from1688) return from1688;
  const fromGeneric = firstArrayUrl(entry.image_urls);
  if (fromGeneric) return fromGeneric;
  const fromCompetitor =
    entry.competitor_data && typeof entry.competitor_data === "object"
      ? firstArrayUrl((entry.competitor_data as Record<string, unknown>).image_urls)
      : "";
  return fromCompetitor;
};

const withConcurrency = async <T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>
) => {
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let index = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        try {
          await run(current);
        } catch {
          // best-effort background warm
        }
      }
    })
  );
};

export const isAllowedQueueImageHost = (host: string) => isAllowedHost(host);

export const getQueueImageCache = async (input: {
  sourceUrl: string;
  width?: number | null;
  height?: number | null;
}) => {
  const sourceUrl = asText(input.sourceUrl);
  if (!sourceUrl) throw new Error("Missing url.");

  const parsed = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol.");
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw new Error("Host not allowed.");
  }

  const width = sanitizeDimension(input.width);
  const height = sanitizeDimension(input.height);
  const cachePath = getCacheFilePath(parsed.toString(), width, height);
  ensureDir();

  if (fs.existsSync(cachePath)) {
    return {
      buffer: fs.readFileSync(cachePath),
      contentType: "image/jpeg",
      cacheHit: true,
    };
  }

  const { buffer } = await fetchSourceImage(parsed.toString());
  const outputBuffer = await resizeToJpeg(buffer, width, height);

  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, outputBuffer);
    fs.renameSync(tempPath, cachePath);
  } catch {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup failures
    }
  }

  return {
    buffer: outputBuffer,
    contentType: "image/jpeg",
    cacheHit: false,
  };
};

export const warmQueueImageCacheForFile = async (fileName: string) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) return;

  const filePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) return;

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return;
  }

  const entries = readJsonEntries(payload);
  const urls = Array.from(
    new Set(
      entries
        .map((entry) => extractMainImageUrl(entry))
        .map((url) => asText(url))
        .filter(Boolean)
    )
  );

  if (!urls.length) return;

  await withConcurrency(urls.slice(0, 30), 4, async (url) => {
    await getQueueImageCache({ sourceUrl: url, width: 75, height: 75 });
    await getQueueImageCache({ sourceUrl: url, width: 300, height: 300 });
  });
};

