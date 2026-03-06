import fs from "node:fs/promises";
import path from "node:path";
import { applyDraftImageOrder, readDraftImageOrder } from "@/lib/draft-image-order";

const IMAGE_EXTS = new Set([
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

export const isImageFileName = (name: string) =>
  IMAGE_EXTS.has(path.extname(name).toLowerCase());

export const isJpegFileName = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg";
};

const isHiddenFile = (name: string) => path.basename(name).startsWith(".");

const hasExcludedArtifactToken = (name: string) => {
  const lower = name.toLowerCase();
  const spaced = lower.replace(/[_-]+/g, " ");
  const hasArtifactWord = /\b(undo|pending)\b/.test(spaced);
  return (
    hasArtifactWord ||
    lower.includes("last.ai") ||
    lower.includes(".photopea-") ||
    lower.includes(".tmp")
  );
};

export const isExcludedPublishArtifactName = (name: string) =>
  isHiddenFile(name) || hasExcludedArtifactToken(name);

export const isPublishableImageName = (name: string) =>
  isImageFileName(name) && !isExcludedPublishArtifactName(name);

const hasTag = (name: string, tag: string) =>
  name.toUpperCase().includes(tag.toUpperCase());

const SIZE_TAG_TOKEN_REGEX =
  /(?:\(\s*SIZE\s*\)|(?:^|[-_ ])SIZE(?=$|[-_ .)]))/i;
const SIZE_CHART_HINT_REGEX = /size[\s_-]*chart/i;
const SIZE_CHART_LANG_REGEX =
  /(?:size(?:[\s_-]*chart)?[\s_-]*)(se|sv|no|nb|en)(?=$|[\s_.\-()])/i;

const isSizeChartImageName = (name: string) => {
  const source = String(name || "");
  if (!source) return false;
  if (SIZE_TAG_TOKEN_REGEX.test(source)) return true;
  return SIZE_CHART_HINT_REGEX.test(source) && SIZE_CHART_LANG_REGEX.test(source);
};

const detectSizeChartLanguageCode = (name: string) => {
  const source = String(name || "");
  const match = source.match(SIZE_CHART_LANG_REGEX);
  const token = String(match?.[1] || "")
    .trim()
    .toUpperCase();
  if (token === "SV") return "SE";
  if (token === "NB") return "NO";
  if (token === "SE" || token === "NO" || token === "EN") return token;
  return "";
};

const DIGI_OR_DIG_TAG_IN_FILE_NAME =
  /(?:\(\s*DIGI?\s*\)|(?:^|[-_ ])DIGI?(?:[-_ .)]|$))/i;

const hasDigiTag = (name: string) => DIGI_OR_DIG_TAG_IN_FILE_NAME.test(name);

const toTempName = (name: string, index: number) => {
  const ext = path.extname(name);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `.__nordexo_order_tmp_${stamp}_${rand}_${index}${ext}`;
};

export type NormalizeImageResult = {
  hadMain: boolean;
  addedMain: boolean;
  renamed: number;
  renamePairs: Array<{ sourceName: string; targetName: string }>;
  missingMainAfter: boolean;
  invalidPrefixes: string[];
  imagesChecked: number;
};

export const normalizeImageNamesInFolder = async (
  folder: string,
  spu: string
): Promise<NormalizeImageResult> => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const imageFilesByName = entries
    .filter((entry) => entry.isFile() && isPublishableImageName(entry.name))
    .map((entry) => entry.name);
  const imageFiles = applyDraftImageOrder(
    imageFilesByName,
    await readDraftImageOrder(folder)
  );

  const sizeChartFiles = imageFiles.filter((name) => isSizeChartImageName(name));
  const regularImageFiles = imageFiles.filter((name) => !isSizeChartImageName(name));

  const hasMain = regularImageFiles.some((name) => hasTag(name, "MAIN"));
  let orderedImageFiles = [...regularImageFiles];
  const explicitMainIndex = orderedImageFiles.findIndex((name) => hasTag(name, "MAIN"));
  if (explicitMainIndex > 0) {
    const [mainName] = orderedImageFiles.splice(explicitMainIndex, 1);
    orderedImageFiles = [mainName, ...orderedImageFiles];
  }

  let addedMain = false;
  let renamed = 0;

  const plan = orderedImageFiles.map((name, index) => {
    const ext = path.extname(name);
    const serial = index + 1;
    const parts = [`${spu}-${serial}`];
    // MAIN must always be the first image when publishing.
    if (index === 0) parts.push("MAIN");
    if (hasTag(name, "ENV")) parts.push("ENV");
    if (hasTag(name, "VAR")) parts.push("VAR");
    if (hasTag(name, "INF")) parts.push("INF");
    // Preserve either DIG or DIGI input markers as DIGI in publish names.
    if (hasDigiTag(name)) parts.push("DIGI");
    return {
      sourceName: name,
      targetName: `${parts.join("-")}${ext}`,
    };
  });

  const usedTargetNames = new Set(plan.map((item) => item.targetName));
  const fallbackLangOrder = ["SE", "NO", "EN"];
  let fallbackLangIndex = 0;
  sizeChartFiles.forEach((name, index) => {
    const ext = path.extname(name);
    const detectedLang = detectSizeChartLanguageCode(name);
    const fallbackLang = fallbackLangOrder[fallbackLangIndex] || `L${index + 1}`;
    if (!detectedLang && fallbackLangIndex < fallbackLangOrder.length) {
      fallbackLangIndex += 1;
    }
    const langCode = detectedLang || fallbackLang;
    const baseName = `${spu}-size-chart-${langCode} (SIZE)`;
    let candidate = `${baseName}${ext}`;
    let dedupeIndex = 2;
    while (usedTargetNames.has(candidate)) {
      candidate = `${baseName}-${dedupeIndex}${ext}`;
      dedupeIndex += 1;
    }
    usedTargetNames.add(candidate);
    plan.push({
      sourceName: name,
      targetName: candidate,
    });
  });

  const toRename = plan.filter((item) => item.sourceName !== item.targetName);
  if (!hasMain && orderedImageFiles.length > 0) {
    addedMain = true;
  }

  if (toRename.length > 0) {
    const staged: Array<{ tempName: string; targetName: string }> = [];
    for (let index = 0; index < toRename.length; index += 1) {
      const item = toRename[index];
      const tempName = toTempName(item.sourceName, index);
      await fs.rename(
        path.join(folder, item.sourceName),
        path.join(folder, tempName)
      );
      staged.push({ tempName, targetName: item.targetName });
    }
    for (const item of staged) {
      await fs.rename(
        path.join(folder, item.tempName),
        path.join(folder, item.targetName)
      );
      renamed += 1;
    }
  }

  const nextEntries = await fs.readdir(folder, { withFileTypes: true });
  const nextImages = nextEntries
    .filter((entry) => entry.isFile() && isPublishableImageName(entry.name))
    .map((entry) => entry.name);
  const missingMainAfter = !nextImages.some((name) => hasTag(name, "MAIN"));
  const invalidPrefixes = nextImages.filter(
    (name) => !name.toUpperCase().startsWith(`${spu.toUpperCase()}-`)
  );

  return {
    hadMain: hasMain,
    addedMain,
    renamed,
    renamePairs: toRename.map((item) => ({
      sourceName: item.sourceName,
      targetName: item.targetName,
    })),
    missingMainAfter,
    invalidPrefixes,
    imagesChecked: imageFiles.length,
  };
};

export const validateImageFolder = async (folder: string, spu: string) => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && isPublishableImageName(entry.name))
    .map((entry) => entry.name);
  const hasMain = images.some((name) => hasTag(name, "MAIN"));
  const invalidPrefixes = images.filter(
    (name) => !name.toUpperCase().startsWith(`${spu.toUpperCase()}-`)
  );
  return { hasMain, invalidPrefixes, count: images.length };
};
