import { promises as fs } from "fs";
import path from "path";

const IMAGE_ROOT = "/srv/resources/media/images";
const IMAGE_URL_PREFIX = "/product-images";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAIN_TAG_IN_FILE_NAME =
  /(?:\(\s*MAIN\s*\)|(?:^|[-_ ])MAIN(?:[-_ .)]|$))/i;
const VAR_TAG_IN_FILE_NAME =
  /(?:\(\s*VAR\s*\)|(?:^|[-_ ])VAR(?:[-_ .)]|$))/i;

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

function decodeUrlComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getUrlFileName(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const withoutHash = trimmed.split("#", 1)[0] ?? trimmed;
  const withoutQuery = withoutHash.split("?", 1)[0] ?? withoutHash;
  const base = path.basename(withoutQuery);
  return decodeUrlComponentSafe(base);
}

function hasMainTagInName(value: string) {
  return MAIN_TAG_IN_FILE_NAME.test(value);
}

function hasVarTagInName(value: string) {
  return VAR_TAG_IN_FILE_NAME.test(value);
}

function extractImageSequence(name: string) {
  if (!name) return Number.POSITIVE_INFINITY;
  const matches = [...name.matchAll(/(?:^|[-_ ])(\d+)(?=$|[-_ .])/g)];
  if (matches.length === 0) return Number.POSITIVE_INFINITY;
  const raw = matches[matches.length - 1]?.[1] ?? "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function hasMainTagInUrl(value: string) {
  const fileName = getUrlFileName(value);
  if (!fileName) return false;
  return hasMainTagInName(fileName);
}

function sortImageFiles(a: string, b: string) {
  const score = (name: string) => {
    const lower = name.toLowerCase();
    const group = hasMainTagInName(name) ? 0 : hasVarTagInName(name) ? 1 : 2;
    const sequence = extractImageSequence(name);
    return { group, sequence, lower };
  };

  const aScore = score(a);
  const bScore = score(b);

  if (aScore.group !== bScore.group) return aScore.group - bScore.group;
  if (aScore.sequence !== bScore.sequence) return aScore.sequence - bScore.sequence;
  return aScore.lower.localeCompare(bScore.lower, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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

export function preferImageUrlFilenameFirst(
  urls: string[],
  preferredFilename: string | null | undefined
) {
  if (!urls?.length) return urls;

  const mainIdx = urls.findIndex((url) => hasMainTagInUrl(url));
  if (mainIdx > 0) {
    return [urls[mainIdx], ...urls.slice(0, mainIdx), ...urls.slice(mainIdx + 1)];
  }

  if (!preferredFilename) return urls;
  const preferredName = getUrlFileName(preferredFilename).toLowerCase();
  if (!preferredName) return urls;

  const idx = urls.findIndex((url) => {
    const urlName = getUrlFileName(url).toLowerCase();
    return urlName === preferredName;
  });
  if (idx <= 0) return urls;
  return [urls[idx], ...urls.slice(0, idx), ...urls.slice(idx + 1)];
}
