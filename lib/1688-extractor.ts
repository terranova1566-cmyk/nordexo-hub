import fs from "fs";
import path from "path";

export const EXTRACTOR_UPLOAD_DIR = "/srv/node-files/1688-extractor";

export type ExtractorFileSummary = {
  name: string;
  receivedAt: string;
  urlCount: number;
  productCount: number;
  missingSpuCount: number;
};

export type ExtractorPreviewItem = {
  index: number;
  url: string;
  title: string;
  imageUrl: string | null;
  spu: string;
  variantCount: number;
};

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const firstString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return "";
};

const firstStringFromArray = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  for (const entry of value) {
    const str = asString(entry);
    if (str) return str;
  }
  return "";
};

const extractEntries = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.urls)) return record.urls;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.results)) return record.results;
  return [];
};

const extractUrl = (entry: Record<string, unknown>) =>
  firstString(entry, [
    "url_1688",
    "url",
    "link",
    "product_url",
    "productUrl",
    "detail_url",
    "detailUrl",
    "offer_url",
    "offerUrl",
    "item_url",
    "itemUrl",
  ]);

const extractTitle = (entry: Record<string, unknown>) =>
  firstString(entry, [
    "title",
    "name",
    "product_title",
    "productTitle",
    "listing_title",
  ]);

const extractReadableTitle = (value: unknown) => {
  if (typeof value !== "string") return "";
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/%/.test(lines[i])) idx = i;
  }
  if (idx >= 0 && idx + 1 < lines.length) {
    return lines[idx + 1];
  }
  return "";
};

const extractSku = (entry: Record<string, unknown>) =>
  firstString(entry, ["sku", "SKU", "sku_code", "product_sku", "productSku"]);

const extractSpu = (entry: Record<string, unknown>) =>
  firstString(entry, ["spu", "SPU", "spu_code", "product_spu", "productSpu"]);

const looksLikeSpu = (value: string) => /^[A-Z]{2,4}-\d{2,}$/i.test(value);

const extractImage = (entry: Record<string, unknown>) => {
  const direct = firstString(entry, [
    "main_image_1688",
    "main_image_url",
    "mainImage",
    "image",
    "image_url",
    "thumbnail",
    "thumb",
    "cover",
  ]);
  if (direct) return direct;
  const array = firstStringFromArray(entry.images);
  if (array) return array;
  const imageUrls1688 = firstStringFromArray(entry.image_urls_1688);
  if (imageUrls1688) return imageUrls1688;
  const urls = firstStringFromArray(entry.image_urls);
  if (urls) return urls;
  return "";
};

const extractVariantCount = (entry: Record<string, unknown>) => {
  const variations = entry.variations;
  if (variations && typeof variations === "object") {
    const record = variations as Record<string, unknown>;
    const kept = Number(record.kept);
    if (Number.isFinite(kept) && kept >= 0) return kept;
    const combos = record.combos;
    if (Array.isArray(combos)) return combos.length;
  }
  const variants = entry.variants_1688;
  if (Array.isArray(variants)) return variants.length;
  if (typeof variants === "string" && variants.trim()) return 1;
  return 0;
};

const extractUniqueKey = (entry: Record<string, unknown>) =>
  firstString(entry, [
    "spu",
    "product_id",
    "productId",
    "id",
    "offerId",
    "itemId",
    "sku",
    "url",
    "link",
  ]);

export const parseExtractorPayload = (payload: unknown) => {
  const entries = extractEntries(payload);
  const previewItems: ExtractorPreviewItem[] = [];
  const unique = new Set<string>();
  let urlCount = 0;
  let missingSpuCount = 0;

  entries.forEach((entry, index) => {
    if (typeof entry === "string") {
      const url = entry.trim();
      if (url) {
        urlCount += 1;
        previewItems.push({
          index,
          url,
          title: url,
          imageUrl: null,
          spu: "",
          variantCount: 0,
        });
        unique.add(url);
      }
      return;
    }
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const url = extractUrl(record);
    const title =
      extractTitle(record) ||
      extractReadableTitle(record.readable_1688) ||
      url;
    const imageUrl = extractImage(record) || null;
    const sku = extractSku(record);
    const spu = extractSpu(record) || (looksLikeSpu(sku) ? sku : "");
    const variantCount = extractVariantCount(record);
    const key = extractUniqueKey(record) || url || `row-${index}`;
    if (url) urlCount += 1;
    unique.add(key);
    if (!spu) missingSpuCount += 1;
    if (url || title) {
      previewItems.push({ index, url, title, imageUrl, spu, variantCount });
    }
  });

  return {
    items: previewItems,
    previewItems,
    urlCount,
    productCount: unique.size,
    missingSpuCount,
  };
};

export const listExtractorFiles = (): ExtractorFileSummary[] => {
  if (!fs.existsSync(EXTRACTOR_UPLOAD_DIR)) return [];
  const files = fs
    .readdirSync(EXTRACTOR_UPLOAD_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"));

  return files
    .map((name) => {
      const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, name);
      try {
        const stat = fs.statSync(fullPath);
        const raw = fs.readFileSync(fullPath, "utf8");
        const payload = JSON.parse(raw);
        const { urlCount, productCount, missingSpuCount } =
          parseExtractorPayload(payload);
        const createdAt =
          Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
            ? stat.birthtime
            : stat.mtime;
        return {
          name,
          receivedAt: createdAt.toISOString(),
          urlCount,
          productCount,
          missingSpuCount,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.receivedAt.localeCompare(a!.receivedAt)) as ExtractorFileSummary[];
};

export const readExtractorFile = (fileName: string) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) return null;
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const payload = JSON.parse(raw);
  const parsed = parseExtractorPayload(payload);
  const createdAt =
    Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
      ? stat.birthtime
      : stat.mtime;
  return {
    name: safeName,
    receivedAt: createdAt.toISOString(),
    ...parsed,
  };
};

export const deleteExtractorFile = (fileName: string) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) return false;
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  return true;
};

const sanitizeBaseName = (value: string) =>
  value
    .trim()
    .replace(/\.json$/i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/^_+|_+$/g, "");

const formatDateStamp = (date: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const buildUniqueFileName = (baseName: string) => {
  const stamp = formatDateStamp(new Date());
  const root = sanitizeBaseName(baseName) || "1688_product_extraction";
  let name = `${root}_${stamp}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(EXTRACTOR_UPLOAD_DIR, name))) {
    name = `${root}_${stamp}-${counter}.json`;
    counter += 1;
  }
  return name;
};

export const mergeExtractorFiles = (
  fileNames: string[],
  baseName: string | null
) => {
  const safeNames = fileNames
    .map((name) => path.basename(name))
    .filter((name) => name && name === name.trim());
  if (safeNames.length < 2) {
    return null;
  }

  const mergedItems: unknown[] = [];
  for (const name of safeNames) {
    const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, name);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${name}`);
    }
    const raw = fs.readFileSync(fullPath, "utf8");
    const payload = JSON.parse(raw);
    const entries = extractEntries(payload);
    mergedItems.push(...entries);
  }

  const createdAt = new Date().toISOString();
  const output = {
    createdAt,
    mergedFrom: safeNames,
    items: mergedItems,
  };

  const newName = buildUniqueFileName(baseName || "");
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, newName);
  fs.writeFileSync(fullPath, JSON.stringify(output, null, 2), "utf8");

  for (const name of safeNames) {
    const oldPath = path.join(EXTRACTOR_UPLOAD_DIR, name);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  return {
    name: newName,
    receivedAt: createdAt,
    ...parseExtractorPayload(output),
  };
};

export const removeExtractorItems = (fileName: string, indexes: number[]) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) {
    throw new Error("Invalid file name.");
  }
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error("File not found.");
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  const payload = JSON.parse(raw);

  const toRemove = new Set(
    indexes.filter((value) => Number.isFinite(value) && value >= 0)
  );

  const applyRemoval = (list: unknown[]) =>
    list.filter((_, idx) => !toRemove.has(idx));

  if (Array.isArray(payload)) {
    const next = applyRemoval(payload);
    fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf8");
    return parseExtractorPayload(next);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const keys = ["items", "urls", "data", "products", "results"];
    for (const key of keys) {
      if (Array.isArray(record[key])) {
        record[key] = applyRemoval(record[key] as unknown[]);
        fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
        return parseExtractorPayload(payload);
      }
    }
  }

  throw new Error("Unable to update JSON file.");
};
