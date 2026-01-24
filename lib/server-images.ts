import { promises as fs } from "fs";
import path from "path";

const IMAGE_ROOT = "/srv/resources/media/images";
const IMAGE_URL_PREFIX = "/product-images";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

type ImageSize = "standard" | "small" | "thumb" | "original";

type LoadOptions = {
  size?: ImageSize;
};

type ResolveOptions = {
  size?: ImageSize;
};

function isLocalImageFolder(folder: string) {
  return folder.startsWith(IMAGE_ROOT);
}

function sortImageFiles(a: string, b: string) {
  const score = (name: string) => {
    const lower = name.toLowerCase();
    const isMain = lower.includes("main") ? 0 : 1;
    const numMatch = lower.match(/(\d+)/);
    const num = numMatch ? Number(numMatch[1]) : 9999;
    return { isMain, num, lower };
  };

  const aScore = score(a);
  const bScore = score(b);

  if (aScore.isMain !== bScore.isMain) return aScore.isMain - bScore.isMain;
  if (aScore.num !== bScore.num) return aScore.num - bScore.num;
  return aScore.lower.localeCompare(bScore.lower);
}

export async function loadImageUrls(
  imageFolder: string | null,
  options: LoadOptions = {}
) {
  return loadImageUrlsWithOptions(imageFolder, options);
}

async function listImageFiles(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort(sortImageFiles);
  } catch {
    return [];
  }
}

function buildCandidates(basePath: string, size: ImageSize) {
  if (size === "thumb") {
    return [
      path.join(basePath, "thumb"),
      path.join(basePath, "small"),
      path.join(basePath, "standard"),
      basePath,
    ];
  }
  if (size === "small") {
    return [
      path.join(basePath, "small"),
      path.join(basePath, "standard"),
      basePath,
    ];
  }
  if (size === "original") {
    return [path.join(basePath, "original"), basePath];
  }
  return [path.join(basePath, "standard"), basePath];
}

export async function loadImageUrlsWithOptions(
  imageFolder: string | null,
  options: LoadOptions = {}
) {
  if (!imageFolder) return [];

  const folderPath = imageFolder.startsWith("/")
    ? imageFolder
    : path.join(IMAGE_ROOT, imageFolder);

  if (!isLocalImageFolder(folderPath)) return [];

  const size = options.size ?? "standard";
  const candidates = buildCandidates(folderPath, size);

  for (const candidate of candidates) {
    const files = await listImageFiles(candidate);
    if (!files.length) continue;
    const relativePath = path
      .relative(IMAGE_ROOT, candidate)
      .replace(/\\/g, "/");
    return files.map(
      (filename) => `${IMAGE_URL_PREFIX}/${relativePath}/${filename}`
    );
  }

  return [];
}

export async function resolveImageUrl(
  imageFolder: string | null,
  filename: string | null,
  options: ResolveOptions = {}
) {
  if (!imageFolder || !filename) return null;

  if (/^https?:\/\//i.test(filename)) return filename;

  const safeName = path.basename(filename);
  const folderPath = imageFolder.startsWith("/")
    ? imageFolder
    : path.join(IMAGE_ROOT, imageFolder);

  if (!isLocalImageFolder(folderPath)) return null;

  const size = options.size ?? "standard";
  const candidates = buildCandidates(folderPath, size);

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, safeName));
    } catch {
      continue;
    }

    const relativePath = path
      .relative(IMAGE_ROOT, candidate)
      .replace(/\\/g, "/");
    return `${IMAGE_URL_PREFIX}/${relativePath}/${safeName}`;
  }

  return null;
}
