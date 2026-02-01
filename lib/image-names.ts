import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const isImageFile = (name: string) =>
  IMAGE_EXTS.has(path.extname(name).toLowerCase());

const hasTag = (name: string, tag: string) =>
  name.toUpperCase().includes(tag.toUpperCase());

const ensureUnique = async (dir: string, base: string, ext: string) => {
  let candidate = path.join(dir, `${base}${ext}`);
  try {
    await fs.access(candidate);
  } catch {
    return candidate;
  }
  let i = 2;
  while (true) {
    candidate = path.join(dir, `${base}-${i}${ext}`);
    try {
      await fs.access(candidate);
      i += 1;
    } catch {
      return candidate;
    }
  }
};

export type NormalizeImageResult = {
  hadMain: boolean;
  addedMain: boolean;
  renamed: number;
  missingMainAfter: boolean;
  invalidPrefixes: string[];
  imagesChecked: number;
};

export const normalizeImageNamesInFolder = async (
  folder: string,
  spu: string
): Promise<NormalizeImageResult> => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const imageFiles = entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const hasMain = imageFiles.some((name) => hasTag(name, "MAIN"));
  let addedMain = false;
  let renamed = 0;

  const targetIndex = hasMain ? -1 : 0;
  for (let idx = 0; idx < imageFiles.length; idx += 1) {
    const name = imageFiles[idx];
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    const alreadyPrefixed = stem.toUpperCase().startsWith(`${spu.toUpperCase()}-`);
    const wantsMain = idx === targetIndex;
    const isMain = hasTag(name, "MAIN") || wantsMain;
    const isEnv = hasTag(name, "ENV");

    if (alreadyPrefixed && (!wantsMain || hasTag(name, "MAIN"))) {
      continue;
    }

    const serial = idx + 1;
    const parts = [`${spu}-${serial}`];
    if (isMain) parts.push("MAIN");
    if (isEnv) parts.push("ENV");
    const base = parts.join("-");
    const srcPath = path.join(folder, name);
    const destPath = await ensureUnique(folder, base, ext);
    if (srcPath === destPath) continue;

    await fs.rename(srcPath, destPath);
    renamed += 1;
    if (wantsMain && !hasMain) addedMain = true;
  }

  const nextEntries = await fs.readdir(folder, { withFileTypes: true });
  const nextImages = nextEntries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name);
  const missingMainAfter = !nextImages.some((name) => hasTag(name, "MAIN"));
  const invalidPrefixes = nextImages.filter(
    (name) => !name.toUpperCase().startsWith(`${spu.toUpperCase()}-`)
  );

  return {
    hadMain: hasMain,
    addedMain,
    renamed,
    missingMainAfter,
    invalidPrefixes,
    imagesChecked: imageFiles.length,
  };
};

export const validateImageFolder = async (folder: string, spu: string) => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name);
  const hasMain = images.some((name) => hasTag(name, "MAIN"));
  const invalidPrefixes = images.filter(
    (name) => !name.toUpperCase().startsWith(`${spu.toUpperCase()}-`)
  );
  return { hasMain, invalidPrefixes, count: images.length };
};
