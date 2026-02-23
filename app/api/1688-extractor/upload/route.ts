import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";
import { warmQueueImageCacheForFile } from "@/lib/queue-image-cache";
import { enhance1688ItemsWithAi } from "@/shared/1688/ai-pipeline";
import { canonical1688OfferUrlText } from "@/shared/1688/core";

export const runtime = "nodejs";

const DEFAULT_BASE = "1688_product_extraction";
const UPLOAD_DIR =
  process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nodexo-Token",
};

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
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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

  return NextResponse.json(
    {
      ok: true,
      filename: safeName,
      savedTo: UPLOAD_DIR,
      count: finalItems.length,
      ai_enhanced: aiEnhanced.usedAi,
      ai_error: aiEnhanced.error,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
