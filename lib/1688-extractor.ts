import fs from "fs";
import path from "path";
import { canonical1688OfferUrlText } from "@/shared/1688/core";

export const EXTRACTOR_UPLOAD_DIR = "/srv/node-files/1688-extractor";
export const PRODUCTION_SUPPLIER_PAYLOAD_DIR =
  process.env.NODEXO_PRODUCTION_PAYLOAD_DIR ||
  path.join(EXTRACTOR_UPLOAD_DIR, "_production_queue_payloads");

export type ExtractorFileSummary = {
  name: string;
  receivedAt: string;
  urlCount: number;
  productCount: number;
  missingSpuCount: number;
  deckItems: ExtractorPreviewItem[];
};

export type ExtractorPreviewItem = {
  index: number;
  url: string;
  title: string;
  imageUrl: string | null;
  spu: string;
  variantCount: number;
};

const FILE_SUMMARY_CACHE_DIR = path.join(EXTRACTOR_UPLOAD_DIR, "_summary_cache");
const FILE_SUMMARY_CACHE_VERSION = 1;

type ExtractorFileSummaryCache = {
  cacheVersion: number;
  sourceMtimeMs: number;
  summary: ExtractorFileSummary;
};

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const canonicalize1688UrlValue = (value: unknown) => {
  const raw = asString(value);
  if (!raw) return "";
  return canonical1688OfferUrlText(raw) || raw;
};

const CANONICAL_URL_KEYS = new Set([
  "url_1688",
  "detail_url",
  "detailUrl",
  "selected_detail_url",
  "supplier_selected_offer_detail_url",
  "draft_supplier_1688_url",
]);

const canonicalizeOfferRecord = (value: unknown) => {
  if (!value || typeof value !== "object") return value;
  const offer = { ...(value as Record<string, unknown>) };
  if (typeof offer.detailUrl === "string") {
    offer.detailUrl = canonicalize1688UrlValue(offer.detailUrl);
  }
  if (typeof offer.detail_url === "string") {
    offer.detail_url = canonicalize1688UrlValue(offer.detail_url);
  }
  return offer;
};

const canonicalizeEntryUrls = (entry: unknown) => {
  if (typeof entry === "string") return canonicalize1688UrlValue(entry) || entry;
  if (!entry || typeof entry !== "object") return entry;
  const record = { ...(entry as Record<string, unknown>) };

  Array.from(CANONICAL_URL_KEYS).forEach((key) => {
    if (typeof record[key] !== "string") return;
    record[key] = canonicalize1688UrlValue(record[key]);
  });

  if (Array.isArray(record.url_1688_list)) {
    const next = record.url_1688_list
      .map((value) => canonicalize1688UrlValue(value))
      .filter(Boolean);
    record.url_1688_list = Array.from(new Set(next));
  }

  if (record.selected_offer) {
    record.selected_offer = canonicalizeOfferRecord(record.selected_offer);
  }

  return record;
};

const canonicalizePayloadEntries = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => canonicalizeEntryUrls(entry));
  }
  if (!payload || typeof payload !== "object") return payload;
  const record = { ...(payload as Record<string, unknown>) };
  const keys = ["items", "urls", "data", "products", "results"];
  keys.forEach((key) => {
    if (!Array.isArray(record[key])) return;
    record[key] = (record[key] as unknown[]).map((entry) => canonicalizeEntryUrls(entry));
  });
  return record;
};

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
  canonicalize1688UrlValue(
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
    ])
  );

const extractTitle = (entry: Record<string, unknown>) =>
  firstString(entry, [
    "title_1688",
    "title_cn",
    "title_zh",
    "subject",
    "subject_cn",
    "subject_zh",
    "title",
    "name",
    "product_title",
    "productTitle",
    "listing_title",
  ]);

const READABLE_TITLE_BLOCKLIST = [
  "客服",
  "回头率",
  "商品评价",
  "查看全部评价",
  "登录查看全部",
  "服务",
  "物流",
  "发货",
  "材质",
  "品牌",
  "规格",
  "货号",
  "价格",
  "评价",
  "全部",
  "店铺",
  "商品属性",
  "商品资质",
  "包装信息",
  "商品详情",
  "加采购车",
  "立即下单",
  "库存",
  "商品件重尺",
];

const cleanReadableLine = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[|｜•·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const containsChinese = (value: string) => /[\u4e00-\u9fff]/.test(value);

const extractReadableTitle = (value: unknown) => {
  if (typeof value !== "string") return "";
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanReadableLine(line))
    .filter(Boolean);

  const candidates = lines
    .filter((line) => containsChinese(line))
    .filter((line) => line.length >= 6 && line.length <= 72)
    .filter((line) => !/^[-\d\s.,%]+$/.test(line))
    .filter((line) => !/https?:\/\/|with\(document\)|window\.|function\(/i.test(line))
    .filter((line) => !line.includes("\t"))
    .filter(
      (line) =>
        !READABLE_TITLE_BLOCKLIST.some((token) => line.includes(token)) &&
        !line.includes("¥") &&
        !line.includes("￥")
    )
    .map((line, idx) => {
      let score = 0;
      score += Math.min(44, line.length);
      if (!/[A-Za-z]/.test(line)) score += 12;
      if (idx < Math.max(20, Math.round(lines.length * 0.35))) score += 10;
      if (/灯|机|器|刷|耳环|项链|玩具|工具|摆件|收纳|垫|网|吊灯|台灯|面罩/i.test(line)) {
        score += 8;
      }
      if (/[0-9]{3,}/.test(line)) score -= 8;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.line ?? "";
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
  fs.mkdirSync(FILE_SUMMARY_CACHE_DIR, { recursive: true });

  const cachePathFor = (name: string) =>
    path.join(FILE_SUMMARY_CACHE_DIR, `${name}.json`);

  const readSummaryCache = (
    name: string,
    sourceMtimeMs: number
  ): ExtractorFileSummary | null => {
    const cachePath = cachePathFor(name);
    if (!fs.existsSync(cachePath)) return null;
    try {
      const raw = fs.readFileSync(cachePath, "utf8");
      const parsed = JSON.parse(raw) as ExtractorFileSummaryCache;
      const validDeck =
        parsed?.summary &&
        Array.isArray(parsed.summary.deckItems) &&
        parsed.summary.deckItems.every((item) => item && typeof item === "object");
      if (
        Number(parsed?.cacheVersion) === FILE_SUMMARY_CACHE_VERSION &&
        Number(parsed?.sourceMtimeMs) === Number(sourceMtimeMs) &&
        parsed?.summary &&
        typeof parsed.summary.name === "string" &&
        typeof parsed.summary.receivedAt === "string" &&
        typeof parsed.summary.urlCount === "number" &&
        typeof parsed.summary.productCount === "number" &&
        typeof parsed.summary.missingSpuCount === "number" &&
        validDeck
      ) {
        return parsed.summary;
      }
    } catch {
      return null;
    }
    return null;
  };

  const writeSummaryCache = (
    name: string,
    sourceMtimeMs: number,
    summary: ExtractorFileSummary
  ) => {
    const cachePath = cachePathFor(name);
    const payload: ExtractorFileSummaryCache = {
      cacheVersion: FILE_SUMMARY_CACHE_VERSION,
      sourceMtimeMs,
      summary,
    };
    const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tempPath, cachePath);
    } catch {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup failures
      }
    }
  };

  const files = fs
    .readdirSync(EXTRACTOR_UPLOAD_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .filter((name) => {
      const lower = name.toLowerCase();
      // Keep Chrome-extension incoming list clean: production queue payload files
      // are managed via supplier selection metadata, not this incoming bucket.
      if (lower.startsWith("production_supplier_")) return false;
      if (lower.startsWith("production_supplier_manual_")) return false;
      return true;
    });

  return files
    .map((name) => {
      const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, name);
      try {
        const stat = fs.statSync(fullPath);
        const sourceMtimeMs = Number(stat.mtimeMs);
        const cached = readSummaryCache(name, sourceMtimeMs);
        if (cached) return cached;

        const raw = fs.readFileSync(fullPath, "utf8");
        const payload = JSON.parse(raw);
        const parsed = parseExtractorPayload(payload);
        const deckItems = parsed.items
          .filter((item) => Boolean(item.imageUrl))
          .slice(0, 5);
        const createdAt =
          Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
            ? stat.birthtime
            : stat.mtime;
        const summary: ExtractorFileSummary = {
          name,
          receivedAt: createdAt.toISOString(),
          urlCount: parsed.urlCount,
          productCount: parsed.productCount,
          missingSpuCount: parsed.missingSpuCount,
          deckItems,
        };
        writeSummaryCache(name, sourceMtimeMs, summary);
        return summary;
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
    mergedItems.push(...entries.map((entry) => canonicalizeEntryUrls(entry)));
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
    const next = canonicalizePayloadEntries(applyRemoval(payload));
    fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf8");
    return parseExtractorPayload(next);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const keys = ["items", "urls", "data", "products", "results"];
    for (const key of keys) {
      if (Array.isArray(record[key])) {
        record[key] = applyRemoval(record[key] as unknown[]);
        const normalizedPayload = canonicalizePayloadEntries(payload);
        fs.writeFileSync(fullPath, JSON.stringify(normalizedPayload, null, 2), "utf8");
        return parseExtractorPayload(normalizedPayload);
      }
    }
  }

  throw new Error("Unable to update JSON file.");
};

export type ExtractorVariantSelectionUpdate = {
  index: number;
  selectedComboIndexes: number[];
};

type PatchExtractorItemsInput = {
  removeIndexes?: number[];
  variantUpdates?: ExtractorVariantSelectionUpdate[];
};

const normalizeSelectionIndexes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  value.forEach((entry) => {
    const numeric = Number(entry);
    if (!Number.isInteger(numeric) || numeric < 0) return;
    unique.add(numeric);
  });
  return Array.from(unique).sort((a, b) => a - b);
};

const asTrimmedText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const buildVariantLabelToken = (combo: Record<string, unknown>) => {
  const zh = [combo.t1_zh, combo.t2_zh, combo.t3_zh]
    .map((entry) => asTrimmedText(entry))
    .filter(Boolean);
  if (zh.length > 0) return zh.join(" / ");

  const raw = [combo.t1, combo.t2, combo.t3]
    .map((entry) => asTrimmedText(entry))
    .filter(Boolean);
  if (raw.length > 0) return raw.join(" / ");

  const en = [combo.t1_en, combo.t2_en, combo.t3_en]
    .map((entry) => asTrimmedText(entry))
    .filter(Boolean);
  return en.join(" / ");
};

const applyVariantSelectionToEntry = (
  entry: Record<string, unknown>,
  selectedComboIndexesRaw: unknown
) => {
  const selectedComboIndexes = normalizeSelectionIndexes(selectedComboIndexesRaw);
  const selectedSet = new Set(selectedComboIndexes);

  const existingVariations =
    entry.variations && typeof entry.variations === "object"
      ? ({ ...(entry.variations as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const sourceCombos = Array.isArray(existingVariations.combos)
    ? [...(existingVariations.combos as unknown[])]
    : [];

  const keptCombos = sourceCombos.filter((combo, index) => {
    const row =
      combo && typeof combo === "object"
        ? (combo as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const explicitIndex = Number(row.index);
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0) {
      return selectedSet.has(explicitIndex);
    }
    return selectedSet.has(index);
  });

  existingVariations.combos = keptCombos;
  existingVariations.kept = keptCombos.length;
  entry.variations = existingVariations;

  const variationTokens = keptCombos
    .map((combo) =>
      combo && typeof combo === "object"
        ? buildVariantLabelToken(combo as Record<string, unknown>)
        : ""
    )
    .filter(Boolean);
  entry.variation_filter_tokens = variationTokens;
  entry.variants_1688 = variationTokens.join("\n");

  const existingSelection =
    entry.production_variant_selection &&
    typeof entry.production_variant_selection === "object"
      ? {
          ...(entry.production_variant_selection as Record<string, unknown>),
        }
      : {};
  const existingOverrides = Array.isArray(existingSelection.combo_overrides)
    ? [...(existingSelection.combo_overrides as unknown[])]
    : [];
  const nextOverrides = existingOverrides.filter((overrideRow) => {
    const override =
      overrideRow && typeof overrideRow === "object"
        ? (overrideRow as Record<string, unknown>)
        : null;
    if (!override) return false;
    const index = Number(override.index);
    return Number.isInteger(index) && index >= 0 && selectedSet.has(index);
  });

  entry.production_variant_selection = {
    ...existingSelection,
    selected_combo_indexes: selectedComboIndexes,
    combo_overrides: nextOverrides,
    packs: Array.isArray(existingSelection.packs)
      ? existingSelection.packs
      : [],
    packs_text: asTrimmedText(existingSelection.packs_text),
  };
};

export const patchExtractorItems = (
  fileName: string,
  input: PatchExtractorItemsInput
) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) {
    throw new Error("Invalid file name.");
  }
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error("File not found.");
  }

  const removeIndexes = normalizeSelectionIndexes(input.removeIndexes);
  const removeSet = new Set(removeIndexes);
  const variantUpdates = Array.isArray(input.variantUpdates)
    ? input.variantUpdates
    : [];
  const variantUpdateMap = new Map<number, number[]>();
  variantUpdates.forEach((updateRow) => {
    const index = Number(updateRow?.index);
    if (!Number.isInteger(index) || index < 0) return;
    const selected = normalizeSelectionIndexes(updateRow?.selectedComboIndexes);
    variantUpdateMap.set(index, selected);
  });

  if (removeSet.size === 0 && variantUpdateMap.size === 0) {
    throw new Error("No changes supplied.");
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const payload = JSON.parse(raw);

  const applyPatchToEntries = (entries: unknown[]) => {
    const updatedEntries = entries.map((entry, index) => {
      if (!variantUpdateMap.has(index)) return entry;
      if (!entry || typeof entry !== "object") return entry;
      const nextEntry = { ...(entry as Record<string, unknown>) };
      applyVariantSelectionToEntry(nextEntry, variantUpdateMap.get(index) || []);
      return nextEntry;
    });
    if (removeSet.size === 0) return updatedEntries;
    return updatedEntries.filter((_, index) => !removeSet.has(index));
  };

  if (Array.isArray(payload)) {
    const next = canonicalizePayloadEntries(applyPatchToEntries(payload));
    fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf8");
    return parseExtractorPayload(next);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const keys = ["items", "urls", "data", "products", "results"];
    for (const key of keys) {
      if (Array.isArray(record[key])) {
        record[key] = applyPatchToEntries(record[key] as unknown[]);
        const normalizedPayload = canonicalizePayloadEntries(payload);
        fs.writeFileSync(fullPath, JSON.stringify(normalizedPayload, null, 2), "utf8");
        return parseExtractorPayload(normalizedPayload);
      }
    }
  }

  throw new Error("Unable to update JSON file.");
};

export const writeExtractorFileText = (fileName: string, text: string) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) {
    throw new Error("Invalid file name.");
  }
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error("File not found.");
  }
  const rawText = text.trim();
  if (!rawText) {
    throw new Error("JSON content is empty.");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Invalid JSON content.");
  }

  const normalizedPayload = canonicalizePayloadEntries(parsed);
  fs.writeFileSync(fullPath, JSON.stringify(normalizedPayload, null, 2), "utf8");
  return parseExtractorPayload(normalizedPayload);
};

export const readExtractorFileText = (fileName: string) => {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) return null;
  const fullPath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
};
