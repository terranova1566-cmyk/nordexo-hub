import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = "/srv/resources/media/images/amazon_scrapes";

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const sha1 = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex");

const extFromContentType = (contentType: string | null) => {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/gif")) return ".gif";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return ".jpg";
  return "";
};

const extFromUrl = (url: string) => {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname);
    if (!ext) return "";
    const lower = ext.toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(lower)) {
      return lower === ".jpeg" ? ".jpg" : lower;
    }
    return "";
  } catch {
    return "";
  }
};

const normalizeExt = (ext: string) => {
  const lower = (ext || "").toLowerCase();
  if (lower === ".jpeg") return ".jpg";
  return lower;
};

type DownloadedImage = {
  url: string;
  filePath: string;
  bytes: number;
  contentType: string | null;
};

async function downloadOne(url: string, dir: string): Promise<DownloadedImage | null> {
  const trimmed = String(url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  await ensureDir(dir);

  const base = sha1(trimmed).slice(0, 16);
  const guessedExt = normalizeExt(extFromUrl(trimmed));
  const tmpPath = path.join(dir, `${base}.tmp`);

  const res = await fetch(trimmed, { method: "GET" });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type");
  const ext = normalizeExt(extFromContentType(contentType) || guessedExt || ".jpg");
  const finalPath = path.join(dir, `${base}${ext}`);

  try {
    await fs.access(finalPath);
    return {
      url: trimmed,
      filePath: finalPath,
      bytes: 0,
      contentType,
    };
  } catch {
    // continue
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(tmpPath, buf);
  await fs.rename(tmpPath, finalPath);

  return {
    url: trimmed,
    filePath: finalPath,
    bytes: buf.byteLength,
    contentType,
  };
}

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
) => {
  const results: R[] = [];
  const safeConcurrency = Math.max(1, Math.trunc(concurrency || 1));
  let index = 0;
  const workers = Array.from({ length: safeConcurrency }, () => async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await handler(current));
    }
  });
  await Promise.all(workers.map((w) => w()));
  return results;
};

export type AmazonImageDownloadSummary = {
  rootDir: string;
  mainDir: string;
  main: DownloadedImage[];
  variants: Array<{ asin: string; dir: string; images: DownloadedImage[] }>;
};

export async function downloadAmazonScrapeImages(input: {
  asin: string;
  mainImages: string[];
  variants: Array<{ asin: string; images: string[] }>;
}) {
  const asin = String(input.asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    throw new Error("Invalid ASIN for image download.");
  }

  const rootDir = path.join(ROOT_DIR, asin);
  const mainDir = path.join(rootDir, "main");
  const main = (
    await mapWithConcurrency(input.mainImages, 6, async (url) => downloadOne(url, mainDir))
  ).filter((v): v is DownloadedImage => Boolean(v));

  const variants: AmazonImageDownloadSummary["variants"] = [];
  for (const variant of input.variants) {
    const vAsin = String(variant.asin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(vAsin)) continue;
    const dir = path.join(rootDir, "variants", vAsin);
    const images = (
      await mapWithConcurrency(variant.images ?? [], 6, async (url) => downloadOne(url, dir))
    ).filter((v): v is DownloadedImage => Boolean(v));
    variants.push({ asin: vAsin, dir, images });
  }

  return { rootDir, mainDir, main, variants } satisfies AmazonImageDownloadSummary;
}

