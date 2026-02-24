import fs from "fs";
import path from "path";
import { DRAFT_ROOT, toRelativePath } from "@/lib/drafts";

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

const OLD_VERSIONS_DIR_NAME = "old versions";

const isImageFile = (absolutePath: string) =>
  IMAGE_EXTENSIONS.has(path.extname(String(absolutePath || "")).toLowerCase());

const isWithinDraftRoot = (absolutePath: string) => {
  const normalized = path.resolve(String(absolutePath || ""));
  return normalized === DRAFT_ROOT || normalized.startsWith(`${DRAFT_ROOT}${path.sep}`);
};

const resolveSpuRoot = (absolutePath: string) => {
  const normalized = path.resolve(String(absolutePath || ""));
  if (!isWithinDraftRoot(normalized)) return null;
  const relative = path.relative(DRAFT_ROOT, normalized);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length < 2) return null;
  return path.join(DRAFT_ROOT, parts[0], parts[1]);
};

const sanitizeReason = (value: string) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "changed";
};

const timestampForName = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const makeUniqueArchivePath = (
  folderAbsolutePath: string,
  baseName: string,
  ext: string
) => {
  const primary = path.join(folderAbsolutePath, `${baseName}${ext}`);
  if (!fs.existsSync(primary)) return primary;
  let index = 2;
  while (true) {
    const candidate = path.join(folderAbsolutePath, `${baseName}-${index}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
};

export const archiveDraftImageVersion = (input: {
  imageAbsolutePath: string;
  reason?: string;
}) => {
  const sourceAbsolutePath = path.resolve(String(input.imageAbsolutePath || ""));
  if (!isWithinDraftRoot(sourceAbsolutePath)) return null;
  if (!fs.existsSync(sourceAbsolutePath) || !fs.statSync(sourceAbsolutePath).isFile()) {
    return null;
  }
  if (!isImageFile(sourceAbsolutePath)) return null;

  const sourceParts = sourceAbsolutePath.split(path.sep).filter(Boolean);
  if (sourceParts.includes(OLD_VERSIONS_DIR_NAME)) {
    return null;
  }

  const spuRoot = resolveSpuRoot(sourceAbsolutePath);
  if (!spuRoot) return null;

  const oldVersionsAbsolutePath = path.join(spuRoot, OLD_VERSIONS_DIR_NAME);
  if (fs.existsSync(oldVersionsAbsolutePath)) {
    if (!fs.statSync(oldVersionsAbsolutePath).isDirectory()) {
      throw new Error('"old versions" exists but is not a folder.');
    }
  } else {
    fs.mkdirSync(oldVersionsAbsolutePath, { recursive: true });
  }

  const parsed = path.parse(sourceAbsolutePath);
  const ext = parsed.ext.toLowerCase();
  const reasonPart = sanitizeReason(input.reason || "changed");
  const baseName = `${parsed.name}-${reasonPart}-${timestampForName()}`;
  const archiveAbsolutePath = makeUniqueArchivePath(oldVersionsAbsolutePath, baseName, ext);
  fs.copyFileSync(sourceAbsolutePath, archiveAbsolutePath);

  return {
    archiveAbsolutePath,
    archiveRelativePath: toRelativePath(archiveAbsolutePath),
  };
};

