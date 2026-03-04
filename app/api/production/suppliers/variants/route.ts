import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadJsonFile, safeExtractorJsonPath } from "@/lib/production-queue-status";
import { isAllowedQueueImageHost } from "@/lib/queue-image-cache";
import {
  PARTNER_SUGGESTION_PROVIDER,
  mapMarketConfigRows,
  mapShippingClassRows,
  loadSuggestionRecord,
  saveSuggestionRecord,
} from "@/lib/product-suggestions";
import {
  extractJsonFromText,
  normalizeNameLoose,
  normalizeNameStrict,
  parseVariantWeightTableFromReadableText,
  pickFallbackWeightGrams,
  toWeightGrams as asWeightGrams,
} from "@/shared/1688/core";
import { getDealsProviderConfig, resolveDealsProvider } from "@/lib/deals/provider";

export const runtime = "nodejs";
const DIGIDEAL_PROVIDER = "digideal";
const OFFERILLA_PROVIDER = "offerilla";
const DEALS_SUPPLIER_PROVIDERS = new Set([DIGIDEAL_PROVIDER, OFFERILLA_PROVIDER]);

type VariantCombo = {
  index: number;
  t1: string;
  t2: string;
  t3: string;
  t1_zh?: string;
  t1_en?: string;
  t2_zh?: string;
  t2_en?: string;
  t3_zh?: string;
  t3_en?: string;
  image_url?: string;
  image_thumb_url?: string;
  image_zoom_url?: string;
  image_full_url?: string;
  price_raw: string;
  price: number | null;
  weight_raw?: string;
  weight_grams?: number | null;
};

type ComboOverride = {
  index: number;
  price: number | null;
  weight_grams: number | null;
};

type VariantGalleryImage = {
  thumb_url: string;
  full_url: string;
  url: string;
  url_full: string;
};

type WeightReviewPayload = {
  version?: number;
  generated_at?: string;
  mode?: string;
  needs_review?: boolean;
  trigger_next_supplier?: boolean;
  confidence?: number | null;
  reason_codes?: string[];
  summary?: string | null;
  heuristic?: Record<string, unknown> | null;
  ai?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
};

type VariantCachePayload = {
  cached_at: string;
  payload_file_path: string | null;
  available_count: number;
  type1_label: string;
  type2_label: string;
  type3_label: string;
  combos: VariantCombo[];
  gallery_images: VariantGalleryImage[];
  weight_review?: WeightReviewPayload | null;
};

type SekPricingContext = {
  market: string;
  currency: "SEK";
  shipping_class: string;
  fx_rate_cny: number;
  weight_threshold_g: number;
  packing_fee: number;
  markup_percent: number;
  markup_fixed: number;
  rate_low: number;
  rate_high: number;
  base_low: number;
  base_high: number;
  mult_low: number;
  mult_high: number;
};

const variantTranslationCache = new Map<string, string>();

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const asNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeWeightReview = (value: unknown): WeightReviewPayload | null => {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const reasonCodes = Array.isArray(rec.reason_codes)
    ? rec.reason_codes.map((entry) => asText(entry)).filter(Boolean)
    : [];
  return {
    version: Number.isFinite(Number(rec.version)) ? Number(rec.version) : undefined,
    generated_at: asText(rec.generated_at) || undefined,
    mode: asText(rec.mode) || undefined,
    needs_review: Boolean(rec.needs_review),
    trigger_next_supplier: Boolean(rec.trigger_next_supplier),
    confidence: asNumber(rec.confidence),
    reason_codes: reasonCodes,
    summary: asText(rec.summary) || null,
    heuristic:
      rec.heuristic && typeof rec.heuristic === "object"
        ? (rec.heuristic as Record<string, unknown>)
        : null,
    ai:
      rec.ai && typeof rec.ai === "object"
        ? (rec.ai as Record<string, unknown>)
        : null,
    evidence:
      rec.evidence && typeof rec.evidence === "object"
        ? (rec.evidence as Record<string, unknown>)
        : null,
  };
};

const asPriceNumber = (value: unknown) => {
  const text = asText(value).replace(/[^\d.]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const asOptionalPrice = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".");
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  return asPriceNumber(raw);
};

const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value);
const normalizeVariantTextKey = (value: unknown) =>
  asText(value)
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .toLowerCase();

const normalizeShippingClass = (value: unknown) => {
  const code = asText(value).toUpperCase();
  if (!code) return "NOR";
  if (["NOR", "BAT", "LIQ", "PBA"].includes(code)) return code;
  return "NOR";
};

type VariantImageTarget = {
  thumbUrl: string;
  zoomUrl: string;
  fullUrl: string;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeRemoteImageUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
};

const toSumVariantImageUrl = (value: unknown) => {
  const normalized = normalizeRemoteImageUrl(value);
  if (!normalized) return "";
  if (!isHttpUrl(normalized)) return "";
  if (/_sum\.(jpg|jpeg|png|webp|gif|bmp|avif)(?:[?#]|$)/i.test(normalized)) {
    return normalized;
  }
  const [withoutHash, hash = ""] = normalized.split("#");
  const [pathname, query = ""] = withoutHash.split("?");
  if (!/\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(pathname)) {
    return "";
  }
  const withSum = `${pathname}_sum.jpg`;
  const withQuery = query ? `${withSum}?${query}` : withSum;
  return hash ? `${withQuery}#${hash}` : withQuery;
};

const buildCachedImageProxyUrl = (
  sourceUrl: string,
  width: number,
  height: number
) => {
  const normalized = normalizeRemoteImageUrl(sourceUrl);
  if (!normalized || !isHttpUrl(normalized)) return "";
  try {
    const parsed = new URL(normalized);
    if (!isAllowedQueueImageHost(parsed.hostname)) return "";
    const params = new URLSearchParams({
      url: parsed.toString(),
      w: String(width),
      h: String(height),
    });
    return `/api/1688-extractor/image-proxy?${params.toString()}`;
  } catch {
    return "";
  }
};

const buildVariantImageTarget = (input: {
  thumbCandidate?: unknown;
  fullCandidate?: unknown;
}): VariantImageTarget => {
  const fullSource = normalizeRemoteImageUrl(input.fullCandidate);
  const thumbSource =
    normalizeRemoteImageUrl(input.thumbCandidate) ||
    toSumVariantImageUrl(fullSource) ||
    fullSource;
  const resolvedFull = fullSource || thumbSource;
  const thumbUrl =
    buildCachedImageProxyUrl(thumbSource, 88, 88) || thumbSource || "";
  const zoomUrl =
    buildCachedImageProxyUrl(resolvedFull || thumbSource, 300, 300) ||
    resolvedFull ||
    thumbSource ||
    "";
  return {
    thumbUrl,
    zoomUrl,
    fullUrl: resolvedFull || thumbSource || "",
  };
};

const buildVariantGalleryImage = (
  fullCandidate: unknown,
  thumbCandidate?: unknown
): VariantGalleryImage | null => {
  const fullSource =
    normalizeRemoteImageUrl(fullCandidate) ||
    normalizeRemoteImageUrl(thumbCandidate);
  if (!fullSource || !isHttpUrl(fullSource)) return null;
  const thumbSource =
    normalizeRemoteImageUrl(thumbCandidate) ||
    toSumVariantImageUrl(fullSource) ||
    fullSource;
  const thumbUrl =
    buildCachedImageProxyUrl(thumbSource, 112, 112) || thumbSource;
  const fullUrl =
    buildCachedImageProxyUrl(fullSource, 760, 760) || fullSource;
  return {
    thumb_url: thumbUrl,
    full_url: fullUrl,
    url: thumbUrl,
    url_full: fullUrl,
  };
};

const normalizeCachedVariantGalleryImage = (value: unknown) => {
  const row =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return buildVariantGalleryImage(
    asText(row.full_url) ||
      asText(row.url_full) ||
      asText(row.url) ||
      asText(row.image_full_url) ||
      asText(row.image_url) ||
      asText(row.image),
    asText(row.thumb_url) ||
      asText(row.url) ||
      asText(row.image_thumb_url) ||
      asText(row.image_url) ||
      asText(row.image)
  );
};

const collectPayloadGalleryImages = (
  item: Record<string, unknown>,
  combos: VariantCombo[]
) => {
  const out: VariantGalleryImage[] = [];
  const seen = new Set<string>();
  const push = (fullCandidate: unknown, thumbCandidate?: unknown) => {
    const next = buildVariantGalleryImage(fullCandidate, thumbCandidate);
    if (!next) return;
    const key = `${next.url_full}::${next.url}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(next);
  };

  push(item.main_image_1688);

  const imageRows = Array.isArray(item.image_urls_1688)
    ? (item.image_urls_1688 as unknown[])
    : [];
  imageRows.forEach((row) => {
    if (typeof row === "string") {
      push(row, row);
      return;
    }
    if (!row || typeof row !== "object") return;
    const rec = row as Record<string, unknown>;
    push(
      asText(rec.url_full) ||
        asText(rec.full_url) ||
        asText(rec.url) ||
        asText(rec.image_url) ||
        asText(rec.imageUrl) ||
        asText(rec.src) ||
        asText(rec.image),
      asText(rec.thumb_url) ||
        asText(rec.thumbnail) ||
        asText(rec.thumb) ||
        asText(rec.url) ||
        asText(rec.image_url) ||
        asText(rec.imageUrl) ||
        asText(rec.src) ||
        asText(rec.image)
    );
  });

  const variantRows = Array.isArray(item.variant_images_1688)
    ? (item.variant_images_1688 as unknown[])
    : [];
  variantRows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const rec = row as Record<string, unknown>;
    push(
      asText(rec.url_full) || asText(rec.full_url) || asText(rec.url),
      asText(rec.url) || asText(rec.thumb_url) || asText(rec.thumb)
    );
  });

  combos.forEach((combo) => {
    push(
      combo.image_full_url || combo.image_zoom_url || combo.image_url,
      combo.image_thumb_url || combo.image_url
    );
  });

  return out.slice(0, 160);
};

const pickText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const isLikelyNumericTableCell = (value: unknown) => {
  const text = asText(value);
  if (!text) return false;
  return (
    /^-?\d+(?:[.,]\d+)?(?:\s*(?:cm|mm|m|kg|g|cm³|m³|ml|l))?$/i.test(text) ||
    /^\d+(?:[.*xX×]\d+){1,5}(?:\s*(?:cm|mm|m))?$/i.test(text)
  );
};

const buildStructuredWeightKey = (parts: unknown[]) => {
  const tokens = parts
    .map((entry) => normalizeVariantTextKey(entry))
    .filter(Boolean);
  return tokens.join("|");
};

const resolveStructuredRowWeightGrams = (
  rowRec: Record<string, unknown>,
  weightCellCandidate: unknown
) => {
  const candidates = [
    rowRec.weight_grams,
    rowRec.weightGrams,
    rowRec.weight_raw,
    rowRec.weightRaw,
    rowRec.weight,
    weightCellCandidate,
  ];
  for (const candidate of candidates) {
    const grams = asWeightGrams(candidate, { allowUnitless: true });
    if (typeof grams === "number" && Number.isFinite(grams) && grams > 0) {
      return Math.round(grams);
    }
  }
  return null;
};

const buildStructuredVariantWeightLookup = (item: Record<string, unknown>) => {
  const table =
    item.variant_table_1688 && typeof item.variant_table_1688 === "object"
      ? (item.variant_table_1688 as Record<string, unknown>)
      : null;
  const rows = Array.isArray(table?.rows) ? (table!.rows as unknown[]) : [];
  const headers = Array.isArray(table?.headers)
    ? (table!.headers as unknown[]).map((entry) => asText(entry))
    : [];
  const weightIdx = Math.max(
    0,
    headers.findIndex((entry) => /(重量|weight)/i.test(entry))
  );
  const keyToWeights = new Map<string, Set<number>>();
  const collectedWeights: number[] = [];

  const add = (key: string, grams: number) => {
    if (!key) return;
    const bucket = keyToWeights.get(key) || new Set<number>();
    bucket.add(grams);
    keyToWeights.set(key, bucket);
  };

  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const rowRec = row as Record<string, unknown>;
    const rowCells = Array.isArray(rowRec.cells)
      ? (rowRec.cells as unknown[]).map((entry) => asText(entry))
      : [];
    const weightCellCandidate =
      rowCells.length > 0
        ? rowCells[Math.min(weightIdx, rowCells.length - 1)]
        : null;
    const grams = resolveStructuredRowWeightGrams(rowRec, weightCellCandidate);
    if (!grams) return;
    collectedWeights.push(grams);

    const rowName = asText(rowRec.name);
    const primaryCell = asText(rowCells[0]) || rowName;
    const secondaryCell =
      rowCells.length > 1
        ? asText(rowCells[1])
        : rowCells.length === 1
          ? ""
          : "";
    const textCells = rowCells.filter(
      (cell, index) => index !== weightIdx && cell && !isLikelyNumericTableCell(cell)
    );

    [
      buildStructuredWeightKey([primaryCell, secondaryCell]),
      buildStructuredWeightKey([textCells[0], textCells[1]]),
      buildStructuredWeightKey([primaryCell, textCells[1]]),
      buildStructuredWeightKey([rowName, secondaryCell]),
      buildStructuredWeightKey([rowName, primaryCell]),
      buildStructuredWeightKey([primaryCell]),
      buildStructuredWeightKey([rowName]),
      buildStructuredWeightKey(textCells.slice(0, 3)),
      buildStructuredWeightKey(textCells.slice(0, 2)),
    ]
      .filter(Boolean)
      .forEach((key) => add(key, grams));
  });

  const byKey = new Map<string, number>();
  keyToWeights.forEach((weights, key) => {
    const values = Array.from(weights);
    if (values.length !== 1) return;
    byKey.set(key, values[0]);
  });

  return { byKey, weights: collectedWeights };
};

const applyStructuredVariantTableWeights = (
  variations: unknown,
  lookupByKey: Map<string, number>
) => {
  if (!variations || typeof variations !== "object") return variations;
  if (lookupByKey.size === 0) return variations;
  const variationRec = variations as Record<string, unknown>;
  const combos = Array.isArray(variationRec.combos)
    ? (variationRec.combos as unknown[])
    : [];
  if (combos.length === 0) return variations;

  const nextCombos = combos.map((combo) => {
    if (!combo || typeof combo !== "object") return combo;
    const row = { ...(combo as Record<string, unknown>) };
    const existingWeight = asWeightGrams(
      pickText(
        row.weight_grams,
        row.weightGrams,
        row.weight_raw,
        row.weightRaw,
        row.weight,
        (row.details as Record<string, unknown> | null)?.weight,
        (row.details as Record<string, unknown> | null)?.["重量"]
      ),
      { allowUnitless: true }
    );
    if (typeof existingWeight === "number" && Number.isFinite(existingWeight) && existingWeight > 0) {
      row.weight_grams = Math.round(existingWeight);
      if (!asText(row.weight_raw)) row.weight_raw = `${Math.round(existingWeight)}g`;
      if (!asText(row.weightRaw)) row.weightRaw = `${Math.round(existingWeight)}g`;
      return row;
    }

    const t1 = pickText(row.t1_zh, row.t1, row.t1_en);
    const t2 = pickText(row.t2_zh, row.t2, row.t2_en);
    const t3 = pickText(row.t3_zh, row.t3, row.t3_en);
    const candidateKeys = [
      buildStructuredWeightKey([t1, t2, t3]),
      buildStructuredWeightKey([t1, t2]),
      buildStructuredWeightKey([t1]),
      buildStructuredWeightKey([t2]),
      buildStructuredWeightKey([t1, row.t2]),
      buildStructuredWeightKey([row.t1, t2]),
    ];
    const matched = candidateKeys
      .map((key) => lookupByKey.get(key))
      .find((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0);
    if (typeof matched !== "number") return row;

    const grams = Math.round(matched);
    row.weight_grams = grams;
    if (!asText(row.weight_raw)) row.weight_raw = `${grams}g`;
    if (!asText(row.weightRaw)) row.weightRaw = `${grams}g`;
    return row;
  });

  return {
    ...variationRec,
    combos: nextCombos,
  };
};

const buildLangPair = (combo: Record<string, unknown>, rawKey: string, zhKeys: string[], enKeys: string[]) => {
  const raw = pickText(combo[rawKey]);
  let zh = pickText(...zhKeys.map((key) => combo[key]));
  let en = pickText(...enKeys.map((key) => combo[key]));

  if (!zh && !en) {
    if (raw && hasCjk(raw)) zh = raw;
    else if (raw) en = raw;
  } else if (!zh && raw && raw !== en && hasCjk(raw)) {
    zh = raw;
  } else if (!en && raw && raw !== zh && !hasCjk(raw)) {
    en = raw;
  }

  if (!zh && en) zh = en;
  return { raw, zh, en };
};

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

const loadSekPricingContext = async (
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>,
  selectedOfferRaw: unknown
): Promise<SekPricingContext | null> => {
  const selectedOffer =
    selectedOfferRaw && typeof selectedOfferRaw === "object"
      ? (selectedOfferRaw as Record<string, unknown>)
      : null;
  const shippingClass = normalizeShippingClass(
    selectedOffer?._digideal_shipping_class ||
      selectedOffer?._production_shipping_class ||
      selectedOffer?.shipping_class ||
      selectedOffer?.product_shiptype
  );

  const { data: marketRows, error: marketError } = await adminClient
    .from("b2b_pricing_markets")
    .select(
      "market, currency, fx_rate_cny, weight_threshold_g, packing_fee, markup_percent, markup_fixed"
    );
  if (marketError) throw new Error(marketError.message);

  const markets = mapMarketConfigRows(marketRows ?? []);
  const market =
    markets.find((entry) => asText(entry.currency).toUpperCase() === "SEK") ||
    markets.find((entry) => asText(entry.market).toUpperCase() === "SEK") ||
    null;
  if (!market) return null;

  const { data: classRows, error: classError } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .select("market, shipping_class, rate_low, rate_high, base_low, base_high, mult_low, mult_high")
    .eq("market", market.market);
  if (classError) throw new Error(classError.message);

  const shippingClasses = mapShippingClassRows(classRows ?? []);
  const shippingClassRow =
    shippingClasses.find(
      (entry) =>
        asText(entry.market).toUpperCase() === asText(market.market).toUpperCase() &&
        asText(entry.shipping_class).toUpperCase() === shippingClass
    ) ||
    shippingClasses.find(
      (entry) =>
        asText(entry.market).toUpperCase() === asText(market.market).toUpperCase() &&
        asText(entry.shipping_class).toUpperCase() === "NOR"
    ) ||
    null;
  if (!shippingClassRow) return null;

  return {
    market: asText(market.market).toUpperCase(),
    currency: "SEK",
    shipping_class: asText(shippingClassRow.shipping_class).toUpperCase() || "NOR",
    fx_rate_cny: Number(market.fx_rate_cny),
    weight_threshold_g: Number(market.weight_threshold_g),
    packing_fee: Number(market.packing_fee),
    markup_percent: Number(market.markup_percent),
    markup_fixed: Number(market.markup_fixed),
    rate_low: Number(shippingClassRow.rate_low),
    rate_high: Number(shippingClassRow.rate_high),
    base_low: Number(shippingClassRow.base_low),
    base_high: Number(shippingClassRow.base_high),
    mult_low: Number(shippingClassRow.mult_low),
    mult_high: Number(shippingClassRow.mult_high),
  };
};

async function requireSignedIn() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const, user, supabase };
}

async function requireAdmin() {
  const auth = await requireSignedIn();
  if (!auth.ok) {
    return auth;
  }

  const { supabase, user } = auth;

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user, supabase };
}

const normalizeCombos = (
  variations: unknown,
  variantImageByName: Map<string, VariantImageTarget>,
  fallbackWeightGrams: number | null,
  variantWeightByName: Map<string, number>
): VariantCombo[] => {
  const combos = Array.isArray((variations as any)?.combos)
    ? ((variations as any).combos as any[])
    : [];
  return combos.map((combo, index) => {
    const row = combo && typeof combo === "object" ? (combo as Record<string, unknown>) : {};
    const t1 = buildLangPair(
      row,
      "t1",
      ["t1_zh", "t1Zh", "t1_cn", "t1Cn", "t1Chinese"],
      ["t1_en", "t1En", "t1English"]
    );
    const t2 = buildLangPair(
      row,
      "t2",
      ["t2_zh", "t2Zh", "t2_cn", "t2Cn", "t2Chinese"],
      ["t2_en", "t2En", "t2English"]
    );
    const t3 = buildLangPair(
      row,
      "t3",
      ["t3_zh", "t3Zh", "t3_cn", "t3Cn", "t3Chinese"],
      ["t3_en", "t3En", "t3English"]
    );
    const comboNameCandidates = [
      t1.raw,
      t1.zh,
      t1.en,
      t2.raw,
      t2.zh,
      t2.en,
      t3.raw,
      t3.zh,
      t3.en,
    ].filter(Boolean);
    const comboNamesStrict = comboNameCandidates
      .map((entry) => normalizeNameStrict(entry))
      .filter(Boolean);
    const comboNamesLoose = comboNameCandidates
      .map((entry) => normalizeNameLoose(entry))
      .filter(Boolean);
    const matchedImage =
      comboNamesStrict
        .map((key) => variantImageByName.get(key))
        .find(Boolean) ||
      comboNamesLoose
        .map((key) => variantImageByName.get(key))
        .find(Boolean) ||
      null;
    const rowImageTarget = buildVariantImageTarget({
      thumbCandidate: pickText(
        row.image_thumb_url,
        row.imageThumbUrl,
        row.image_url,
        row.imageUrl,
        row.img,
        row.image
      ),
      fullCandidate: pickText(
        row.image_full_url,
        row.imageFullUrl,
        row.image_zoom_url,
        row.imageZoomUrl,
        row.image_url,
        row.imageUrl,
        row.img,
        row.image
      ),
    });
    const imageTarget = matchedImage || rowImageTarget;

    const details =
      row.details && typeof row.details === "object"
        ? (row.details as Record<string, unknown>)
        : {};
    const weightRaw = pickText(
      row.weightRaw,
      row.weight_raw,
      row.weight,
      row.skuWeight,
      row.sku_weight,
      row.weightGrams,
      row.weight_grams,
      details["重量"],
      details.weight
    );
    const tableWeight =
      comboNamesStrict
        .map((key) => variantWeightByName.get(key))
        .find((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0) ??
      comboNamesLoose
        .map((key) => variantWeightByName.get(key))
        .find((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0) ??
      null;
    const weightGrams =
      tableWeight ??
      asWeightGrams(weightRaw, { allowUnitless: true }) ??
      (combos.length <= 1 ? fallbackWeightGrams : null);
    const effectiveWeightRaw =
      weightRaw || (tableWeight ? `${tableWeight}g` : "");

    return {
      index,
      t1: t1.raw,
      t2: t2.raw,
      t3: t3.raw,
      t1_zh: t1.zh || undefined,
      t1_en: t1.en || undefined,
      t2_zh: t2.zh || undefined,
      t2_en: t2.en || undefined,
      t3_zh: t3.zh || undefined,
      t3_en: t3.en || undefined,
      image_url: imageTarget.fullUrl || undefined,
      image_thumb_url: imageTarget.thumbUrl || undefined,
      image_zoom_url: imageTarget.zoomUrl || undefined,
      image_full_url: imageTarget.fullUrl || undefined,
      price_raw: pickText(
        row.priceRaw,
        row.price_raw,
        row.priceText,
        row.price_text,
        row.skuPrice,
        row.sku_price,
        row.salePrice,
        row.sale_price,
        row.price
      ),
      price:
        asNumber(row.price) ??
        asNumber(row.salePrice) ??
        asNumber(row.sale_price) ??
        asNumber(row.skuPrice) ??
        asNumber(row.sku_price) ??
        asPriceNumber(
          pickText(
            row.priceRaw,
            row.price_raw,
            row.priceText,
            row.price_text
          )
        ),
      weight_raw: effectiveWeightRaw || undefined,
      weight_grams: Number.isFinite(Number(weightGrams))
        ? Number(weightGrams)
        : null,
    };
  });
};

const normalizePacks = (raw: unknown) => {
  const text = asText(raw);
  if (!text) return [] as number[];
  const values = text
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 999);
  return Array.from(new Set(values));
};

const normalizeSelectionIndexes = (raw: unknown, maxCount: number) => {
  const values = Array.isArray(raw) ? raw : [];
  const out = values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < maxCount);
  return Array.from(new Set(out));
};

const normalizeComboOverrides = (raw: unknown, comboCount: number) => {
  if (!Array.isArray(raw) || comboCount <= 0) return [] as ComboOverride[];
  const seen = new Set<number>();
  const out: ComboOverride[] = [];

  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const idx = Number((entry as any).index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= comboCount) return;
    if (seen.has(idx)) return;

    const priceRaw = (entry as any).price;
    const weightRaw =
      (entry as any).weight_grams ?? (entry as any).weightGrams ?? (entry as any).weight;
    const price = asOptionalPrice(priceRaw);
    const weightGrams = asWeightGrams(weightRaw, { allowUnitless: true });

    const normalizedPrice =
      typeof price === "number" && Number.isFinite(price) && price > 0
        ? Number(price)
        : null;
    const normalizedWeight =
      typeof weightGrams === "number" && Number.isFinite(weightGrams) && weightGrams > 0
        ? Math.round(Number(weightGrams))
        : null;

    if (normalizedPrice === null && normalizedWeight === null) return;

    out.push({ index: idx, price: normalizedPrice, weight_grams: normalizedWeight });
    seen.add(idx);
  });

  return out;
};

const applyComboOverrides = (combos: VariantCombo[], overrides: ComboOverride[]) => {
  if (!Array.isArray(overrides) || overrides.length === 0) return combos;
  const map = new Map<number, ComboOverride>();
  overrides.forEach((override) => {
    if (!override || typeof override.index !== "number") return;
    map.set(override.index, override);
  });
  return combos.map((combo) => {
    const override = map.get(combo.index);
    if (!override) return combo;
    const next = { ...combo };
    if (typeof override.price === "number" && Number.isFinite(override.price) && override.price > 0) {
      next.price = override.price;
    }
    if (
      typeof override.weight_grams === "number" &&
      Number.isFinite(override.weight_grams) &&
      override.weight_grams > 0
    ) {
      next.weight_grams = override.weight_grams;
    }
    return next;
  });
};

async function loadSelection(adminClient: NonNullable<ReturnType<typeof getAdminClient>>, provider: string, productId: string) {
  const { data, error } = await adminClient
    .from("discovery_production_supplier_selection")
    .select("provider, product_id, selected_offer")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | {
        provider: string;
        product_id: string;
        selected_offer?: Record<string, unknown> | null;
      }
    | null;
}

async function loadPayloadCombos(selection: { selected_offer?: Record<string, unknown> | null }) {
  const selectedOffer = selection?.selected_offer;
  if (!selectedOffer || typeof selectedOffer !== "object") {
    return {
      combos: [] as VariantCombo[],
      type1Label: "",
      type2Label: "",
      type3Label: "",
      galleryImages: [] as VariantGalleryImage[],
      weightReview: null as WeightReviewPayload | null,
    };
  }
  const payloadPath = safeExtractorJsonPath(selectedOffer._production_payload_file_path);
  if (!payloadPath) {
    return {
      combos: [] as VariantCombo[],
      type1Label: "",
      type2Label: "",
      type3Label: "",
      galleryImages: [] as VariantGalleryImage[],
      weightReview: null as WeightReviewPayload | null,
    };
  }
  const payload = await loadJsonFile(payloadPath);
  const item =
    Array.isArray(payload) && payload.length > 0
      ? payload[0]
      : payload && typeof payload === "object" && Array.isArray((payload as any).items)
        ? (payload as any).items[0]
        : payload;
  const itemRecord =
    item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const structuredTableWeightLookup = buildStructuredVariantWeightLookup(itemRecord);
  const baseVariations =
    item && typeof item === "object" ? (item as any).variations : null;
  const variations = applyStructuredVariantTableWeights(
    baseVariations,
    structuredTableWeightLookup.byKey
  );
  const readableSource =
    asText((item as any)?.readable_1688_full) || asText((item as any)?.readable_1688);
  const { weightByName: tableWeightByName, weights: tableWeights } =
    parseVariantWeightTableFromReadableText(readableSource);
  const fallbackWeightGrams = (() => {
    const tableDerived = pickFallbackWeightGrams(
      [...tableWeights, ...structuredTableWeightLookup.weights],
      {
        allowUnitless: true,
      }
    );
    if (typeof tableDerived === "number" && Number.isFinite(tableDerived) && tableDerived > 0) {
      return tableDerived;
    }
    const weights = Array.isArray((item as any)?.product_weights_1688)
      ? ((item as any).product_weights_1688 as unknown[])
      : [];
    const candidates: unknown[] = [
      ...weights,
      (item as any)?.weight_grams,
      (item as any)?.weight,
      (item as any)?.product_weight_1688,
      (variations as any)?.weight,
      (variations as any)?.weight_grams,
      (variations as any)?.defaultWeight,
    ];
    return pickFallbackWeightGrams(candidates);
  })();
  const variantImages = Array.isArray((item as any)?.variant_images_1688)
    ? ((item as any).variant_images_1688 as Array<Record<string, unknown>>)
    : [];
  const variantImageByName = new Map<string, VariantImageTarget>();
  for (const row of variantImages) {
    const strictName = normalizeNameStrict(row?.name);
    const looseName = normalizeNameLoose(row?.name);
    const imageTarget = buildVariantImageTarget({
      thumbCandidate: (row as any)?.url,
      fullCandidate: (row as any)?.url_full || (row as any)?.url,
    });
    if (!imageTarget.thumbUrl && !imageTarget.fullUrl && !imageTarget.zoomUrl) continue;
    if (strictName && !variantImageByName.has(strictName)) {
      variantImageByName.set(strictName, imageTarget);
    }
    if (looseName && !variantImageByName.has(looseName)) {
      variantImageByName.set(looseName, imageTarget);
    }
  }

  const combos = normalizeCombos(
    variations,
    variantImageByName,
    fallbackWeightGrams,
    tableWeightByName
  );
  const galleryImages = collectPayloadGalleryImages(
    item && typeof item === "object" ? (item as Record<string, unknown>) : {},
    combos
  );

  return {
    combos,
    type1Label: asText((variations as any)?.type1Label),
    type2Label: asText((variations as any)?.type2Label),
    type3Label: asText((variations as any)?.type3Label),
    galleryImages,
    weightReview: normalizeWeightReview((item as any)?.weight_review_1688),
  };
}

const normalizeCachedVariantCombo = (value: unknown, index: number): VariantCombo => {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const imageTarget = buildVariantImageTarget({
    thumbCandidate: pickText(rec.image_thumb_url, rec.imageThumbUrl, rec.image_url),
    fullCandidate: pickText(
      rec.image_full_url,
      rec.imageFullUrl,
      rec.image_zoom_url,
      rec.imageZoomUrl,
      rec.image_url
    ),
  });
  return {
    index:
      Number.isInteger(Number(rec.index)) && Number(rec.index) >= 0
        ? Number(rec.index)
        : index,
    t1: asText(rec.t1),
    t2: asText(rec.t2),
    t3: asText(rec.t3),
    t1_zh: asText(rec.t1_zh) || undefined,
    t1_en: asText(rec.t1_en) || undefined,
    t2_zh: asText(rec.t2_zh) || undefined,
    t2_en: asText(rec.t2_en) || undefined,
    t3_zh: asText(rec.t3_zh) || undefined,
    t3_en: asText(rec.t3_en) || undefined,
    image_url: asText(rec.image_full_url) || asText(rec.image_url) || imageTarget.fullUrl || undefined,
    image_thumb_url:
      asText(rec.image_thumb_url) || asText(rec.imageThumbUrl) || imageTarget.thumbUrl || undefined,
    image_zoom_url:
      asText(rec.image_zoom_url) || asText(rec.imageZoomUrl) || imageTarget.zoomUrl || undefined,
    image_full_url:
      asText(rec.image_full_url) || asText(rec.imageFullUrl) || imageTarget.fullUrl || undefined,
    price_raw: asText(rec.price_raw),
    price: asNumber(rec.price),
    weight_raw: asText(rec.weight_raw) || undefined,
    weight_grams: asNumber(rec.weight_grams),
  };
};

const hasMissingVariantEnglish = (combos: VariantCombo[]) =>
  combos.some((combo) =>
    (["t1", "t2", "t3"] as const).some((field) => {
      const zh = asText((combo as any)[`${field}_zh`] || (combo as any)[field]);
      const en = asText((combo as any)[`${field}_en`]);
      return Boolean(zh) && hasCjk(zh) && !en;
    })
  );

const hasSuspiciousCachedWeights = (combos: VariantCombo[]) => {
  const weights = combos
    .map((combo) =>
      typeof combo.weight_grams === "number" && Number.isFinite(combo.weight_grams)
        ? Math.round(combo.weight_grams)
        : null
    )
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (weights.length < 3) return false;

  const unique = Array.from(new Set(weights));
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  // Common bad cache shape from noisy fallback extraction:
  // many variants all set to the same large number (e.g. 1688g).
  if (unique.length === 1 && weights.length >= 5 && unique[0] >= 1500) {
    return true;
  }

  // Strong outlier spread usually means mixed noisy tokens were parsed as weight.
  if (min > 0 && max / min >= 8 && weights.length >= 4) {
    return true;
  }

  return false;
};

const hasMissingCachedWeights = (combos: VariantCombo[]) => {
  if (!Array.isArray(combos) || combos.length === 0) return false;
  const weightedCount = combos.filter((combo) => {
    const grams = Number(combo.weight_grams);
    return Number.isFinite(grams) && grams > 0;
  }).length;
  return weightedCount === 0;
};

const loadVariantCacheFromSelectedOffer = (
  selectedOfferRaw: unknown
): VariantCachePayload | null => {
  const selectedOffer =
    selectedOfferRaw && typeof selectedOfferRaw === "object"
      ? (selectedOfferRaw as Record<string, unknown>)
      : null;
  if (!selectedOffer) return null;
  const cacheRaw =
    selectedOffer._production_variant_cache &&
    typeof selectedOffer._production_variant_cache === "object"
      ? (selectedOffer._production_variant_cache as Record<string, unknown>)
      : null;
  if (!cacheRaw) return null;
  const combosRaw = Array.isArray(cacheRaw.combos) ? cacheRaw.combos : [];
  const combos = combosRaw.map((entry, idx) => normalizeCachedVariantCombo(entry, idx));
  const galleryRaw = Array.isArray(cacheRaw.gallery_images)
    ? cacheRaw.gallery_images
    : [];
  const gallery_images = galleryRaw
    .map((entry) => normalizeCachedVariantGalleryImage(entry))
    .filter((entry): entry is VariantGalleryImage => Boolean(entry));
  if (gallery_images.length === 0) {
    combos.forEach((combo) => {
      const derived = buildVariantGalleryImage(
        combo.image_full_url || combo.image_zoom_url || combo.image_url,
        combo.image_thumb_url || combo.image_url
      );
      if (!derived) return;
      const key = `${derived.url_full}::${derived.url}`;
      const exists = gallery_images.some(
        (entry) => `${entry.url_full}::${entry.url}` === key
      );
      if (!exists) gallery_images.push(derived);
    });
  }
  if (combos.length === 0 && gallery_images.length === 0) return null;
  return {
    cached_at: asText(cacheRaw.cached_at) || new Date().toISOString(),
    payload_file_path: asText(cacheRaw.payload_file_path) || null,
    available_count:
      Number.isInteger(Number(cacheRaw.available_count)) &&
      Number(cacheRaw.available_count) >= 0
        ? Number(cacheRaw.available_count)
        : combos.length,
    type1_label: asText(cacheRaw.type1_label),
    type2_label: asText(cacheRaw.type2_label),
    type3_label: asText(cacheRaw.type3_label),
    combos,
    gallery_images,
    weight_review: normalizeWeightReview(cacheRaw.weight_review),
  };
};

const persistVariantCacheOnSelection = async (
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>,
  provider: string,
  productId: string,
  selectedOfferRaw: unknown,
  cache: VariantCachePayload
) => {
  const selectedOffer =
    selectedOfferRaw && typeof selectedOfferRaw === "object"
      ? { ...(selectedOfferRaw as Record<string, unknown>) }
      : {};
  (selectedOffer as any)._production_variant_cache = cache;
  const { error } = await adminClient
    .from("discovery_production_supplier_selection")
    .update({
      selected_offer: selectedOffer,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
};

const persistVariantCacheOnSuggestionBestEffort = async (
  provider: string,
  productId: string,
  cache: VariantCachePayload
) => {
  if (provider !== PARTNER_SUGGESTION_PROVIDER) return;
  try {
    const suggestion = await loadSuggestionRecord(productId);
    if (!suggestion) return;
    const next = {
      ...suggestion,
      variantCache: {
        cachedAt: cache.cached_at,
        payloadFilePath: cache.payload_file_path,
        availableCount: cache.available_count,
        type1Label: cache.type1_label,
        type2Label: cache.type2_label,
        type3Label: cache.type3_label,
        combos: cache.combos,
        galleryImages: cache.gallery_images,
        weightReview: cache.weight_review || null,
      },
    } as any;
    await saveSuggestionRecord(next);
  } catch {
    // Best effort only.
  }
};

const translateVariantCombosBestEffort = async (combos: VariantCombo[]) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || combos.length === 0) return combos;

  const targets: Array<{ idx: number; field: "t1" | "t2" | "t3"; zh: string }> = [];
  const unique = new Set<string>();
  combos.forEach((combo, idx) => {
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((combo as any)[`${field}_zh`] || (combo as any)[field]);
      const en = asText((combo as any)[`${field}_en`]);
      if (!zh || !hasCjk(zh) || en) return;
      const key = `${field}:${zh}`;
      if (!unique.has(key)) unique.add(key);
      targets.push({ idx, field, zh });
    });
  });
  if (targets.length === 0) return combos;

  // Fill from in-memory cache first (fast path for repeated opens).
  const prefilled = combos.map((combo) => ({ ...combo }));
  let missingCount = 0;
  prefilled.forEach((combo) => {
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((combo as any)[`${field}_zh`] || (combo as any)[field]);
      const en = asText((combo as any)[`${field}_en`]);
      if (!zh || en || !hasCjk(zh)) return;
      const cached = variantTranslationCache.get(zh);
      if (cached) {
        (combo as any)[`${field}_en`] = cached;
      } else {
        missingCount += 1;
      }
    });
  });
  if (missingCount === 0) return prefilled;

  const uniqueTitles = Array.from(
    new Set(
      targets
        .map((t) => t.zh)
        .filter((title) => !variantTranslationCache.has(title))
    )
  ).slice(0, 40);
  if (uniqueTitles.length === 0) return prefilled;
  const prompt = [
    "Translate this title to English, maximum 80 characters.",
    "Return JSON only.",
    'Return format: { "items": [ { "source": "...", "english_title": "..." } ] }',
    "",
    "Titles:",
    ...uniqueTitles.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_VARIANT_TRANSLATE_MODEL,
        "gpt-4o-mini",
        "gpt-5-mini",
        "gpt-5-nano",
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.OPENAI_EDIT_MODEL,
      ]
        .map((v) => asText(v))
        .filter(Boolean)
    )
  );
  let parsed: any = null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
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
      const result = await response.json().catch(() => null);
      parsed = extractJsonFromText(String(result?.choices?.[0]?.message?.content || ""));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!parsed) return prefilled;

  const translations = new Map<string, string>();
  const items = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
  items.forEach((row: any, i: number) => {
    const source = asText(row?.source || uniqueTitles[i]);
    const english = asText(
      row?.english_title ||
        row?.englishTitle ||
        row?.title_en ||
        row?.translation ||
        row?.english
    ).slice(0, 80);
    if (!source || !english) return;
    translations.set(source, english);
    translations.set(normalizeVariantTextKey(source), english);
    variantTranslationCache.set(source, english);
    variantTranslationCache.set(normalizeVariantTextKey(source), english);
  });
  if (translations.size === 0) return prefilled;

  return prefilled.map((combo) => {
    const next = { ...combo };
    (["t1", "t2", "t3"] as const).forEach((field) => {
      const zh = asText((next as any)[`${field}_zh`] || (next as any)[field]);
      const en = asText((next as any)[`${field}_en`]);
      if (!zh || en || !hasCjk(zh)) return;
      const translated = translations.get(zh) || translations.get(normalizeVariantTextKey(zh));
      if (translated) (next as any)[`${field}_en`] = translated;
    });
    return next;
  });
};

export async function GET(request: NextRequest) {
  const auth = await requireSignedIn();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const provider = asText(request.nextUrl.searchParams.get("provider")).toLowerCase();
  const productId = asText(request.nextUrl.searchParams.get("product_id"));
  const skipTranslation = asText(request.nextUrl.searchParams.get("skipTranslation")) === "1";
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  try {
    const selection = await loadSelection(adminClient, provider, productId);
    if (!selection) {
      return NextResponse.json({ error: "No selected supplier found." }, { status: 404 });
    }
    const selectedOffer =
      selection.selected_offer && typeof selection.selected_offer === "object"
        ? selection.selected_offer
        : {};
    const payloadFilePath = safeExtractorJsonPath(
      (selectedOffer as any)?._production_payload_file_path
    );
    const cached = loadVariantCacheFromSelectedOffer(selectedOffer);
    const cachedWeightsSuspicious = hasSuspiciousCachedWeights(cached?.combos || []);
    const cachedWeightsMissing = hasMissingCachedWeights(cached?.combos || []);
    const cacheMatchesPayload =
      Boolean(cached) &&
      asText(cached?.payload_file_path || "") === asText(payloadFilePath || "") &&
      !cachedWeightsSuspicious &&
      !cachedWeightsMissing;

    const payloadLoaded = cacheMatchesPayload
      ? null
      : await loadPayloadCombos({ selected_offer: selectedOffer as Record<string, unknown> });
    const sourceCombos =
      cacheMatchesPayload && cached
        ? cached.combos
        : payloadLoaded?.combos && payloadLoaded.combos.length > 0
          ? payloadLoaded.combos
          : cached?.combos || [];
    const type1Label =
      (cacheMatchesPayload ? cached?.type1_label : payloadLoaded?.type1Label) ||
      cached?.type1_label ||
      "";
    const type2Label =
      (cacheMatchesPayload ? cached?.type2_label : payloadLoaded?.type2Label) ||
      cached?.type2_label ||
      "";
    const type3Label =
      (cacheMatchesPayload ? cached?.type3_label : payloadLoaded?.type3Label) ||
      cached?.type3_label ||
      "";
    const galleryImages =
      (cacheMatchesPayload ? cached?.gallery_images : payloadLoaded?.galleryImages) ||
      cached?.gallery_images ||
      [];
    const weightReview =
      (cacheMatchesPayload ? cached?.weight_review : payloadLoaded?.weightReview) ||
      cached?.weight_review ||
      null;

    const translatedCombos =
      skipTranslation || !hasMissingVariantEnglish(sourceCombos)
        ? sourceCombos
        : await translateVariantCombosBestEffort(sourceCombos);

    const cachedGalleryCount = Array.isArray(cached?.gallery_images)
      ? cached.gallery_images.length
      : 0;
    const hasCacheablePayload =
      translatedCombos.length > 0 ||
      galleryImages.length > 0 ||
      Boolean(weightReview);
    const shouldPersistCache =
      hasCacheablePayload &&
      (!cacheMatchesPayload ||
        translatedCombos !== sourceCombos ||
        cachedGalleryCount !== galleryImages.length ||
        asText(cached?.type1_label || "") !== asText(type1Label) ||
        asText(cached?.type2_label || "") !== asText(type2Label) ||
        asText(cached?.type3_label || "") !== asText(type3Label) ||
        JSON.stringify(cached?.weight_review || null) !== JSON.stringify(weightReview));
    if (shouldPersistCache) {
      const cachePayload: VariantCachePayload = {
        cached_at: new Date().toISOString(),
        payload_file_path: payloadFilePath || null,
        available_count: translatedCombos.length,
        type1_label: type1Label,
        type2_label: type2Label,
        type3_label: type3Label,
        combos: translatedCombos,
        gallery_images: galleryImages,
        weight_review: weightReview,
      };
      await persistVariantCacheOnSelection(
        adminClient,
        provider,
        productId,
        selectedOffer,
        cachePayload
      );
      await persistVariantCacheOnSuggestionBestEffort(provider, productId, cachePayload);
    }

    const saved = (selectedOffer as any)?._production_variant_selection;
    const savedIndexes = normalizeSelectionIndexes(
      saved && typeof saved === "object" ? (saved as any).selected_combo_indexes : [],
      translatedCombos.length
    );
    const savedOverrides = normalizeComboOverrides(
      saved && typeof saved === "object" ? (saved as any).combo_overrides : [],
      translatedCombos.length
    );
    const decoratedCombos = applyComboOverrides(translatedCombos, savedOverrides);
    const savedPacksText =
      saved && typeof saved === "object" ? asText((saved as any).packs_text) : "";
    const packsText =
      savedPacksText ||
      asText((selectedOffer as any)?._production_variant_packs_text);
    const sekPricingContext = await loadSekPricingContext(adminClient, selectedOffer);

    return NextResponse.json({
      provider,
      product_id: productId,
      type1_label: type1Label,
      type2_label: type2Label,
      type3_label: type3Label,
      available_count: decoratedCombos.length,
      combos: decoratedCombos,
      selected_combo_indexes: savedIndexes,
      packs_text: packsText,
      gallery_images: galleryImages,
      weight_review: weightReview,
      sek_pricing_context: sekPricingContext,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load variants." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = asText((body as any).provider).toLowerCase();
  const productId = asText((body as any).product_id);
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  try {
    const selection = await loadSelection(adminClient, provider, productId);
    if (!selection) {
      return NextResponse.json({ error: "No selected supplier found." }, { status: 404 });
    }

    const selectedOffer =
      selection.selected_offer && typeof selection.selected_offer === "object"
        ? { ...selection.selected_offer }
        : {};
    const payloadFilePath = safeExtractorJsonPath(
      (selectedOffer as any)?._production_payload_file_path
    );
    const cached = loadVariantCacheFromSelectedOffer(selectedOffer);
    const cachedWeightsSuspicious = hasSuspiciousCachedWeights(cached?.combos || []);
    const cachedWeightsMissing = hasMissingCachedWeights(cached?.combos || []);
    const cacheMatchesPayload =
      Boolean(cached) &&
      asText(cached?.payload_file_path || "") === asText(payloadFilePath || "") &&
      !cachedWeightsSuspicious &&
      !cachedWeightsMissing;
    const payloadLoaded = cacheMatchesPayload
      ? null
      : await loadPayloadCombos({ selected_offer: selectedOffer as Record<string, unknown> });

    const combos =
      cacheMatchesPayload && cached
        ? cached.combos
        : payloadLoaded?.combos && payloadLoaded.combos.length > 0
          ? payloadLoaded.combos
          : cached?.combos || [];
    const type1Label =
      (cacheMatchesPayload ? cached?.type1_label : payloadLoaded?.type1Label) ||
      cached?.type1_label ||
      "";
    const type2Label =
      (cacheMatchesPayload ? cached?.type2_label : payloadLoaded?.type2Label) ||
      cached?.type2_label ||
      "";
    const type3Label =
      (cacheMatchesPayload ? cached?.type3_label : payloadLoaded?.type3Label) ||
      cached?.type3_label ||
      "";
    const galleryImages =
      (cacheMatchesPayload ? cached?.gallery_images : payloadLoaded?.galleryImages) ||
      cached?.gallery_images ||
      [];
    const weightReview =
      (cacheMatchesPayload ? cached?.weight_review : payloadLoaded?.weightReview) ||
      cached?.weight_review ||
      null;

    const selectedIndexes = normalizeSelectionIndexes(
      (body as any).selected_combo_indexes,
      combos.length
    );
    const packsText = asText((body as any).packs_text);
    const packs = normalizePacks(packsText);
    const overridesProvided = Object.prototype.hasOwnProperty.call(body as any, "combo_overrides");
    const comboOverrides = overridesProvided
      ? normalizeComboOverrides((body as any).combo_overrides, combos.length)
      : normalizeComboOverrides(
          (selectedOffer as any)?._production_variant_selection &&
            typeof (selectedOffer as any)._production_variant_selection === "object"
            ? (selectedOffer as any)._production_variant_selection.combo_overrides
            : [],
          combos.length
        );
    const overridesMap = new Map<number, ComboOverride>();
    comboOverrides.forEach((override) => overridesMap.set(override.index, override));

    const selectionPayload = {
      selected_combo_indexes: selectedIndexes,
      selected_count: selectedIndexes.length,
      available_count: combos.length,
      packs_text: packsText,
      packs,
      type1_label: type1Label,
      type2_label: type2Label,
      type3_label: type3Label,
      combo_overrides: comboOverrides,
      updated_at: new Date().toISOString(),
    };

    (selectedOffer as any)._production_variant_selection = selectionPayload;
    (selectedOffer as any)._production_variant_available_count = combos.length;
    (selectedOffer as any)._production_variant_selected_count = selectedIndexes.length;
    (selectedOffer as any)._production_variant_packs = packs;
    (selectedOffer as any)._production_variant_packs_text = packsText;
    if (combos.length > 0) {
      (selectedOffer as any)._production_variant_cache = {
        cached_at: new Date().toISOString(),
        payload_file_path: payloadFilePath || null,
        available_count: combos.length,
        type1_label: type1Label,
        type2_label: type2Label,
        type3_label: type3Label,
        combos,
        gallery_images: galleryImages,
        weight_review: weightReview,
      } satisfies VariantCachePayload;
    }

    const { error: updateError } = await adminClient
      .from("discovery_production_supplier_selection")
      .update({
        selected_offer: selectedOffer,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider)
      .eq("product_id", productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (combos.length > 0) {
      await persistVariantCacheOnSuggestionBestEffort(provider, productId, {
        cached_at: new Date().toISOString(),
        payload_file_path: payloadFilePath || null,
        available_count: combos.length,
        type1_label: type1Label,
        type2_label: type2Label,
        type3_label: type3Label,
        combos,
        gallery_images: galleryImages,
        weight_review: weightReview,
      });
    }

    // Deals managers: when a variant is chosen, store purchase_price + weight on the deal so we
    // can compute the estimated rerun price immediately (without locking the supplier URL).
    let digidealUpdateError: string | null = null;
    let digidealUpdated: { purchase_price: number | null; weight_grams: number | null } | null =
      null;
    if (DEALS_SUPPLIER_PROVIDERS.has(provider)) {
      const dealsProvider = resolveDealsProvider(provider);
      const providerConfig = getDealsProviderConfig(dealsProvider);
      const productsTable = providerConfig.productsTable;
      const productIdValue: string | number = /^\d+$/.test(productId)
        ? Number(productId)
        : productId;
      const { data: digidealRow, error: digidealRowError } = await adminClient
        .from(productsTable)
        .select('product_id, "1688_URL", 1688_url')
        .eq("product_id", productIdValue)
        .maybeSingle();
      if (digidealRowError) {
        digidealUpdateError = digidealRowError.message;
      } else {
        const lockedUrl =
          typeof (digidealRow as any)?.["1688_URL"] === "string"
            ? String((digidealRow as any)["1688_URL"]).trim()
            : typeof (digidealRow as any)?.["1688_url"] === "string"
              ? String((digidealRow as any)["1688_url"]).trim()
              : "";
        const isLocked = Boolean(lockedUrl);
        if (!isLocked) {
          if (selectedIndexes.length === 0) {
            const { data: updatedRow, error: updateRowError } = await adminClient
              .from(productsTable)
              .update({ purchase_price: null, weight_grams: null, weight_kg: null })
              .eq("product_id", productIdValue)
              .select("product_id, purchase_price, weight_grams")
              .maybeSingle();
            if (updateRowError) {
              digidealUpdateError = updateRowError.message;
            } else if (updatedRow) {
              digidealUpdated = {
                purchase_price: typeof (updatedRow as any)?.purchase_price === "number"
                  ? (updatedRow as any).purchase_price
                  : null,
                weight_grams: typeof (updatedRow as any)?.weight_grams === "number"
                  ? (updatedRow as any).weight_grams
                  : null,
              };
            }
          } else {
            const chosenIndex = selectedIndexes[0];
            const chosen = combos[chosenIndex] ?? null;
            const override = overridesMap.get(chosenIndex);
            const overridePrice =
              override &&
              typeof override.price === "number" &&
              Number.isFinite(override.price) &&
              override.price > 0
                ? Number(override.price)
                : null;
            const basePrice =
              chosen &&
              typeof chosen.price === "number" &&
              Number.isFinite(chosen.price)
                ? Number(chosen.price)
                : asPriceNumber(chosen?.price_raw);
            const price = overridePrice ?? basePrice;

            const overrideWeight =
              override &&
              typeof override.weight_grams === "number" &&
              Number.isFinite(override.weight_grams) &&
              override.weight_grams > 0
                ? Number(override.weight_grams)
                : null;
            const baseWeight =
              chosen &&
              typeof chosen.weight_grams === "number" &&
              Number.isFinite(chosen.weight_grams)
                ? Number(chosen.weight_grams)
                : asWeightGrams(chosen?.weight_raw, { allowUnitless: true });
            const weightGramsRaw = overrideWeight ?? baseWeight;
            const packMultiplier = packs.length > 0 ? Math.min(...packs) : 1;
            const scaledPrice =
              price !== null && price > 0
                ? Number((price * packMultiplier).toFixed(4))
                : null;
            const scaledWeightGramsRaw =
              weightGramsRaw !== null && weightGramsRaw > 0
                ? weightGramsRaw * packMultiplier
                : null;
            if (
              scaledPrice !== null &&
              scaledPrice > 0 &&
              scaledWeightGramsRaw !== null &&
              scaledWeightGramsRaw > 0
            ) {
              const weightGrams = Math.round(scaledWeightGramsRaw);
              const weightKg = Number((weightGrams / 1000).toFixed(3));
              const { data: updatedRow, error: updateRowError } = await adminClient
                .from(productsTable)
                .update({
                  purchase_price: scaledPrice,
                  weight_grams: weightGrams,
                  weight_kg: weightKg,
                })
                .eq("product_id", productIdValue)
                .select("product_id, purchase_price, weight_grams")
                .maybeSingle();
              if (updateRowError) {
                digidealUpdateError = updateRowError.message;
              } else if (updatedRow) {
                digidealUpdated = {
                  purchase_price: typeof (updatedRow as any)?.purchase_price === "number"
                    ? (updatedRow as any).purchase_price
                    : null,
                  weight_grams: typeof (updatedRow as any)?.weight_grams === "number"
                    ? (updatedRow as any).weight_grams
                    : null,
                };
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      provider,
      product_id: productId,
      available_count: combos.length,
      selected_combo_indexes: selectedIndexes,
      selected_count: selectedIndexes.length,
      packs,
      packs_text: packsText,
      digideal: digidealUpdated,
      digideal_update_error: digidealUpdateError,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save variants." },
      { status: 500 }
    );
  }
}
