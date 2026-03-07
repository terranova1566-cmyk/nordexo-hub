import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPPLIER_PAYLOAD_DIR } from "@/lib/1688-extractor";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";
import { warmQueueImageCacheForFile } from "@/lib/queue-image-cache";
import {
  PARTNER_SUGGESTION_DIR,
  PARTNER_SUGGESTION_PROVIDER,
  createSuggestionId,
  fetchAndNormalizeImage,
  normalizeExternalDataForRecord,
  saveSuggestionRecord,
  type ProductSuggestionRecord,
} from "@/lib/product-suggestions";
import { enhance1688ItemsWithAi } from "@/shared/1688/ai-pipeline";
import { canonical1688OfferUrlText } from "@/shared/1688/core";

export const runtime = "nodejs";

const DEFAULT_BASE = "1688_product_extraction";
const UPLOAD_DIR =
  process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor";
const PRODUCT_SUGGESTION_PAYLOAD_TYPE = "product_suggestions_browser_v1";
const PRODUCT_SUGGESTION_IMPORT_MAX = 200;
const PRODUCT_SUGGESTION_TRANSLATE_MAX = 30;
const DEFAULT_PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || process.env.HUB_PUBLIC_URL || "https://hub.nordexo.se";
const BACKGROUND_SEARCH_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-supplier-search-worker.mjs";
const BACKGROUND_TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";
const BACKGROUND_SOURCE_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-source-worker.ts";
const TSX_BIN_PATH = "/srv/nordexo-hub/node_modules/.bin/tsx";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nodexo-Token",
};
const INTERNAL_EXTENSION_STATIC_TOKEN =
  "550fdd5c20fc25e8e5483c8869e3a897bb6a2e3992f988c3";
const STOREISH_TITLE_RE = /(旗舰店|专营店|店铺|商行|有限公司|工厂|鞋厂|公司介绍|企业店)/i;
const CJK_RE = /[\u3400-\u9fff]/;
const TITLE_BLOCKLIST = [
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
  "关于质量",
  "质量问题",
  "本店",
  "负责处理",
  "同款商品",
  "多个平台",
  "累计销量",
  "淘宝",
  "天猫",
  "电子商务平台",
  "销量",
];

const asText = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const toBool = (value: unknown, fallback = false) => {
  const raw = asText(value).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const toInt = (value: unknown, fallback: number, options: { min?: number; max?: number } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.trunc(num);
  const withMin = Number.isFinite(Number(options.min))
    ? Math.max(Number(options.min), rounded)
    : rounded;
  return Number.isFinite(Number(options.max))
    ? Math.min(Number(options.max), withMin)
    : withMin;
};

const toStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asText(entry))
      .filter(Boolean);
  }
  const text = asText(value);
  if (!text) return [];
  return text
    .split(",")
    .map((entry) => asText(entry))
    .filter(Boolean);
};

const canonicalize1688Url = (value: unknown) => {
  const text = asText(value);
  if (!text) return "";
  return canonical1688OfferUrlText(text) || text;
};

const canonicalizeUploadedEntryUrls = (record: Record<string, unknown>) => {
  const out = { ...record };
  const directUrlKeys = [
    "url_1688",
    "detail_url",
    "detailUrl",
    "selected_detail_url",
    "supplier_selected_offer_detail_url",
    "draft_supplier_1688_url",
  ];
  directUrlKeys.forEach((key) => {
    if (typeof out[key] !== "string") return;
    out[key] = canonicalize1688Url(out[key]);
  });

  if (Array.isArray(out.url_1688_list)) {
    const nextList = out.url_1688_list
      .map((entry) => canonicalize1688Url(entry))
      .filter(Boolean);
    out.url_1688_list = Array.from(new Set(nextList));
  }

  if (out.selected_offer && typeof out.selected_offer === "object") {
    const offer = { ...(out.selected_offer as Record<string, unknown>) };
    if (typeof offer.detailUrl === "string") {
      offer.detailUrl = canonicalize1688Url(offer.detailUrl);
    }
    if (typeof offer.detail_url === "string") {
      offer.detail_url = canonicalize1688Url(offer.detail_url);
    }
    out.selected_offer = offer;
  }

  return out;
};

const toPrimitiveAiFlag = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  return undefined;
};

const firstPrimitiveAiFlag = (
  ...values: unknown[]
): string | number | boolean | undefined => {
  for (const value of values) {
    const primitive = toPrimitiveAiFlag(value);
    if (primitive !== undefined) return primitive;
  }
  return undefined;
};

const maybeEnhanceItemsWithAi = async (
  items: unknown[],
  payloadRecord: Record<string, unknown> | null
) => {
  const enabled = toBool(
    payloadRecord?.aiEnhance ??
      payloadRecord?.ai_enhance ??
      process.env.NODEXO_1688_UPLOAD_AI_ENABLE ??
      "1",
    true
  );
  if (!enabled || items.length === 0) {
    return { items, usedAi: false, error: null as string | null };
  }

  const mode = asText(
    payloadRecord?.aiMode ?? payloadRecord?.ai_mode ?? process.env.NODEXO_1688_UPLOAD_AI_MODE
  );
  const enableWeightReview =
    firstPrimitiveAiFlag(
      payloadRecord?.aiWeightReview,
      payloadRecord?.ai_weight_review,
      process.env.NODEXO_1688_UPLOAD_AI_WEIGHT_REVIEW,
      process.env.NODEXO_1688_AI_WEIGHT_REVIEW
    ) ?? "1";
  const enableAttributeExtract =
    firstPrimitiveAiFlag(
      payloadRecord?.aiAttributeExtract,
      payloadRecord?.ai_attribute_extract,
      process.env.NODEXO_1688_UPLOAD_AI_ATTRIBUTE_EXTRACT
    ) ?? (items.length <= 3 ? "1" : "0");
  const modelCandidates = toStringList(
    payloadRecord?.aiModels ?? payloadRecord?.ai_models ?? process.env.NODEXO_1688_UPLOAD_AI_MODELS
  );
  const attributeTimeoutMs = toInt(
    payloadRecord?.aiAttributeTimeoutMs ??
      payloadRecord?.ai_attribute_timeout_ms ??
      process.env.NODEXO_1688_UPLOAD_AI_ATTRIBUTE_TIMEOUT_MS,
    12_000,
    { min: 4_000, max: 40_000 }
  );
  const concurrency = toInt(
    payloadRecord?.aiConcurrency ??
      payloadRecord?.ai_concurrency ??
      process.env.NODEXO_1688_UPLOAD_AI_CONCURRENCY,
    2,
    { min: 1, max: 6 }
  );

  try {
    const enhanced = await enhance1688ItemsWithAi(items, {
      source: "extractor_upload_route",
      mode: mode || "fast",
      enableWeightReview,
      enableAttributeExtract,
      modelCandidates,
      attributeTimeoutMs,
      concurrency,
    });
    return { items: enhanced as unknown[], usedAi: true, error: null as string | null };
  } catch (error) {
    return {
      items,
      usedAi: false,
      error: error instanceof Error ? error.message : "ai_enhancement_failed",
    };
  }
};

const hasExistingVariantFilter = (record: Record<string, unknown>) => {
  if (typeof record.variants_1688 === "string" && record.variants_1688.trim()) {
    return true;
  }
  if (!Array.isArray(record.variation_filter_tokens)) return false;
  return record.variation_filter_tokens.some((entry) => asText(entry));
};

const collectSelectedComboIndexes = (combos: unknown[]) => {
  const out: number[] = [];
  combos.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const quantity = Number((entry as Record<string, unknown>).quantity);
    if (Number.isFinite(quantity) && quantity > 0) out.push(index);
  });
  return out;
};

const buildVariantFilterTokens = (combos: unknown[], selectedIndexes: number[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  selectedIndexes.forEach((idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= combos.length) return;
    const combo =
      combos[idx] && typeof combos[idx] === "object"
        ? (combos[idx] as Record<string, unknown>)
        : null;
    if (!combo) return;
    ["t1", "t2", "t3"].forEach((key) => {
      const token = asText(combo[key]);
      if (!token || seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
  });
  return out;
};

const normalizeUploadedItems = (items: unknown[]) =>
  items.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = canonicalizeUploadedEntryUrls(
      entry as Record<string, unknown>
    );
    if (hasExistingVariantFilter(record)) return record;

    const variations =
      record.variations && typeof record.variations === "object"
        ? ({ ...(record.variations as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : null;
    const combos = variations && Array.isArray(variations.combos) ? variations.combos : [];
    if (combos.length === 0) return record;

    const selectedComboIndexes = collectSelectedComboIndexes(combos);
    if (selectedComboIndexes.length === 0) return record;

    const filterTokens = buildVariantFilterTokens(combos, selectedComboIndexes);
    if (filterTokens.length === 0) return record;

    record.variation_filter_tokens = filterTokens;
    record.variants_1688 = filterTokens.join("\n");
    const existingSelection =
      record.production_variant_selection &&
      typeof record.production_variant_selection === "object"
        ? {
            ...(record.production_variant_selection as Record<string, unknown>),
          }
        : {};
    record.production_variant_selection = {
      ...existingSelection,
      selected_combo_indexes: selectedComboIndexes,
      combo_overrides: Array.isArray(existingSelection.combo_overrides)
        ? existingSelection.combo_overrides
        : [],
      packs: Array.isArray(existingSelection.packs) ? existingSelection.packs : [],
      packs_text: asText(existingSelection.packs_text),
    };

    return record;
  });

function parseTokens() {
  const raw =
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKENS ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKEN ||
    "";
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const revoked = ["1", "true", "yes", "on"].includes(
    asText(process.env.NODEXO_INTERNAL_STATIC_UPLOAD_TOKEN_REVOKED).toLowerCase()
  );
  if (!revoked) tokens.push(INTERNAL_EXTENSION_STATIC_TOKEN);
  return Array.from(new Set(tokens));
}

function getAuthToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.headers.get("x-nodexo-token") || "";
}

function sanitizeBaseName(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const dashed = raw.replace(/\s+/g, "-");
  return dashed.replace(/[^a-zA-Z0-9._-]/g, "").replace(/^-+|-+$/g, "");
}

function sanitizeFilePart(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "item";
}

function buildTimestamp() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(
    d.getMilliseconds(),
    3
  )}`;
  return { date, time };
}

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    asText(value)
  );

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const pickFirstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const hasCjk = (value: unknown) => CJK_RE.test(asText(value));

const cleanReadableLine = (value: unknown) =>
  asText(value)
    .replace(/\s+/g, " ")
    .replace(/[|｜•·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const isStoreishTitle = (value: unknown) => {
  const text = asText(value);
  if (!text) return false;
  return STOREISH_TITLE_RE.test(text) && text.length <= 64;
};

const inferTitleFromReadable1688 = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => cleanReadableLine(line))
    .filter(Boolean);
  if (!lines.length) return "";

  const candidates = lines
    .filter((line) => hasCjk(line))
    .filter((line) => line.length >= 6 && line.length <= 90)
    .filter((line) => !/^[-\d\s.,%]+$/.test(line))
    .filter((line) => !line.includes("\t"))
    .filter(
      (line) =>
        !TITLE_BLOCKLIST.some((token) => line.includes(token)) &&
        !line.includes("¥") &&
        !line.includes("￥")
    )
    .map((line, idx) => {
      let score = 0;
      score += Math.min(60, line.length);
      if (!/[A-Za-z]/.test(line)) score += 8;
      if (idx < Math.max(20, Math.round(lines.length * 0.35))) score += 10;
      if (isStoreishTitle(line)) score -= 24;
      if (/(同款商品|平台|销量|质量问题|本店|关于质量|负责处理)/.test(line)) score -= 60;
      if ((line.match(/[，,]/g) || []).length >= 4) score -= 20;
      if (/^(跨境|新款|春秋|夏季|秋冬|冬季|男女|男士|女士|儿童|户外|运动)/.test(line)) score += 10;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.line || "";
};

const extractJsonFromText = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const normalizeHttpUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const canonical1688DetailUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const matched = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (matched?.[1]) return `https://detail.1688.com/offer/${matched[1]}.html`;
  return canonicalize1688Url(raw);
};

const extract1688OfferId = (value: unknown) => {
  const text = asText(value);
  if (!text) return "";
  const matched = text.match(/\/offer\/(\d{6,})\.html/i);
  return matched?.[1] || "";
};

const pickUploadedSuggestionDetailUrl = (entry: Record<string, unknown>) => {
  const direct = canonical1688DetailUrl(
    pickFirstText(
      entry.url_1688,
      entry.detail_url,
      entry.detailUrl,
      entry.selected_detail_url,
      entry.supplier_selected_offer_detail_url,
      entry.offer_url,
      entry.offerUrl
    )
  );
  if (direct) return direct;

  const list = Array.isArray(entry.url_1688_list) ? entry.url_1688_list : [];
  for (const value of list) {
    const normalized = canonical1688DetailUrl(value);
    if (normalized) return normalized;
  }
  return "";
};

const looksLikePreloaded1688Item = (entry: Record<string, unknown>) => {
  const detailUrl = pickUploadedSuggestionDetailUrl(entry);
  if (!detailUrl) return false;
  const variations = resolveUploaded1688Variations(entry);
  if (Array.isArray(variations.combos) && variations.combos.length > 0) return true;
  if (entry.production_variant_selection && typeof entry.production_variant_selection === "object") {
    return true;
  }
  if (asText(entry.variants_1688)) return true;
  if (entry.weight_review_1688 && typeof entry.weight_review_1688 === "object") return true;
  return true;
};

const resolveUploaded1688Scope = (entry: Record<string, unknown>) =>
  toObjectRecord(toObjectRecord(entry.platform_attributes)["1688"]);

const resolveUploaded1688Variations = (entry: Record<string, unknown>) => {
  const attrs1688 = resolveUploaded1688Scope(entry);
  const candidates = [
    entry.variations_enriched_1688,
    entry.variations,
    attrs1688.variations_enriched_1688,
    attrs1688.variations,
  ];
  for (const candidate of candidates) {
    const variation = toObjectRecord(candidate);
    if (Array.isArray(variation.combos) && variation.combos.length > 0) return variation;
  }
  for (const candidate of candidates) {
    const variation = toObjectRecord(candidate);
    if (Object.keys(variation).length > 0) return variation;
  }
  return {};
};

const resolveUploaded1688WeightReview = (entry: Record<string, unknown>) => {
  if (entry.weight_review_1688 && typeof entry.weight_review_1688 === "object") {
    return entry.weight_review_1688 as Record<string, unknown>;
  }
  const attrs1688 = resolveUploaded1688Scope(entry);
  if (attrs1688.weight_review_1688 && typeof attrs1688.weight_review_1688 === "object") {
    return attrs1688.weight_review_1688 as Record<string, unknown>;
  }
  return null;
};

const normalizeCombosForCache = (value: unknown) => {
  const combos = Array.isArray(value) ? value : [];
  return combos
    .map((entry) =>
      entry && typeof entry === "object"
        ? ({ ...(entry as Record<string, unknown>) } as Record<string, unknown>)
        : null
    )
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const normalizeVariantSelection = (
  value: unknown,
  comboCount: number
) => {
  const selection = toObjectRecord(value);
  const selectedComboIndexes = Array.isArray(selection.selected_combo_indexes)
    ? (selection.selected_combo_indexes as unknown[])
        .map((entry) => Number(entry))
        .filter(
          (entry) =>
            Number.isInteger(entry) && entry >= 0 && (!comboCount || entry < comboCount)
        )
    : [];
  const packs = Array.isArray(selection.packs)
    ? (selection.packs as unknown[])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];
  const comboOverrides = Array.isArray(selection.combo_overrides)
    ? (selection.combo_overrides as unknown[])
        .map((entry) => {
          const row = toObjectRecord(entry);
          const index = Number(row.index);
          if (!Number.isInteger(index) || index < 0 || (comboCount && index >= comboCount)) {
            return null;
          }
          const price = Number(row.price);
          const weightGrams = Number(row.weight_grams ?? row.weightGrams);
          return {
            index,
            price: Number.isFinite(price) && price > 0 ? price : null,
            weight_grams:
              Number.isFinite(weightGrams) && weightGrams > 0
                ? Math.round(weightGrams)
                : null,
          };
        })
        .filter(
          (
            entry
          ): entry is { index: number; price: number | null; weight_grams: number | null } =>
            Boolean(entry)
        )
    : [];

  return {
    selected_combo_indexes: Array.from(new Set(selectedComboIndexes)).sort((a, b) => a - b),
    packs: Array.from(new Set(packs)).sort((a, b) => a - b),
    packs_text: asText(selection.packs_text),
    combo_overrides: comboOverrides,
  };
};

const extractSelectedVariantIndexesFromCombos = (combos: Array<Record<string, unknown>>) => {
  const out: number[] = [];
  combos.forEach((combo, index) => {
    const quantity = Number(combo.quantity ?? combo.qty ?? combo.selected_qty);
    if (Number.isFinite(quantity) && quantity > 0) out.push(index);
  });
  return out;
};

const normalizeImageUrlList = (values: unknown[], max = 120) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    const normalized = normalizeHttpUrl(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
};

const collectUploadedSuggestionImages = (entry: Record<string, unknown>) => {
  const attrs = toObjectRecord(entry.platform_attributes);
  const attrs1688 = toObjectRecord(attrs["1688"]);
  const scopedLists: unknown[] = [];
  Object.values(attrs).forEach((scope) => {
    const scoped = toObjectRecord(scope);
    scopedLists.push(
      scoped.gallery_image_urls,
      scoped.main_image_urls,
      scoped.image_urls,
      scoped.description_image_urls,
      scoped.images
    );
  });

  return normalizeImageUrlList(
    [
      ...(Array.isArray(entry.main_image_urls_1688) ? entry.main_image_urls_1688 : []),
      ...(Array.isArray(entry.gallery_image_urls_1688) ? entry.gallery_image_urls_1688 : []),
      ...(Array.isArray(entry.image_urls_1688) ? entry.image_urls_1688 : []),
      ...(Array.isArray(entry.description_image_urls_1688) ? entry.description_image_urls_1688 : []),
      ...(Array.isArray(entry.main_image_urls) ? entry.main_image_urls : []),
      ...(Array.isArray(entry.gallery_image_urls) ? entry.gallery_image_urls : []),
      ...(Array.isArray(entry.image_urls) ? entry.image_urls : []),
      ...(Array.isArray(entry.supplementary_image_urls) ? entry.supplementary_image_urls : []),
      ...(Array.isArray(entry.variant_image_urls) ? entry.variant_image_urls : []),
      entry.main_image_url,
      entry.main_image_1688,
      attrs1688.main_image_url,
      attrs1688.main_image_1688,
      ...scopedLists.flatMap((value) => (Array.isArray(value) ? value : [value])),
    ],
    120
  );
};

const translateChineseTitlesBestEffort = async (titles: string[]) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) return new Map<string, string>();

  const uniqueTitles = Array.from(new Set(titles.map((entry) => asText(entry)).filter(Boolean)));
  const limited = uniqueTitles.filter((entry) => hasCjk(entry)).slice(0, PRODUCT_SUGGESTION_TRANSLATE_MAX);
  if (limited.length === 0) return new Map<string, string>();

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.NODEXO_1688_TITLE_TRANSLATE_MODEL,
        "gpt-5-mini",
        "gpt-5-nano",
      ]
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );
  if (!models.length) return new Map<string, string>();

  const prompt = [
    "Translate Chinese 1688 product titles into concise, natural English.",
    "Return JSON only.",
    'Format: { "items": [ { "source": "...", "english_title": "..." } ] }',
    "Rules:",
    "1) Keep key product nouns and technical attributes.",
    "2) Remove hype/marketing words.",
    "3) Max 120 characters per title.",
    "",
    "Titles:",
    ...limited.map((entry, idx) => `${idx + 1}. ${entry}`),
  ].join("\n");

  let parsed: Record<string, unknown> | null = null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const extracted = extractJsonFromText(payload?.choices?.[0]?.message?.content);
      if (extracted && typeof extracted === "object") {
        parsed = extracted as Record<string, unknown>;
        break;
      }
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }

  const out = new Map<string, string>();
  const rows = Array.isArray(parsed?.items) ? parsed.items : [];
  rows.forEach((row, index) => {
    const record = toObjectRecord(row);
    const source = asText(record.source || limited[index]);
    const english = asText(
      record.english_title ||
        record.englishTitle ||
        record.title_en ||
        record.translation ||
        record.english
    ).slice(0, 120);
    if (!source || !english || hasCjk(english)) return;
    out.set(source, english);
  });

  const translateSingle = async (source: string) => {
    const prompt = [
      "Translate this Chinese supplier product title into concise, natural English.",
      "Keep key product nouns and technical attributes, remove marketing filler, max 120 chars.",
      'Return JSON only with format: { "english_title": "..." }',
      "",
      `Title: ${source}`,
    ].join("\n");
    for (const model of models) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
        if (!response.ok) continue;
        const payload = await response.json().catch(() => null);
        const extracted = extractJsonFromText(payload?.choices?.[0]?.message?.content);
        const english = asText(
          toObjectRecord(extracted).english_title ||
            toObjectRecord(extracted).englishTitle ||
            toObjectRecord(extracted).title_en ||
            toObjectRecord(extracted).translation ||
            toObjectRecord(extracted).english
        ).slice(0, 120);
        if (english && !hasCjk(english)) return english;
      } catch {
        // try next model
      } finally {
        clearTimeout(timeout);
      }
    }
    return "";
  };

  for (const source of limited) {
    if (out.has(source)) continue;
    const translated = await translateSingle(source);
    if (translated) out.set(source, translated);
  }

  return out;
};

const isProductSuggestionPayload = (
  payloadRecord: Record<string, unknown> | null,
  items: unknown[]
) => {
  const payloadType = asText(
    payloadRecord?.payloadType || payloadRecord?.payload_type
  ).toLowerCase();
  if (payloadType === PRODUCT_SUGGESTION_PAYLOAD_TYPE) return true;
  return items.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      asText(record.payload_type).toLowerCase() === PRODUCT_SUGGESTION_PAYLOAD_TYPE ||
      asText(record.record_type).toLowerCase() === "product_suggestion"
    );
  });
};

const resolveSuggestionQueueUserId = async (
  adminClient: ReturnType<typeof getAdminClient>,
  payloadRecord: Record<string, unknown> | null
) => {
  const envUserId = asText(process.env.NODEXO_PRODUCT_SUGGESTION_UPLOAD_USER_ID);
  if (isUuid(envUserId)) return envUserId;

  const payloadUserId = pickFirstText(
    payloadRecord?.queue_user_id,
    payloadRecord?.queueUserId,
    payloadRecord?.user_id,
    payloadRecord?.userId
  );
  if (isUuid(payloadUserId)) return payloadUserId;

  if (!adminClient) return "";

  const { data: existingRow } = await adminClient
    .from("discovery_production_items")
    .select("user_id")
    .eq("provider", PARTNER_SUGGESTION_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingUserId = asText(existingRow?.user_id);
  if (isUuid(existingUserId)) return existingUserId;

  const { data: adminRow } = await adminClient
    .from("partner_user_settings")
    .select("user_id")
    .eq("is_admin", true)
    .limit(1)
    .maybeSingle();
  const adminUserId = asText(adminRow?.user_id);
  if (isUuid(adminUserId)) return adminUserId;

  try {
    const entries = fs
      .readdirSync(PARTNER_SUGGESTION_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => {
        const fullPath = path.join(PARTNER_SUGGESTION_DIR, entry.name);
        const mtimeMs = fs.statSync(fullPath).mtimeMs || 0;
        return { fullPath, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 60);

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(fs.readFileSync(entry.fullPath, "utf8")) as Record<
          string,
          unknown
        >;
        const createdBy = pickFirstText(parsed.createdBy, parsed.created_by);
        if (isUuid(createdBy)) return createdBy;
      } catch {
        // best effort
      }
    }
  } catch {
    // best effort
  }

  return "";
};

const spawnBackgroundSupplierSearchWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(
      process.execPath,
      [
        BACKGROUND_SEARCH_WORKER_PATH,
        "--provider",
        PARTNER_SUGGESTION_PROVIDER,
        "--ids",
        ids.join(","),
      ],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PUBLIC_BASE_URL: DEFAULT_PUBLIC_BASE_URL,
        },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const spawnBackgroundTaxonomyWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(process.execPath, [BACKGROUND_TAXONOMY_WORKER_PATH, "--ids", ids.join(",")], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const spawnBackgroundSourceWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(TSX_BIN_PATH, [BACKGROUND_SOURCE_WORKER_PATH, "--ids", ids.join(",")], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

type SuggestionImportSummary = {
  enabled: boolean;
  attempted: number;
  imported: number;
  queued: number;
  sourceQueued: number;
  searchWorkerStarted: boolean;
  taxonomyWorkerStarted: boolean;
  sourceWorkerStarted: boolean;
  skippedReason: string | null;
  errors: string[];
};

type UploadRouteTarget = "auto" | "production" | "suggestions";

const buildSuggestionImportSkippedSummary = (
  reason: string,
  errors: string[] = []
): SuggestionImportSummary => ({
  enabled: false,
  attempted: 0,
  imported: 0,
  queued: 0,
  sourceQueued: 0,
  searchWorkerStarted: false,
  taxonomyWorkerStarted: false,
  sourceWorkerStarted: false,
  skippedReason: reason,
  errors,
});

const resolveUploadRouteTarget = (
  payloadRecord: Record<string, unknown> | null
): UploadRouteTarget => {
  const raw = asText(
    payloadRecord?.routeTo ??
      payloadRecord?.route_to ??
      payloadRecord?.destination ??
      payloadRecord?.sendTo ??
      payloadRecord?.send_to
  ).toLowerCase();
  if (raw === "production") return "production";
  if (raw === "suggestions" || raw === "product_suggestions") return "suggestions";
  return "auto";
};

const pickUploadedSuggestionTitle = (entry: Record<string, unknown>) => {
  const direct = pickFirstText(
    entry.product_title,
    entry.title,
    entry.name,
    entry.title_1688,
    entry.title_cn,
    entry.title_zh,
    entry.offerTitle,
    entry.subject
  );
  if (!direct) return null;
  if (!isStoreishTitle(direct)) return direct;

  const readableFallback = inferTitleFromReadable1688(
    pickFirstText(entry.readable_1688, entry.readable_1688_raw)
  );
  if (readableFallback && !isStoreishTitle(readableFallback)) {
    return readableFallback;
  }
  return direct;
};

const pickUploadedSuggestionEnglishTitle = (entry: Record<string, unknown>) => {
  const ai1688 = toObjectRecord(entry.ai_1688);
  const aiAttr = toObjectRecord(ai1688.attribute_extract);
  const entryAttrs = toObjectRecord(entry.platform_attributes);
  const attrs1688 = toObjectRecord(entryAttrs["1688"]);
  const attrs1688Ai = toObjectRecord(attrs1688.ai_1688);
  const attrs1688AiAttr = toObjectRecord(attrs1688Ai.attribute_extract);
  const english = pickFirstText(
    entry.title_en,
    entry.product_title_en,
    entry.subject_en,
    aiAttr.product_name_en,
    attrs1688AiAttr.product_name_en
  );
  if (!english || hasCjk(english)) return "";
  return english.slice(0, 180);
};

const pickUploadedSuggestionSourceUrl = (entry: Record<string, unknown>) => {
  const direct = normalizeHttpUrl(
    pickFirstText(
      entry.product_url,
      entry.url,
      entry.source_url,
      entry.sourceUrl,
      entry.url_1688,
      entry.detail_url,
      entry.detailUrl,
      entry.offer_url,
      entry.offerUrl
    )
  );
  if (direct) return direct;
  const list = Array.isArray(entry.url_1688_list) ? entry.url_1688_list : [];
  for (const value of list) {
    const candidate = normalizeHttpUrl(value);
    if (candidate) return candidate;
  }
  return null;
};

const pickUploadedSuggestionDescription = (entry: Record<string, unknown>) => {
  const raw = pickFirstText(
    entry.product_description,
    entry.description,
    entry.readable_1688,
    entry.readable_1688_raw
  );
  const text = asText(raw);
  if (!text) return null;
  return text.slice(0, 12000);
};

const importSuggestionsToPartnerQueue = async (
  items: unknown[],
  payloadRecord: Record<string, unknown> | null,
  options: { force?: boolean } = {}
): Promise<SuggestionImportSummary> => {
  const forceImport = Boolean(options.force);
  if (!forceImport && !isProductSuggestionPayload(payloadRecord, items)) {
    return buildSuggestionImportSkippedSummary("payload_not_product_suggestions");
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      enabled: true,
      attempted: 0,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "missing_supabase_service_credentials",
      errors: [],
    };
  }

  const queueUserId = await resolveSuggestionQueueUserId(adminClient, payloadRecord);
  if (!isUuid(queueUserId)) {
    return {
      enabled: true,
      attempted: 0,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "missing_queue_user_id",
      errors: ["Unable to resolve a valid queue user ID for product suggestions."],
    };
  }

  const candidates = items
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, PRODUCT_SUGGESTION_IMPORT_MAX)
    .map((entry) => entry as Record<string, unknown>);

  const createdRecords: ProductSuggestionRecord[] = [];
  const errors: string[] = [];
  const importedAt = new Date().toISOString();
  const { date: importDate, time: importTime } = buildTimestamp();
  const importStamp = `${importDate}_${importTime}`;
  const translationCandidates = candidates
    .map((entry) => {
      const title = pickUploadedSuggestionTitle(entry);
      const english = pickUploadedSuggestionEnglishTitle(entry);
      if (!title || english || !hasCjk(title)) return "";
      return title;
    })
    .filter(Boolean);
  const translatedTitleMap = await translateChineseTitlesBestEffort(translationCandidates);
  const supplierSearchWorkerIds: string[] = [];
  const sourceWorkerCandidateIds: string[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const entry = candidates[index];
    const sourcePlatform = asText(
      entry.source_platform ||
        entry.sourcePlatform ||
        entry.platform ||
        payloadRecord?.sourcePlatform ||
        payloadRecord?.source_platform ||
        "1688"
    ).toLowerCase();
    const baseTitle = pickUploadedSuggestionTitle(entry);
    const translatedTitle =
      pickUploadedSuggestionEnglishTitle(entry) ||
      (baseTitle ? asText(translatedTitleMap.get(baseTitle)) : "");
    const title = translatedTitle || baseTitle || null;
    const detailUrl = pickUploadedSuggestionDetailUrl(entry);
    const isPreloaded1688 =
      sourcePlatform.includes("1688") && looksLikePreloaded1688Item(entry);
    const sourceUrl = pickUploadedSuggestionSourceUrl(entry);
    const effectiveSourceUrl = sourceUrl || (isPreloaded1688 ? detailUrl || null : null);
    const hasExternalSourceUrl = Boolean(effectiveSourceUrl) && !isPreloaded1688;
    const description = pickUploadedSuggestionDescription(entry);
    const imageUrls = collectUploadedSuggestionImages(entry);
    const remoteMainImageUrl = imageUrls[0] || null;
    const createdAt = importedAt;
    const scrapedAt = asText(entry.scraped_at) || null;
    const partnerName = pickFirstText(
      entry.partner_name,
      entry.partnerName,
      entry.user,
      entry.submitted_by,
      payloadRecord?.partnerName,
      payloadRecord?.partner_name,
      payloadRecord?.user,
      payloadRecord?.sourceUser
    );
    const suggestionId = createSuggestionId();

    const recordErrors: string[] = [];
    let image: ProductSuggestionRecord["image"] = null;
    let mainImageUrl = remoteMainImageUrl;
    if (remoteMainImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(remoteMainImageUrl);
        image = fetched.image;
        mainImageUrl = fetched.image.publicPath;
      } catch (error) {
        recordErrors.push(
          `Image download failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      recordErrors.push("No product image URL found in uploaded suggestion.");
    }

    const searchJob = isPreloaded1688
      ? {
          status: "done" as const,
          queuedAt: null,
          startedAt: importedAt,
          finishedAt: importedAt,
          error: null,
          lastRunAt: importedAt,
        }
      : {
          status: "queued" as const,
          queuedAt: importedAt,
          startedAt: null,
          finishedAt: null,
          error: null,
          lastRunAt: importedAt,
        };
    const sourceJob = isPreloaded1688
      ? {
          status: "done" as const,
          stage: "done" as const,
          queuedAt: null,
          startedAt: importedAt,
          finishedAt: importedAt,
          updatedAt: importedAt,
          error: null,
        }
      : {
          status: hasExternalSourceUrl ? ("queued" as const) : ("done" as const),
          stage: hasExternalSourceUrl ? ("queued" as const) : ("done" as const),
          queuedAt: hasExternalSourceUrl ? importedAt : null,
          startedAt: hasExternalSourceUrl ? null : importedAt,
          finishedAt: hasExternalSourceUrl ? null : importedAt,
          updatedAt: importedAt,
          error: null,
        };

    const record: ProductSuggestionRecord = {
      id: suggestionId,
      provider: PARTNER_SUGGESTION_PROVIDER,
      createdAt,
      createdBy: queueUserId,
      sourceType: effectiveSourceUrl ? "url" : "image",
      sourceLabel: pickFirstText(entry.source_host, sourcePlatform, "browser_extension") || null,
      sourceUrl: effectiveSourceUrl || remoteMainImageUrl || null,
      crawlFinalUrl: hasExternalSourceUrl ? effectiveSourceUrl : null,
      title,
      description,
      mainImageUrl: mainImageUrl || remoteMainImageUrl || null,
      galleryImageUrls: imageUrls,
      image,
      errors: recordErrors,
      searchJob,
      sourceJob,
      googleTaxonomy: {
        status: title ? "queued" : "idle",
        sourceTitle: title,
        queuedAt: title ? importedAt : null,
        startedAt: null,
        finishedAt: null,
        updatedAt: importedAt,
        error: null,
      },
      reviewStatus: "new",
    };

    const mutableRecord = record as Record<string, unknown>;
    mutableRecord.partner_name = partnerName;
    mutableRecord.partnerName = partnerName;
    mutableRecord.user = partnerName;
    mutableRecord.submitted_by = partnerName;
    mutableRecord.source_platform = sourcePlatform;
    mutableRecord.payload_type = PRODUCT_SUGGESTION_PAYLOAD_TYPE;
    const sourceAttrs = toObjectRecord(entry.platform_attributes);
    const submissionAttrs = {
      ...toObjectRecord(sourceAttrs.submission),
      partner_name: partnerName,
      source: "nordexo_product_scraper_extension",
      tagged_at: importedAt,
      scraped_at: scrapedAt,
    };
    const sourceAttrs1688 = toObjectRecord(sourceAttrs["1688"]);
    const resolvedVariations = resolveUploaded1688Variations(entry);
    const resolvedWeightReview = resolveUploaded1688WeightReview(entry);
    const resolvedVariantSelection =
      (entry.production_variant_selection &&
      typeof entry.production_variant_selection === "object"
        ? (entry.production_variant_selection as Record<string, unknown>)
        : null) ||
      (sourceAttrs1688.production_variant_selection &&
      typeof sourceAttrs1688.production_variant_selection === "object"
        ? (sourceAttrs1688.production_variant_selection as Record<string, unknown>)
        : null);
    const resolvedImageUrls1688 = Array.isArray(entry.image_urls_1688)
      ? entry.image_urls_1688
      : Array.isArray(sourceAttrs1688.gallery_image_urls)
        ? sourceAttrs1688.gallery_image_urls
        : Array.isArray(sourceAttrs1688.image_urls)
          ? sourceAttrs1688.image_urls
          : [];
    const merged1688 = {
      ...sourceAttrs1688,
      offer_id: asText(sourceAttrs1688.offer_id || extract1688OfferId(detailUrl)) || null,
      offer_url: detailUrl || asText(sourceAttrs1688.offer_url) || null,
      gallery_image_urls: Array.isArray(sourceAttrs1688.gallery_image_urls)
        ? sourceAttrs1688.gallery_image_urls
        : Array.isArray(entry.gallery_image_urls_1688)
          ? entry.gallery_image_urls_1688
          : [],
      description_image_urls: Array.isArray(sourceAttrs1688.description_image_urls)
        ? sourceAttrs1688.description_image_urls
        : Array.isArray(entry.description_image_urls_1688)
          ? entry.description_image_urls_1688
          : [],
      variations:
        sourceAttrs1688.variations && typeof sourceAttrs1688.variations === "object"
          ? sourceAttrs1688.variations
          : resolvedVariations,
      weight_review_1688:
        sourceAttrs1688.weight_review_1688 && typeof sourceAttrs1688.weight_review_1688 === "object"
          ? sourceAttrs1688.weight_review_1688
          : resolvedWeightReview,
    };
    mutableRecord.platform_attributes = {
      ...sourceAttrs,
      "1688": merged1688,
      submission: submissionAttrs,
    };
    const normalizedEntryForStorage = isPreloaded1688
      ? {
          ...entry,
          variations: resolvedVariations,
          production_variant_selection:
            resolvedVariantSelection || entry.production_variant_selection || null,
          weight_review_1688: resolvedWeightReview || entry.weight_review_1688 || null,
        }
      : null;
    mutableRecord.extension_payload_1688 = normalizedEntryForStorage;

    try {
      const normalized = normalizeExternalDataForRecord(record);
      await saveSuggestionRecord(normalized);

      if (isPreloaded1688) {
        let payloadFileName = "";
        let payloadFilePath = "";
        try {
          fs.mkdirSync(PRODUCTION_SUPPLIER_PAYLOAD_DIR, { recursive: true });
          const payloadItem = {
            ...(normalizedEntryForStorage || entry),
            production_provider: PARTNER_SUGGESTION_PROVIDER,
            production_product_id: normalized.id,
            url_1688: detailUrl,
            url_1688_list: detailUrl ? [detailUrl] : [],
          };
          payloadFileName = `production_supplier_${sanitizeFilePart(
            PARTNER_SUGGESTION_PROVIDER
          )}_${sanitizeFilePart(normalized.id)}_${importStamp}_${String(index + 1).padStart(
            3,
            "0"
          )}.json`;
          payloadFilePath = path.join(PRODUCTION_SUPPLIER_PAYLOAD_DIR, payloadFileName);
          fs.writeFileSync(payloadFilePath, JSON.stringify(payloadItem, null, 2), "utf8");
        } catch (error) {
          errors.push(
            `Failed to persist preloaded 1688 payload for "${asText(title) || normalized.id}": ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        const variations = toObjectRecord(resolvedVariations);
        const combos = normalizeCombosForCache(variations.combos);
        const baseSelection = normalizeVariantSelection(
          resolvedVariantSelection || entry.production_variant_selection,
          combos.length
        );
        const fallbackSelectedIndexes =
          baseSelection.selected_combo_indexes.length > 0
            ? baseSelection.selected_combo_indexes
            : extractSelectedVariantIndexesFromCombos(combos);
        const selectedComboIndexes =
          fallbackSelectedIndexes.length > 0
            ? fallbackSelectedIndexes
            : combos.map((_, comboIndex) => comboIndex);
        const variantSelection = {
          ...baseSelection,
          selected_combo_indexes: Array.from(new Set(selectedComboIndexes)).sort((a, b) => a - b),
        };
        const offerId =
          asText(entry.selected_supplier_offer_id) || extract1688OfferId(detailUrl) || null;
        const supplierSubject = asText(baseTitle || title);
        const supplierSubjectEn =
          asText(translatedTitle) || (supplierSubject && !hasCjk(supplierSubject) ? supplierSubject : "");
        const selectedOffer = {
          offerId,
          detailUrl: detailUrl || null,
          imageUrl: remoteMainImageUrl,
          subject: supplierSubject || null,
          subject_en: supplierSubjectEn || null,
          _production_payload_status: payloadFilePath ? "ready" : "failed",
          _production_payload_source: "extension_json",
          _production_payload_error: payloadFilePath ? null : "Failed to persist payload JSON.",
          _production_payload_file_name: payloadFileName || null,
          _production_payload_file_path: payloadFilePath || null,
          _production_payload_updated_at: importedAt,
          _production_payload_saved_at: importedAt,
          _production_variant_selection: variantSelection,
          _production_variant_cache: {
            cached_at: importedAt,
            payload_file_path: payloadFilePath || null,
            available_count: combos.length,
            type1_label: asText(variations.type1_label || variations.type1Label),
            type2_label: asText(variations.type2_label || variations.type2Label),
            type3_label: asText(variations.type3_label || variations.type3Label),
            combos,
            gallery_images: resolvedImageUrls1688,
            weight_review: resolvedWeightReview,
          },
        };

        const [searchUpsert, selectionUpsert] = await Promise.all([
          adminClient
            .from("discovery_production_supplier_searches")
            .upsert(
              {
                provider: PARTNER_SUGGESTION_PROVIDER,
                product_id: normalized.id,
                fetched_at: importedAt,
                offers: [
                  {
                    rank: 1,
                    offerId,
                    detailUrl,
                    imageUrl: remoteMainImageUrl,
                    subject: supplierSubject || null,
                    subject_en: supplierSubjectEn || null,
                  },
                ],
                input: {
                  source: "extension_upload",
                  mode: "preloaded_1688",
                },
                meta: {
                  source: "extension_upload",
                  preloaded: true,
                  payload_file_name: payloadFileName || null,
                },
              },
              { onConflict: "provider,product_id" }
            ),
          adminClient
            .from("discovery_production_supplier_selection")
            .upsert(
              {
                provider: PARTNER_SUGGESTION_PROVIDER,
                product_id: normalized.id,
                selected_offer_id: offerId,
                selected_detail_url: detailUrl || null,
                selected_offer: selectedOffer,
                selected_at: importedAt,
                selected_by: queueUserId,
                updated_at: importedAt,
              },
              { onConflict: "provider,product_id" }
            ),
        ]);

        if (searchUpsert.error || selectionUpsert.error) {
          errors.push(
            `Failed to preload supplier selection "${asText(title) || normalized.id}": ${
              searchUpsert.error?.message || selectionUpsert.error?.message || "unknown error"
            }`
          );
          supplierSearchWorkerIds.push(normalized.id);
        }
      } else {
        supplierSearchWorkerIds.push(normalized.id);
        if (/^https?:\/\//i.test(asText(normalized.crawlFinalUrl))) {
          sourceWorkerCandidateIds.push(normalized.id);
        }
      }
      createdRecords.push(normalized);
    } catch (error) {
      errors.push(
        `Failed to save suggestion "${asText(title) || effectiveSourceUrl || "unknown"}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (createdRecords.length === 0) {
    return {
      enabled: true,
      attempted: candidates.length,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "no_records_created",
      errors,
    };
  }

  const queueRows = createdRecords.map((record) => ({
    user_id: queueUserId,
    provider: PARTNER_SUGGESTION_PROVIDER,
    product_id: record.id,
    created_at: record.createdAt,
  }));
  const { error: queueError } = await adminClient
    .from("discovery_production_items")
    .upsert(queueRows, { onConflict: "user_id,provider,product_id" });
  if (queueError) {
    errors.push(`Failed to queue product suggestions: ${queueError.message}`);
  }

  const searchWorkerStarted =
    supplierSearchWorkerIds.length > 0
      ? spawnBackgroundSupplierSearchWorker(supplierSearchWorkerIds)
      : true;
  if (supplierSearchWorkerIds.length > 0 && !searchWorkerStarted) {
    errors.push("Background supplier search worker failed to start.");
  }

  const taxonomyWorkerStarted = spawnBackgroundTaxonomyWorker(
    createdRecords
      .filter((record) => Boolean(asText(record.title)))
      .map((record) => record.id)
  );
  if (!taxonomyWorkerStarted) {
    errors.push("Background taxonomy worker failed to start.");
  }

  const sourceWorkerIds = Array.from(new Set(sourceWorkerCandidateIds));
  const sourceQueued = sourceWorkerIds.length;
  const sourceWorkerStarted =
    sourceQueued > 0 ? spawnBackgroundSourceWorker(sourceWorkerIds) : true;
  if (sourceQueued > 0 && !sourceWorkerStarted) {
    errors.push("Background source crawl worker failed to start.");
    const failedAt = new Date().toISOString();
    await Promise.all(
      createdRecords
        .filter((record) => sourceWorkerIds.includes(record.id))
        .map(async (record) => {
          const patched = normalizeExternalDataForRecord({
            ...record,
            sourceJob: {
              status: "error",
              stage: "done",
              queuedAt: record.sourceJob?.queuedAt || failedAt,
              startedAt: record.sourceJob?.startedAt || failedAt,
              finishedAt: failedAt,
              updatedAt: failedAt,
              error: "Background source crawl worker failed to start.",
            },
          });
          await saveSuggestionRecord(patched);
        })
    );
  }

  return {
    enabled: true,
    attempted: candidates.length,
    imported: createdRecords.length,
    queued: queueError ? 0 : queueRows.length,
    sourceQueued,
    searchWorkerStarted,
    taxonomyWorkerStarted,
    sourceWorkerStarted: sourceQueued > 0 ? sourceWorkerStarted : true,
    skippedReason: null,
    errors,
  };
};

export async function POST(request: Request) {
  const tokens = parseTokens();
  if (tokens.length) {
    const provided = getAuthToken(request);
    if (!provided || !tokens.includes(provided)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const payloadRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const rawItems = Array.isArray(payload) ? payload : payloadRecord?.items;
  const items = Array.isArray(rawItems) ? normalizeUploadedItems(rawItems) : rawItems;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing items array." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const aiEnhanced = await maybeEnhanceItemsWithAi(items, payloadRecord);
  const finalItems = aiEnhanced.items;
  const routeTo = resolveUploadRouteTarget(payloadRecord);

  const baseRaw =
    (payloadRecord?.filenameBase || payloadRecord?.filename || payloadRecord?.name || "").toString();
  const base = sanitizeBaseName(baseRaw) || DEFAULT_BASE;
  const { date, time } = buildTimestamp();
  const filename = `${base}_${date}_${time}.json`;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = path.basename(filename);
  const targetPath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(targetPath, JSON.stringify(finalItems, null, 2), "utf8");
  try {
    await generateQueueKeywordsForFile(safeName, { force: true, mode: "full" });
  } catch {
    // best effort for upload path
  }
  void warmQueueImageCacheForFile(safeName).catch(() => {
    // best effort for upload path
  });
  let productSuggestionsImport: SuggestionImportSummary;
  if (routeTo === "suggestions") {
    productSuggestionsImport = await importSuggestionsToPartnerQueue(
      finalItems,
      payloadRecord,
      { force: true }
    );
  } else if (routeTo === "production") {
    productSuggestionsImport = buildSuggestionImportSkippedSummary(
      "route_target_production"
    );
  } else {
    productSuggestionsImport = await importSuggestionsToPartnerQueue(
      finalItems,
      payloadRecord
    );
  }

  return NextResponse.json(
    {
      ok: true,
      filename: safeName,
      savedTo: UPLOAD_DIR,
      count: finalItems.length,
      route_to: routeTo,
      ai_enhanced: aiEnhanced.usedAi,
      ai_error: aiEnhanced.error,
      product_suggestions_import: productSuggestionsImport,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
