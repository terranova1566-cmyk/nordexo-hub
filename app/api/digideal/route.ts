import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getDealsProviderConfig,
  resolveDealsProvider,
} from "@/lib/deals/provider";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const SUPABASE_RANGE_PAGE_SIZE = 1000;
const PRODUCT_SELECT =
  "product_id, listing_title, title_h1, product_url, product_slug, prodno, seller_name, seller_orgnr, status, last_price, last_original_price, last_discount_percent, last_you_save_kr, last_purchased_count, last_instock_qty, last_available_qty, last_reserved_qty, primary_image_url, image_urls, first_seen_at, last_seen_at, description_html, bullet_points_text, google_taxonomy_id, google_taxonomy_path, sold_today, sold_7d, digideal_rerun_added, digideal_rerun_partner_comment, digideal_rerun_status, digideal_add_rerun, digideal_add_rerun_at, digideal_add_rerun_comment, shipping_cost_kr, identical_spu, digideal_group_id, digideal_group_count";
const PRODUCT_SELECT_LETSDEAL = `${PRODUCT_SELECT}, subtitle`;

const SELLER_GROUPS = [
  {
    display: "GadgetBay",
    variants: ["GadgetBay Limited", "Gadget Bay Limited", "GadgetBay", "Gadget Bay"],
  },
  {
    display: "Nordexo",
    variants: [
      "Nordexo",
      "Nordexo Limited",
      "Nordexo Limited77795751",
      "Blank Space Limited",
    ],
  },
  {
    display: "Newtech Trading",
    variants: [
      "Newtech Trading Electronics Limited",
      "Newtech Trading Electronics Limited61275193",
    ],
  },
  {
    display: "TurboDeals",
    variants: [
      "Turbo Inc Limited2608850",
      "TurboDealz",
      "Turbo Dealz",
      "Turbo dealz",
      "TurboDeals",
      "Turbo Deals",
      "Turbodealz",
    ],
  },
  {
    display: "Nord Trading Limited",
    variants: ["Nord Trading Limited", "NordTradingLimited OU"],
  },
];

const getSellerGroup = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return SELLER_GROUPS.find((group) => {
    if (group.display.toLowerCase() === normalized) return true;
    return group.variants.some((variant) => {
      const variantValue = variant.toLowerCase();
      if (variantValue === normalized) return true;
      if (normalized.startsWith(variantValue)) {
        const suffix = normalized.slice(variantValue.length);
        return suffix.length > 0 && /^[\\s\\d-]+$/.test(suffix);
      }
      return false;
    });
  });
};

const normalizeSellerName = (value?: string | null) => {
  if (!value) return value ?? null;
  const group = getSellerGroup(value);
  return group ? group.display : value.trim();
};

const escapeLikeToken = (value: string) =>
  value.replace(/%/g, "\\%").replace(/_/g, "\\_");

const buildSearchTokens = (query: string) =>
  query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `%${escapeLikeToken(token)}%`);

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCategorySelections = (value: string | null): CategorySelection[] => {
  if (!value) return [];
  return value
    .split("|")
    .map((entry) => {
      const [levelRaw, ...rest] = entry.split(":");
      const level = levelRaw as CategorySelection["level"];
      const encodedValue = rest.join(":");
      if (level !== "l1" && level !== "l2" && level !== "l3") return null;
      if (!encodedValue) return null;
      return { level, value: safeDecode(encodedValue) };
    })
    .filter((entry): entry is CategorySelection => Boolean(entry));
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(numeric) ? numeric : null;
};

const SHIPPING_CLASSES = new Set(["NOR", "BAT", "PBA", "LIQ"]);

const normalizeShippingClass = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) return null;
  return SHIPPING_CLASSES.has(normalized) ? normalized : null;
};

const normalizeDisplayedSales = (value: unknown, fakeSalesOffset: number) => {
  const numeric = toNumber(value) ?? 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric - fakeSalesOffset));
};

const toRawSalesThreshold = (
  displayedThreshold: number,
  fakeSalesOffset: number
) => Math.max(0, Math.ceil(displayedThreshold + fakeSalesOffset));

const DIGIDEAL_SUPPLIER_SHARE_TARGET_MAX = 0.47;
const DIGIDEAL_SUPPLIER_SHARE_FLOOR = 0.4;
const DIGIDEAL_MAX_MARGIN_PERCENT = 50;

type NumericRange = { min: number | null; max: number | null };

const normalizeNumericRange = (
  minValue: number | null,
  maxValue: number | null,
  options?: { clampMin?: number; clampMax?: number }
): NumericRange | null => {
  const clampMin =
    typeof options?.clampMin === "number" ? options.clampMin : null;
  const clampMax =
    typeof options?.clampMax === "number" ? options.clampMax : null;

  let min = minValue;
  let max = maxValue;

  if (min !== null && Number.isFinite(min) && clampMin !== null) {
    min = Math.max(clampMin, min);
  }
  if (max !== null && Number.isFinite(max) && clampMin !== null) {
    max = Math.max(clampMin, max);
  }
  if (min !== null && Number.isFinite(min) && clampMax !== null) {
    min = Math.min(clampMax, min);
  }
  if (max !== null && Number.isFinite(max) && clampMax !== null) {
    max = Math.min(clampMax, max);
  }

  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
};

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.min(Math.max(value, minValue), maxValue);

type MarketConfig = {
  market: string;
  currency: string;
  fx_rate_cny: number;
  weight_threshold_g: number;
  packing_fee: number;
  markup_percent: number;
  markup_fixed: number;
};

type ShippingConfig = {
  shipping_class: string;
  rate_low: number;
  rate_high: number;
  base_low: number;
  base_high: number;
  mult_low: number;
  mult_high: number;
};

type DigidealDetailRow = {
  product_id: string;
  purchase_price: number | null;
  weight_kg: number | null;
  weight_grams: number | null;
  shipping_class?: string | null;
  shipping_class_confidence?: number | null;
  shipping_class_source?: string | null;
  shipping_class_model?: string | null;
  shipping_class_reason?: string | null;
  shipping_class_classified_at?: string | null;
  "1688_URL"?: string | null;
  "1688_url"?: string | null;
};

type SupplierSearchRow = {
  provider: string;
  product_id: string;
  offers: unknown;
};

type SupplierSelectionRow = {
  provider: string;
  product_id: string;
  selected_offer: unknown;
};

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parseImageUrls = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toText(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => toText(entry))
          .filter(Boolean);
      }
    } catch {
      return [raw];
    }
    return [raw];
  }
  return [];
};

const isLetsDealFavoriteIcon = (url: string) => {
  const normalized = toText(url).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("/compiled/js/components/favourite-button/") ||
    normalized.includes("ld-favorite-outline")
  );
};

const sanitizeDealImageFields = (product: Record<string, unknown>) => {
  const primaryRaw = toText(product.primary_image_url);
  const parsedImages = parseImageUrls(product.image_urls);
  const fallbackCandidates = [
    toText(product.product_image_url),
    toText(product.listing_image_url),
  ].filter(Boolean);

  const allCandidates = [primaryRaw, ...parsedImages, ...fallbackCandidates].filter(Boolean);
  const deduped = Array.from(new Set(allCandidates));
  const usable = deduped.filter((url) => !isLetsDealFavoriteIcon(url));
  const finalPrimary = usable[0] ?? deduped[0] ?? null;

  return {
    primaryImageUrl: finalPrimary,
    imageUrls: usable.length > 0 ? usable : deduped,
  };
};

const loadAllRows = async <T,>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: any }>
) => {
  const rows: T[] = [];
  let from = 0;

  // Safety guard: avoid infinite loops if paging behaves unexpectedly.
  for (let page = 0; page < 250; page += 1) {
    const to = from + SUPABASE_RANGE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { data: null as T[] | null, error };

    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < SUPABASE_RANGE_PAGE_SIZE) break;
    from += SUPABASE_RANGE_PAGE_SIZE;
  }

  return { data: rows, error: null as any };
};

const loadPricedProductIds = async (supabase: any, productsTable: string) => {
  const { data, error } = await loadAllRows<{ product_id?: string | null }>((from, to) =>
    supabase
      .from(productsTable)
      .select("product_id")
      .gt("purchase_price", 0)
      .order("product_id", { ascending: true })
      .range(from, to)
  );

  if (error) return { ids: [] as string[], error };

  const ids = new Set<string>();
  (data ?? []).forEach((row) => {
    const id = String(row?.product_id ?? "").trim();
    if (!id) return;
    ids.add(id);
  });

  return { ids: Array.from(ids), error: null as any };
};

const loadManualSupplierStateProductIds = async (
  supabase: any,
  productsTable: string,
  productIds: string[] | null
) => {
  if (productIds && productIds.length === 0) return { ids: [] as string[], error: null as any };

  const primarySelect =
    'product_id, purchase_price, weight_kg, weight_grams, shipping_class, shipping_class_confidence, shipping_class_source, shipping_class_model, shipping_class_reason, shipping_class_classified_at, "1688_URL"';
  const fallbackSelect =
    "product_id, purchase_price, weight_kg, weight_grams, shipping_class, shipping_class_confidence, shipping_class_source, shipping_class_model, shipping_class_reason, shipping_class_classified_at, 1688_url";

  const loadPrimary = () =>
    loadAllRows<DigidealDetailRow>((from, to) => {
      let query = supabase.from(productsTable).select(primarySelect);
      if (productIds) {
        query = query.in("product_id", productIds);
      }
      return query.order("product_id", { ascending: true }).range(from, to);
    });

  const loadFallback = () =>
    loadAllRows<DigidealDetailRow>((from, to) => {
      let query = supabase.from(productsTable).select(fallbackSelect);
      if (productIds) {
        query = query.in("product_id", productIds);
      }
      return query.order("product_id", { ascending: true }).range(from, to);
    });

  let { data, error } = await loadPrimary();

  if (error?.message && String(error.message).toLowerCase().includes("1688")) {
    ({ data, error } = await loadFallback());
  }

  if (error) return { ids: [] as string[], error };

  const ids = new Set<string>();
  (data ?? []).forEach((row) => {
    const id = String(row?.product_id ?? "").trim();
    if (!id) return;

    const url = toText((row as any)["1688_URL"] ?? (row as any)["1688_url"]);
    const purchasePrice = toNumber((row as any).purchase_price);
    const weightKg = toNumber((row as any).weight_kg);
    const weightGrams = toNumber((row as any).weight_grams);

    const hasManualUrl = Boolean(url);
    const hasManualPrice = purchasePrice !== null && purchasePrice > 0;
    const hasManualWeight =
      (weightKg !== null && weightKg > 0) ||
      (weightGrams !== null && weightGrams > 0);

    if (hasManualUrl || hasManualPrice || hasManualWeight) {
      ids.add(id);
    }
  });

  return { ids: Array.from(ids), error: null as any };
};

const resolveClassConfig = (
  classMap: Map<string, ShippingConfig>,
  shippingClass: string
) => classMap.get(shippingClass) ?? classMap.get("NOR") ?? null;

const normalizeWeightKg = (weightKg: number | null, weightGrams: number | null) => {
  if (weightKg !== null && weightKg > 0) return weightKg;
  if (weightGrams !== null && weightGrams > 0) return weightGrams / 1000;
  return null;
};

const stripHtml = (value: string) =>
  value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ");

const toPgInList = (values: string[]) =>
  `(${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(",")})`;

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysSinceDate = (isoDate: string | null) => {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const time = date.getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / MS_PER_DAY);
};

const daysSinceTimestamp = (timestamp: string | null) => {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / MS_PER_DAY);
};

const normalize1688Url = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Most 1688 links are stable up to `.html`; everything after is typically tracking params.
  const htmlMatch = trimmed.match(/\.html/i);
  if (htmlMatch?.index !== undefined) {
    return trimmed.slice(0, htmlMatch.index + htmlMatch[0].length);
  }

  // Fallback: strip query/hash for non-.html URLs.
  const cut = trimmed.split(/[?#]/)[0];
  return cut.trim();
};

const addDaysIsoDate = (value: string, days: number) => {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const extractShippingCost = (value?: string | null) => {
  if (!value) return null;
  const text = stripHtml(value);
  const patterns = [
    /\+\s*(\d+(?:[.,]\d+)?)\s*kr\s*frakt/i,
    /frakt\s*:?\s*(\d+(?:[.,]\d+)?)\s*kr/i,
    /(\d+(?:[.,]\d+)?)\s*kr\s*frakt/i,
    /\+\s*(\d+(?:[.,]\d+)?)\s*kr\s*shipping/i,
    /shipping\s*:?\s*(\d+(?:[.,]\d+)?)\s*kr/i,
    /(\d+(?:[.,]\d+)?)\s*kr\s*shipping/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const numeric = Number(match[1].replace(",", "."));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
};

type RerunCostBreakdown = {
  productCostKr: number;
  shippingCostKr: number;
  totalCost: number;
};

const computeRerunCostBreakdown = (
  purchaseCny: number,
  weightKg: number,
  market: MarketConfig,
  classConfig: ShippingConfig
): RerunCostBreakdown | null => {
  if (!Number.isFinite(purchaseCny) || purchaseCny <= 0) return null;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;

  const weightG = weightKg * 1000;
  const useLow = weightG <= market.weight_threshold_g;
  const rate = useLow ? classConfig.rate_low : classConfig.rate_high;
  const base = useLow ? classConfig.base_low : classConfig.base_high;
  const mult = useLow ? classConfig.mult_low : classConfig.mult_high;
  const shippingCny = weightG * mult * rate + base;
  const shippingLocal = shippingCny * market.fx_rate_cny + market.packing_fee;
  const stockLocal = purchaseCny * market.fx_rate_cny;
  const totalCost = stockLocal + shippingLocal;

  if (!Number.isFinite(stockLocal) || !Number.isFinite(shippingLocal) || !Number.isFinite(totalCost)) {
    return null;
  }
  if (totalCost <= 0) return null;

  return {
    productCostKr: stockLocal,
    shippingCostKr: shippingLocal,
    totalCost,
  };
};

const computeEstimatedPrice = (
  purchaseCny: number,
  weightKg: number,
  market: MarketConfig,
  classConfig: ShippingConfig
) => {
  const breakdown = computeRerunCostBreakdown(
    purchaseCny,
    weightKg,
    market,
    classConfig
  );
  if (!breakdown) return null;

  const totalCost = breakdown.totalCost;
  const rawPrice = totalCost * (1 + market.markup_percent) + market.markup_fixed;
  const price =
    market.currency === "EUR"
      ? Number(rawPrice.toFixed(2))
      : Math.round(rawPrice);
  return Number.isFinite(price) ? price : null;
};

const loadLastSoldAtMap = async (
  supabase: any,
  productDailyTable: string,
  dailyCountColumn: "purchased_count" | "bought_count"
) => {
  const lastSoldAt = new Map<string, string | null>();
  const chunkSize = 1000;
  let offset = 0;

  let currentProductId = "";
  let prevCount: number | null = null;
  let lastSoldDate: string | null = null;

  while (true) {
    const { data, error } = await supabase
      .from(productDailyTable)
      .select(`product_id, scrape_date, ${dailyCountColumn}`)
      .order("product_id", { ascending: true })
      .order("scrape_date", { ascending: true })
      .range(offset, offset + chunkSize - 1);

    if (error) {
      return { map: lastSoldAt, error };
    }

    const rows = (data ?? []) as Array<{
      product_id?: string | null;
      scrape_date?: string | null;
      purchased_count?: number | null;
      bought_count?: number | null;
    }>;

    if (rows.length === 0) break;

    for (const row of rows) {
      const productId = typeof row.product_id === "string" ? row.product_id : "";
      const scrapeDate =
        typeof row.scrape_date === "string" ? row.scrape_date : null;
      const purchased =
        typeof (row as any)[dailyCountColumn] === "number"
          ? Number((row as any)[dailyCountColumn])
          : (row as any)[dailyCountColumn] === null ||
              (row as any)[dailyCountColumn] === undefined
            ? null
            : Number((row as any)[dailyCountColumn]);

      if (!productId) continue;

      if (productId !== currentProductId) {
        if (currentProductId) {
          lastSoldAt.set(currentProductId, lastSoldDate);
        }
        currentProductId = productId;
        prevCount = null;
        lastSoldDate = null;
      }

      if (prevCount !== null && purchased !== null && scrapeDate) {
        const delta = purchased - prevCount;
        if (Number.isFinite(delta) && delta > 0) {
          lastSoldDate = scrapeDate;
        }
      }

      // Match the view logic: a NULL breaks delta detection until a non-NULL appears again.
      prevCount = purchased;
    }

    if (rows.length < chunkSize) break;
    offset += chunkSize;
  }

  if (currentProductId) {
    lastSoldAt.set(currentProductId, lastSoldDate);
  }

  return { map: lastSoldAt, error: null };
};

type LetsDealFallbackPrice = {
  currentPrice: number;
  previousPrice: number;
  scrapeDate: string | null;
  scrapedAt: string | null;
};

type LetsDealDealUrlFallback = {
  dealUrl: string;
  scrapeDate: string | null;
  scrapedAt: string | null;
};

const extractLetsDealSlugFromUrl = (value: unknown) => {
  const raw = toText(value);
  if (!raw) return null;
  const clean = raw.split(/[?#]/)[0];
  const match = clean.match(/\/deal\/[^/]+\/([^/]+)/i);
  if (!match?.[1]) return null;
  const slug = match[1].trim();
  return slug || null;
};

const toHumanReadableSlug = (value: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const words = decoded
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const loadLetsDealFallbackPriceMap = async (
  supabase: any,
  productIds: string[]
) => {
  const map = new Map<string, LetsDealFallbackPrice>();
  const uniqueProductIds = Array.from(
    new Set(
      productIds
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
  if (uniqueProductIds.length === 0) {
    return { map, error: null };
  }

  const chunkSize = 50;
  const pageSize = 1000;
  const maxPagesPerChunk = 20;

  for (let start = 0; start < uniqueProductIds.length; start += chunkSize) {
    const chunk = uniqueProductIds.slice(start, start + chunkSize);
    const unresolved = new Set(chunk);
    let offset = 0;
    let pagesRead = 0;

    while (unresolved.size > 0) {
      const { data, error } = await supabase
        .from("letsdeal_product_daily")
        .select(
          "product_id, current_price_kr, previous_price_kr, scrape_date, scraped_at"
        )
        .in("product_id", chunk)
        .not("current_price_kr", "is", null)
        .not("previous_price_kr", "is", null)
        .order("product_id", { ascending: true })
        .order("scraped_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return { map, error };
      }

      const rows = (data ?? []) as Array<{
        product_id?: string | null;
        current_price_kr?: number | string | null;
        previous_price_kr?: number | string | null;
        scrape_date?: string | null;
        scraped_at?: string | null;
      }>;

      if (rows.length === 0) break;

      for (const row of rows) {
        const productId =
          typeof row.product_id === "string" ? row.product_id.trim() : "";
        if (!productId || !unresolved.has(productId) || map.has(productId)) continue;
        const currentPrice = toNumber(row.current_price_kr);
        const previousPrice = toNumber(row.previous_price_kr);
        if (currentPrice === null || previousPrice === null) continue;
        if (previousPrice <= currentPrice) continue;
        map.set(productId, {
          currentPrice,
          previousPrice,
          scrapeDate:
            typeof row.scrape_date === "string" ? row.scrape_date : null,
          scrapedAt: typeof row.scraped_at === "string" ? row.scraped_at : null,
        });
        unresolved.delete(productId);
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
      pagesRead += 1;
      if (pagesRead >= maxPagesPerChunk) break;
    }
  }

  return { map, error: null };
};

const loadLetsDealDealUrlMap = async (supabase: any, productIds: string[]) => {
  const map = new Map<string, LetsDealDealUrlFallback>();
  const uniqueProductIds = Array.from(
    new Set(
      productIds
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
  if (uniqueProductIds.length === 0) {
    return { map, error: null };
  }

  const chunkSize = 50;
  const pageSize = 1000;
  const maxPagesPerChunk = 20;

  for (let start = 0; start < uniqueProductIds.length; start += chunkSize) {
    const chunk = uniqueProductIds.slice(start, start + chunkSize);
    const unresolved = new Set(chunk);
    let offset = 0;
    let pagesRead = 0;

    while (unresolved.size > 0) {
      const { data, error } = await supabase
        .from("letsdeal_product_daily")
        .select("product_id, deal_url, scrape_date, scraped_at")
        .in("product_id", chunk)
        .not("deal_url", "is", null)
        .order("product_id", { ascending: true })
        .order("scraped_at", { ascending: false })
        .order("scrape_date", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return { map, error };
      }

      const rows = (data ?? []) as Array<{
        product_id?: string | null;
        deal_url?: string | null;
        scrape_date?: string | null;
        scraped_at?: string | null;
      }>;

      if (rows.length === 0) break;

      for (const row of rows) {
        const productId =
          typeof row.product_id === "string" ? row.product_id.trim() : "";
        const dealUrl = toText(row.deal_url);
        if (!productId || !dealUrl || !unresolved.has(productId) || map.has(productId)) {
          continue;
        }
        map.set(productId, {
          dealUrl,
          scrapeDate: typeof row.scrape_date === "string" ? row.scrape_date : null,
          scrapedAt: typeof row.scraped_at === "string" ? row.scraped_at : null,
        });
        unresolved.delete(productId);
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
      pagesRead += 1;
      if (pagesRead >= maxPagesPerChunk) break;
    }
  }

  return { map, error: null };
};

const resolveDealPriceFields = ({
  provider,
  rawPrice,
  rawOriginalPrice,
  rawDiscountPercent,
  rawSaveKr,
  fallbackPrice,
}: {
  provider: "digideal" | "letsdeal" | "offerilla";
  rawPrice: number | null;
  rawOriginalPrice: number | null;
  rawDiscountPercent: number | null;
  rawSaveKr: number | null;
  fallbackPrice?: LetsDealFallbackPrice | null;
}) => {
  let price = rawPrice;
  let originalPrice = rawOriginalPrice;
  let discountPercent = rawDiscountPercent;
  let saveKr = rawSaveKr;

  if (provider === "letsdeal") {
    if (price !== null && originalPrice !== null && originalPrice < price) {
      [price, originalPrice] = [originalPrice, price];
    }

    const needsFallback =
      price !== null &&
      (originalPrice === null || originalPrice <= price) &&
      discountPercent !== null &&
      discountPercent > 0;

    if (needsFallback && fallbackPrice) {
      price = fallbackPrice.currentPrice;
      originalPrice = fallbackPrice.previousPrice;
    }
  }

  if (
    saveKr === null &&
    price !== null &&
    originalPrice !== null &&
    originalPrice > price
  ) {
    saveKr = Number((originalPrice - price).toFixed(2));
  }

  if (
    discountPercent === null &&
    price !== null &&
    originalPrice !== null &&
    originalPrice > 0 &&
    originalPrice > price
  ) {
    discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  return {
    price,
    originalPrice,
    discountPercent,
    saveKr,
  };
};

const loadPriceMatchIds = async (supabase: any, productsTable: string) => {
  const baseFilters = (query: any) =>
    query
      .not("purchase_price", "is", null)
      .or("weight_kg.gt.0,weight_grams.gt.0")
      .not("1688_URL", "is", null);

  const primarySelect =
    'product_id, purchase_price, weight_kg, weight_grams, "1688_URL"';
  const fallbackSelect =
    "product_id, purchase_price, weight_kg, weight_grams, 1688_url";

  let response = await baseFilters(
    supabase.from(productsTable).select(primarySelect)
  );
  if (
    response.error?.message &&
    response.error.message.toLowerCase().includes("1688")
  ) {
    response = await baseFilters(
      supabase.from(productsTable).select(fallbackSelect)
    );
  }

  if (response.error) {
    return { ids: [] as string[], error: response.error };
  }

  const ids =
    response.data
      ?.map((row: { product_id?: string | number | null }) =>
        String(row.product_id ?? "")
      )
      .filter(Boolean) ?? [];
  return { ids, error: null };
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

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user };
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const debug = searchParams.get("debug") === "1";
  const provider = resolveDealsProvider(searchParams.get("provider"));
  const providerConfig = getDealsProviderConfig(provider);
  const productsTable = providerConfig.productsTable;
  const productsSearchView = providerConfig.productsSearchView;
  const productDailyTable = providerConfig.productDailyTable;
  const dailyCountColumn = providerConfig.dailyCountColumn;
  const viewsTable = providerConfig.viewsTable;
  const viewItemsTable = providerConfig.viewItemsTable;
  const contentAnalysisTable = providerConfig.contentAnalysisTable;
  const fakeSalesOffset = providerConfig.fakeSalesOffset;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Keep endpoint auth-bound to a signed-in user, but read campaign/pricing
    // inputs via service role when available so non-admin users still get
    // complete rerun pricing data even if RLS on internal supplier tables
    // blocks direct reads.
    const readClient = getAdminClient() ?? supabase;

    const q = searchParams.get("q")?.trim();
    const category = searchParams.get("category")?.trim();
    const categoriesParam = searchParams.get("categories")?.trim() ?? null;
    const categorySelections = parseCategorySelections(categoriesParam);
    const tag = searchParams.get("tag")?.trim();
    const seller = searchParams.get("seller")?.trim();
    const sellersParam = searchParams.get("sellers")?.trim();
    const firstSeenFrom = searchParams.get("firstSeenFrom")?.trim();
    const firstSeenTo = searchParams.get("firstSeenTo")?.trim();
    const priceRange = normalizeNumericRange(
      toNumber(searchParams.get("priceMin")?.trim()),
      toNumber(searchParams.get("priceMax")?.trim()),
      { clampMin: 0 }
    );
    const rerunMarginRange = normalizeNumericRange(
      toNumber(searchParams.get("rerunMarginMin")?.trim()),
      toNumber(searchParams.get("rerunMarginMax")?.trim())
    );
    const status = (searchParams.get("status") ?? "online").toLowerCase();
    const sort = (searchParams.get("sort") ?? "last_seen_desc").toLowerCase();
    const priceMatch = searchParams.get("priceMatch")?.trim().toLowerCase();
    const supplierWorkflow = searchParams
      .get("supplierWorkflow")
      ?.trim()
      .toLowerCase();
    const groupId = searchParams.get("groupId")?.trim();
    const viewId = searchParams.get("viewId")?.trim();
    const minSoldMetric = (
      searchParams.get("minSoldMetric") ?? "sold_all_time"
    )
      .trim()
      .toLowerCase();
    const minSold = toNumber(searchParams.get("minSold")?.trim());
    const inactiveMode = (searchParams.get("inactiveMode") ?? "any")
      .trim()
      .toLowerCase();
    const inactiveDaysRaw = toNumber(searchParams.get("inactiveDays")?.trim());
    const inactiveDays =
      inactiveDaysRaw !== null && inactiveDaysRaw > 0
        ? Math.floor(inactiveDaysRaw)
        : 0;

    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
    );

    const needsActivityFilter =
      inactiveDays > 0 &&
      (inactiveMode === "no_sales" || inactiveMode === "offline");
    const needsComputedRangeFilter = Boolean(priceRange || rerunMarginRange);
    const needsAllRows = needsActivityFilter || needsComputedRangeFilter;
    const effectiveStatus =
      needsActivityFilter && inactiveMode === "offline" ? "all" : status;

    const productSelect =
      provider === "letsdeal" ? PRODUCT_SELECT_LETSDEAL : PRODUCT_SELECT;

    const selectCountMode: "exact" | "planned" | undefined = needsAllRows
      ? undefined
      : provider === "letsdeal"
        ? "planned"
        : "exact";

    let query = readClient
      .from(productsSearchView)
      .select(
        productSelect,
        selectCountMode ? { count: selectCountMode } : undefined
      );

    if (effectiveStatus !== "all") {
      query = query.eq("status", effectiveStatus);
    }

    // Keep rows where seller_name is NULL (legacy imports can be missing seller info),
    // but exclude a couple of known internal/test sellers when present.
    query = query.or(
      "seller_name.is.null,and(seller_name.not.ilike.%digideal%,seller_name.not.ilike.%ace lloyds%)"
    );

    if (firstSeenFrom && isIsoDate(firstSeenFrom)) {
      // Treat the date as UTC start-of-day; good enough for day-granularity filtering.
      query = query.gte("first_seen_at", `${firstSeenFrom}T00:00:00.000Z`);
    }

    if (firstSeenTo && isIsoDate(firstSeenTo)) {
      const nextDay = addDaysIsoDate(firstSeenTo, 1);
      if (nextDay) {
        // Use `< nextDay` so the selected end date is inclusive.
        query = query.lt("first_seen_at", `${nextDay}T00:00:00.000Z`);
      }
    }

    if (groupId) {
      query = query.eq("digideal_group_id", groupId);
    }

    if (viewId) {
      const { data: view, error: viewError } = await supabase
        .from(viewsTable)
        .select("id")
        .eq("id", viewId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (viewError) {
        return NextResponse.json({ error: viewError.message }, { status: 500 });
      }

      if (!view) {
        return NextResponse.json({ items: [], page, pageSize, total: 0 });
      }

      const { data: viewItems, error: viewItemsError } = await supabase
        .from(viewItemsTable)
        .select("product_id")
        .eq("view_id", viewId);

      if (viewItemsError) {
        return NextResponse.json({ error: viewItemsError.message }, { status: 500 });
      }

      const viewProductIds =
        viewItems
          ?.map((row: any) => String(row?.product_id ?? "").trim())
          .filter(Boolean) ?? [];

      if (viewProductIds.length === 0) {
        return NextResponse.json({ items: [], page, pageSize, total: 0 });
      }

      query = query.in("product_id", viewProductIds);
    }

    const sellers = sellersParam
      ? sellersParam
          .split(/[|,]/g)
          .map((value) => value.trim())
          .filter((value) => value.length > 0 && value.toLowerCase() !== "all")
      : [];

    if (sellers.length > 0) {
      const allowed = new Set<string>();
      sellers.forEach((name) => {
        const group = getSellerGroup(name);
        if (group) {
          group.variants.forEach((variant) => allowed.add(variant));
        } else {
          allowed.add(name);
        }
      });

      const allowedList = Array.from(allowed).filter(Boolean);
      if (allowedList.length > 0) {
        query = query.in("seller_name", allowedList);
      }
    } else if (seller && seller.toLowerCase() !== "all") {
      const group = getSellerGroup(seller);
      if (group) {
        query = query.in("seller_name", group.variants);
      } else {
        const like = `%${escapeLikeToken(seller)}%`;
        query = query.ilike("seller_name", like);
      }
    }

    if (priceMatch === "have" || priceMatch === "none") {
      const { ids, error: priceMatchError } = await loadPriceMatchIds(
        readClient,
        productsTable
      );
      if (priceMatchError) {
        console.error("digideal price match error", {
          message: priceMatchError.message,
          details: priceMatchError.details,
          hint: priceMatchError.hint,
          code: priceMatchError.code,
        });
      } else if (priceMatch === "have") {
        if (ids.length === 0) {
          return NextResponse.json({
            items: [],
            page,
            pageSize,
            total: 0,
          });
        }
        query = query.in("product_id", ids);
      } else if (ids.length > 0) {
        query = query.not("product_id", "in", toPgInList(ids));
      }
    }

    const supplierWorkflowMode =
      supplierWorkflow === "no_supplier" ||
      supplierWorkflow === "need_select_supplier" ||
      supplierWorkflow === "need_pick_variants"
        ? supplierWorkflow
        : null;

    if (supplierWorkflowMode) {
      const [searchRowsResponse, selectionRowsResponse, pricedIdsResponse] = await Promise.all([
        loadAllRows<SupplierSearchRow>((from, to) =>
          readClient
            .from("discovery_production_supplier_searches")
            .select("provider, product_id, offers")
            .eq("provider", provider)
            .order("product_id", { ascending: true })
            .range(from, to)
        ),
        loadAllRows<SupplierSelectionRow>((from, to) =>
          readClient
            .from("discovery_production_supplier_selection")
            .select("provider, product_id, selected_offer")
            .eq("provider", provider)
            .order("product_id", { ascending: true })
            .range(from, to)
        ),
        loadPricedProductIds(readClient, productsTable),
      ]);

      if (searchRowsResponse.error) {
        console.error("digideal supplier workflow filter search error", {
          message: searchRowsResponse.error.message,
          details: searchRowsResponse.error.details,
          hint: searchRowsResponse.error.hint,
          code: searchRowsResponse.error.code,
        });
        return NextResponse.json(
          { error: "Failed to load supplier search state." },
          { status: 500 }
        );
      }

      if (selectionRowsResponse.error) {
        console.error("digideal supplier workflow filter selection error", {
          message: selectionRowsResponse.error.message,
          details: selectionRowsResponse.error.details,
          hint: selectionRowsResponse.error.hint,
          code: selectionRowsResponse.error.code,
        });
        return NextResponse.json(
          { error: "Failed to load supplier selection state." },
          { status: 500 }
        );
      }

      if (pricedIdsResponse.error) {
        console.error("digideal supplier workflow filter priced ids error", {
          message: pricedIdsResponse.error.message,
          details: pricedIdsResponse.error.details,
          hint: pricedIdsResponse.error.hint,
          code: pricedIdsResponse.error.code,
        });
        return NextResponse.json(
          { error: "Failed to load supplier pricing state." },
          { status: 500 }
        );
      }

      const pricedProductIds = new Set<string>(pricedIdsResponse.ids ?? []);

      const supplierSuggestionsIds = new Set<string>();
      (searchRowsResponse.data ?? []).forEach((row) => {
        const productId = String(row?.product_id ?? "").trim();
        if (!productId) return;
        const offers = Array.isArray(row.offers) ? row.offers : [];
        if (offers.length > 0) supplierSuggestionsIds.add(productId);
      });

      const supplierSelectedIds = new Set<string>();
      const supplierPickedVariantsIds = new Set<string>();
      (selectionRowsResponse.data ?? []).forEach((row) => {
        const productId = String(row?.product_id ?? "").trim();
        if (!productId) return;
        const offer =
          row?.selected_offer && typeof row.selected_offer === "object"
            ? (row.selected_offer as Record<string, unknown>)
            : null;
        if (!offer) return;

        supplierSelectedIds.add(productId);

        const selectedCountRaw = Number((offer as any)._production_variant_selected_count);
        const packsText = toText((offer as any)._production_variant_packs_text);
        if (
          (Number.isFinite(selectedCountRaw) && selectedCountRaw > 0) ||
          Boolean(packsText)
        ) {
          supplierPickedVariantsIds.add(productId);
        }
      });

      if (supplierWorkflowMode === "need_select_supplier") {
        const candidates = Array.from(supplierSuggestionsIds).filter(
          (productId) => !supplierSelectedIds.has(productId)
        );
        const { ids: manualStateIds, error: manualStateError } =
          await loadManualSupplierStateProductIds(
            readClient,
            productsTable,
            candidates
          );
        if (manualStateError) {
          console.error("digideal supplier workflow manual supplier state error", {
            message: manualStateError.message,
            details: manualStateError.details,
            hint: manualStateError.hint,
            code: manualStateError.code,
          });
          return NextResponse.json(
            { error: "Failed to load manual supplier state." },
            { status: 500 }
          );
        }
        const manualSet = new Set(manualStateIds);
        const ids = candidates.filter(
          (productId) => !manualSet.has(productId) && !pricedProductIds.has(productId)
        );
        if (ids.length === 0) {
          return NextResponse.json({ items: [], page, pageSize, total: 0 });
        }
        query = query.in("product_id", ids);
      } else if (supplierWorkflowMode === "need_pick_variants") {
        const candidates = Array.from(supplierSelectedIds).filter(
          (productId) => !supplierPickedVariantsIds.has(productId)
        );
        const { ids: manualStateIds, error: manualStateError } =
          await loadManualSupplierStateProductIds(
            readClient,
            productsTable,
            candidates
          );
        if (manualStateError) {
          console.error("digideal supplier workflow manual supplier state error", {
            message: manualStateError.message,
            details: manualStateError.details,
            hint: manualStateError.hint,
            code: manualStateError.code,
          });
          return NextResponse.json(
            { error: "Failed to load manual supplier state." },
            { status: 500 }
          );
        }
        const manualSet = new Set(manualStateIds);
        const ids = candidates.filter(
          (productId) => !manualSet.has(productId) && !pricedProductIds.has(productId)
        );
        if (ids.length === 0) {
          return NextResponse.json({ items: [], page, pageSize, total: 0 });
        }
        query = query.in("product_id", ids);
      } else if (supplierWorkflowMode === "no_supplier") {
        const { ids: manualStateIds, error: manualStateError } =
          await loadManualSupplierStateProductIds(
            readClient,
            productsTable,
            null
          );
        if (manualStateError) {
          console.error("digideal supplier workflow manual supplier state error", {
            message: manualStateError.message,
            details: manualStateError.details,
            hint: manualStateError.hint,
            code: manualStateError.code,
          });
          return NextResponse.json(
            { error: "Failed to load manual supplier state." },
            { status: 500 }
          );
        }

        const exclude = new Set<string>(manualStateIds);
        supplierSuggestionsIds.forEach((id) => exclude.add(id));
        supplierSelectedIds.forEach((id) => exclude.add(id));
        pricedProductIds.forEach((id) => exclude.add(id));

        const excludeIds = Array.from(exclude);
        if (excludeIds.length > 0) {
          query = query.not("product_id", "in", toPgInList(excludeIds));
        }
      }
    }

    if (minSold !== null && minSold > 0) {
      const rawSalesThreshold = toRawSalesThreshold(minSold, fakeSalesOffset);
      switch (minSoldMetric) {
        case "sold_today":
          query = query.gte("sold_today", rawSalesThreshold);
          break;
        case "sold_7d":
          query = query.gte("sold_7d", rawSalesThreshold);
          break;
        case "sold_all_time":
        default:
          query = query.gte("last_purchased_count", rawSalesThreshold);
          break;
      }
    }

  const searchColumns =
    provider === "letsdeal"
      ? [
          "listing_title",
          "title_h1",
          "subtitle",
          "product_slug",
          "prodno",
          "seller_name",
        ]
      : ["listing_title", "title_h1", "product_slug", "prodno", "seller_name"];
  const categorySearchColumns =
    provider === "letsdeal"
      ? ["listing_title", "title_h1", "subtitle", "product_slug"]
      : ["listing_title", "title_h1", "product_slug"];

  if (q) {
    const tokens = buildSearchTokens(q);
    tokens.forEach((like) => {
      query = query.or(searchColumns.map((column) => `${column}.ilike.${like}`).join(","));
    });
  }

  if (category) {
    const tokens = buildSearchTokens(category);
    tokens.forEach((like) => {
      query = query.or(
        categorySearchColumns.map((column) => `${column}.ilike.${like}`).join(",")
      );
    });
  }

  if (categorySelections.length > 0) {
    const prefixes = categorySelections
      .map((selection) => String(selection.value ?? "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(prefixes));
    if (unique.length > 0) {
      const filters = unique.map(
        (prefix) => `google_taxonomy_path.ilike.${escapeLikeToken(prefix)}%`
      );
      query = query.or(filters.join(","));
    }
  }

  if (tag) {
    const tokens = buildSearchTokens(tag);
    tokens.forEach((like) => {
      query = query.ilike("bullet_points_text", like);
    });
  }

  switch (sort) {
    case "sold_today":
      query = query
        .order("sold_today", { ascending: false, nullsFirst: false })
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      break;
    case "sold_7d":
      query = query
        .order("sold_7d", { ascending: false, nullsFirst: false })
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      break;
    case "sold_all_time":
      query = query.order("last_purchased_count", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "updated_desc":
    case "last_seen_desc":
    default:
      query = query.order("last_seen_at", { ascending: false, nullsFirst: false });
      break;
    case "first_seen_desc":
      query = query.order("first_seen_at", { ascending: false, nullsFirst: false });
      break;
  }

  let products: any[] | null = null;
  let count: number | null = null;

  if (needsAllRows) {
    const all: any[] = [];
    const chunkSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await query.range(offset, offset + chunkSize - 1);
      if (error) {
        console.error("digideal api error", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return NextResponse.json(
          {
            error: error.message,
            ...(debug
              ? { debug: { details: error.details, hint: error.hint, code: error.code } }
              : {}),
          },
          { status: 500 }
        );
      }

      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < chunkSize) break;
      offset += chunkSize;
    }

    let filteredRows: any[] = all;

    if (needsActivityFilter) {
      const toKey = (row: any) => {
        const sellerKey =
          typeof row?.seller_name === "string" ? row.seller_name.trim() : "";
        const prodnoKey = typeof row?.prodno === "string" ? row.prodno.trim() : "";
        const titleKey =
          (typeof row?.listing_title === "string" ? row.listing_title.trim() : "") ||
          (typeof row?.title_h1 === "string" ? row.title_h1.trim() : "") ||
          (typeof row?.product_slug === "string" ? row.product_slug.trim() : "") ||
          (typeof row?.product_id === "string" ? row.product_id.trim() : "");
        const idKey = prodnoKey || titleKey;
        return `${sellerKey}::${idKey}`;
      };

      if (inactiveMode === "offline") {
        const onlineKeys = new Set(
          all
            .filter((row) => String(row?.status ?? "").toLowerCase() === "online")
            .map(toKey)
        );

        filteredRows = all.filter((row) => {
          if (String(row?.status ?? "").toLowerCase() !== "offline") return false;
          if (daysSinceTimestamp(row?.last_seen_at ?? null) < inactiveDays) return false;
          const key = toKey(row);
          return key.length > 2 && !onlineKeys.has(key);
        });
      } else {
        const { map: lastSoldMap, error: lastSoldError } = await loadLastSoldAtMap(
          readClient,
          productDailyTable,
          dailyCountColumn
        );
        if (lastSoldError) {
          console.error("digideal last sold map error", {
            message: lastSoldError.message,
            details: lastSoldError.details,
            hint: lastSoldError.hint,
            code: lastSoldError.code,
          });
        }

        filteredRows = all.filter((row) => {
          const productId =
            typeof row?.product_id === "string" ? row.product_id.trim() : "";
          if (!productId) return false;
          const lastSoldAt = lastSoldMap.get(productId) ?? null;
          return daysSinceDate(lastSoldAt) >= inactiveDays;
        });
      }

      const seenKeys = new Set<string>();
      const deduped: any[] = [];
      for (const row of filteredRows) {
        const key = toKey(row);
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        deduped.push(row);
      }
      filteredRows = deduped;
    }

    count = filteredRows.length;
    if (needsComputedRangeFilter) {
      products = filteredRows;
    } else {
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      products = filteredRows.slice(from, to);
    }
  } else {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count: dbCount } = await query.range(from, to);

    if (error) {
      console.error("digideal api error", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        {
          error: error.message,
          ...(debug
            ? { debug: { details: error.details, hint: error.hint, code: error.code } }
            : {}),
        },
        { status: 500 }
      );
    }

    products = data ?? [];
    count = typeof dbCount === "number" ? dbCount : null;
  }

    const productIds =
      products?.map((product) => product.product_id).filter(Boolean) ?? [];
    let letsDealFallbackPriceMap = new Map<string, LetsDealFallbackPrice>();
    let letsDealDealUrlMap = new Map<string, LetsDealDealUrlFallback>();
    if (provider === "letsdeal" && productIds.length > 0) {
      const needsFallbackIds = (products ?? [])
        .map((product) => {
          const productId =
            typeof product?.product_id === "string" ? product.product_id.trim() : "";
          if (!productId) return "";
          const price = toNumber(product?.last_price);
          const originalPrice = toNumber(product?.last_original_price);
          const discountPercent = toNumber(product?.last_discount_percent);
          if (price === null) return "";
          if (originalPrice !== null && originalPrice > price) return "";
          if (discountPercent === null || discountPercent <= 0) return "";
          return productId;
        })
        .filter(Boolean);

      if (needsFallbackIds.length > 0) {
        const { map, error } = await loadLetsDealFallbackPriceMap(
          readClient,
          needsFallbackIds
        );
        if (error) {
          console.error("letsdeal fallback price map error", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
        } else {
          letsDealFallbackPriceMap = map;
        }
      }

      const needsUrlFallbackIds = (products ?? [])
        .map((product) => {
          const productId =
            typeof product?.product_id === "string" ? product.product_id.trim() : "";
          if (!productId) return "";
          const listingTitle = toText((product as any).listing_title);
          const titleH1 = toText((product as any).title_h1);
          const productSlug = toText((product as any).product_slug);
          const productUrl = toText((product as any).product_url);
          if (listingTitle || titleH1 || productSlug || productUrl) return "";
          return productId;
        })
        .filter(Boolean);

      if (needsUrlFallbackIds.length > 0) {
        const { map, error } = await loadLetsDealDealUrlMap(
          readClient,
          needsUrlFallbackIds
        );
        if (error) {
          console.error("letsdeal deal url fallback map error", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
        } else {
          letsDealDealUrlMap = map;
        }
      }
    }

    let reportExistsMap = new Map<string, boolean>();
    if (contentAnalysisTable && productIds.length) {
      const { data: analysisRows, error: analysisError } = await readClient
        .from(contentAnalysisTable)
        .select("product_id, report_exists")
        .in("product_id", productIds);
      if (analysisError) {
        console.error("digideal analysis map error", {
          message: analysisError.message,
          details: analysisError.details,
          hint: analysisError.hint,
          code: analysisError.code,
        });
      } else if (analysisRows?.length) {
        reportExistsMap = new Map(
          analysisRows.map((row) => [row.product_id, row.report_exists === true])
        );
      }
    }

    let detailMap = new Map<string, DigidealDetailRow>();
    if (productIds.length) {
      let detailRows: DigidealDetailRow[] | null = null;
      let detailError:
        | { message?: string; details?: string; hint?: string; code?: string }
        | null = null;

      const primarySelect =
        'product_id, purchase_price, weight_kg, weight_grams, shipping_class, shipping_class_confidence, shipping_class_source, shipping_class_model, shipping_class_reason, shipping_class_classified_at, "1688_URL"';
      const fallbackSelect =
        "product_id, purchase_price, weight_kg, weight_grams, shipping_class, shipping_class_confidence, shipping_class_source, shipping_class_model, shipping_class_reason, shipping_class_classified_at, 1688_url";

      const primaryResponse = await readClient
        .from(productsTable)
        .select(primarySelect)
        .in("product_id", productIds);
      detailRows = primaryResponse.data as DigidealDetailRow[] | null;
      detailError = primaryResponse.error;

      if (
        detailError?.message &&
        detailError.message.toLowerCase().includes("1688")
      ) {
        const fallbackResponse = await readClient
          .from(productsTable)
          .select(fallbackSelect)
          .in("product_id", productIds);
        detailRows = fallbackResponse.data as DigidealDetailRow[] | null;
        detailError = fallbackResponse.error;
      }

      if (detailError) {
        console.error("digideal detail map error", {
          message: detailError.message,
          details: detailError.details,
          hint: detailError.hint,
          code: detailError.code,
        });
      } else if (detailRows?.length) {
        detailMap = new Map(
          detailRows.map((row) => [row.product_id, row as DigidealDetailRow])
        );
      }
    }

    const supplierCountMap = new Map<string, number>();
    const supplierSelectionMetaMap = new Map<
      string,
      {
        image_url: string | null;
        title: string | null;
        detail_url: string | null;
        payload_status: string | null;
        payload_source: string | null;
        payload_error: string | null;
        payload_saved_at: string | null;
        payload_file_name: string | null;
        payload_file_path: string | null;
        variant_available_count: number | null;
        variant_selected_count: number | null;
        variant_packs_text: string | null;
        shipping_class: string | null;
        price_override_price: number | null;
        price_override_mode: string | null;
        price_override_margin_percent: number | null;
        price_override_updated_at: string | null;
        price_ignored: boolean;
        price_ignored_at: string | null;
        extreme_ratio_confirmed: boolean;
        extreme_ratio_confirmed_at: string | null;
      }
    >();
    if (productIds.length) {
      const [supplierSearchResponse, supplierSelectionResponse] = await Promise.all([
        readClient
          .from("discovery_production_supplier_searches")
          .select("provider, product_id, offers")
          .eq("provider", provider)
          .in("product_id", productIds),
        readClient
          .from("discovery_production_supplier_selection")
          .select("provider, product_id, selected_offer")
          .eq("provider", provider)
          .in("product_id", productIds),
      ]);

      if (supplierSearchResponse.error) {
        console.error("digideal supplier search map error", {
          message: supplierSearchResponse.error.message,
          details: supplierSearchResponse.error.details,
          hint: supplierSearchResponse.error.hint,
          code: supplierSearchResponse.error.code,
        });
      } else {
        (supplierSearchResponse.data as SupplierSearchRow[] | null)?.forEach((row) => {
          const offers = Array.isArray(row.offers) ? row.offers : [];
          supplierCountMap.set(String(row.product_id ?? ""), offers.length);
        });
      }

      if (supplierSelectionResponse.error) {
        console.error("digideal supplier selection map error", {
          message: supplierSelectionResponse.error.message,
          details: supplierSelectionResponse.error.details,
          hint: supplierSelectionResponse.error.hint,
          code: supplierSelectionResponse.error.code,
        });
      } else {
        (
          supplierSelectionResponse.data as Array<{
            product_id?: string | null;
            selected_offer?: unknown;
          }> | null
        )?.forEach((row) => {
          const productId = String(row?.product_id ?? "").trim();
          if (!productId) return;
          const offer =
            row?.selected_offer && typeof row.selected_offer === "object"
              ? (row.selected_offer as Record<string, unknown>)
              : null;
          if (!offer) return;

          const variantAvailableCountRaw = Number(
            (offer as any)._production_variant_available_count
          );
          const variantSelectedCountRaw = Number(
            (offer as any)._production_variant_selected_count
          );
          supplierSelectionMetaMap.set(productId, {
            image_url:
              toText((offer as any).imageUrl) || toText((offer as any).image_url) || null,
            title:
              toText((offer as any).subject_en) ||
              toText((offer as any).subject) ||
              toText((offer as any).title) ||
              null,
            detail_url:
              toText((offer as any).detailUrl) || toText((offer as any).detail_url) || null,
            payload_status: toText((offer as any)._production_payload_status) || null,
            payload_source: toText((offer as any)._production_payload_source) || null,
            payload_error: toText((offer as any)._production_payload_error) || null,
            payload_saved_at: toText((offer as any)._production_payload_saved_at) || null,
            payload_file_name: toText((offer as any)._production_payload_file_name) || null,
            payload_file_path: toText((offer as any)._production_payload_file_path) || null,
            variant_available_count: Number.isFinite(variantAvailableCountRaw)
              ? variantAvailableCountRaw
              : null,
            variant_selected_count: Number.isFinite(variantSelectedCountRaw)
              ? variantSelectedCountRaw
              : null,
            variant_packs_text:
              toText((offer as any)._production_variant_packs_text) || null,
            shipping_class:
              normalizeShippingClass((offer as any)._digideal_shipping_class) ||
              normalizeShippingClass((offer as any)._production_shipping_class) ||
              normalizeShippingClass((offer as any).shipping_class) ||
              normalizeShippingClass((offer as any).product_shiptype) ||
              normalizeShippingClass((offer as any)._production_product_shiptype),
            price_override_price: toNumber(
              (offer as any)._digideal_price_override_price
            ),
            price_override_mode:
              toText((offer as any)._digideal_price_override_mode) || null,
            price_override_margin_percent: toNumber(
              (offer as any)._digideal_price_override_margin_percent
            ),
            price_override_updated_at:
              toText((offer as any)._digideal_price_override_updated_at) || null,
            price_ignored:
              (offer as any)._digideal_price_ignored === true,
            price_ignored_at:
              toText((offer as any)._digideal_price_ignored_at) || null,
            extreme_ratio_confirmed:
              (offer as any)._digideal_extreme_ratio_confirmed === true,
            extreme_ratio_confirmed_at:
              toText((offer as any)._digideal_extreme_ratio_confirmed_at) || null,
          });
        });
      }
    }

    let marketConfig: MarketConfig | null = null;
    let classMap = new Map<string, ShippingConfig>();
    if (productIds.length) {
      const { data: marketRow, error: marketError } = await readClient
        .from("b2b_pricing_markets")
        .select(
          "market, currency, fx_rate_cny, weight_threshold_g, packing_fee, markup_percent, markup_fixed"
        )
        .eq("market", "SE")
        .maybeSingle();
      if (marketError) {
        console.error("digideal pricing market error", marketError);
      } else if (marketRow) {
        marketConfig = {
          market: String(marketRow.market || "").toUpperCase(),
          currency: String(marketRow.currency || "").toUpperCase(),
          fx_rate_cny: toNumber(marketRow.fx_rate_cny) ?? 0,
          weight_threshold_g: Number(marketRow.weight_threshold_g ?? 300),
          packing_fee: toNumber(marketRow.packing_fee) ?? 0,
          markup_percent: toNumber(marketRow.markup_percent) ?? 0,
          markup_fixed: toNumber(marketRow.markup_fixed) ?? 0,
        };
      }

      const { data: classRows, error: classError } = await readClient
        .from("b2b_pricing_shipping_classes")
        .select(
          "shipping_class, rate_low, rate_high, base_low, base_high, mult_low, mult_high"
        )
        .eq("market", "SE");
      if (classError) {
        console.error("digideal pricing class error", classError);
      } else if (classRows) {
        classMap = new Map(
          classRows.map((row) => [
            String(row.shipping_class || "").toUpperCase(),
            {
              shipping_class: String(row.shipping_class || "").toUpperCase(),
              rate_low: toNumber(row.rate_low) ?? 0,
              rate_high: toNumber(row.rate_high) ?? 0,
              base_low: toNumber(row.base_low) ?? 0,
              base_high: toNumber(row.base_high) ?? 0,
              mult_low: toNumber(row.mult_low) ?? 1,
              mult_high: toNumber(row.mult_high) ?? 1,
            },
          ])
        );
      }
    }

    const linkedSpus =
      products
        ?.map((row) =>
          typeof (row as any).identical_spu === "string"
            ? String((row as any).identical_spu).trim()
            : ""
        )
        .filter(Boolean) ?? [];
    const uniqueLinkedSpus = Array.from(new Set(linkedSpus));
    const linkedStatsBySpu = new Map<
      string,
      { min_purchase_price_cny: number | null; min_weight_kg: number | null }
    >();

    if (uniqueLinkedSpus.length > 0) {
      const catalogClient = getAdminClient();
      if (!catalogClient) {
        console.error("digideal linked stats skipped: missing Supabase credentials");
      } else {
        const { data: linkedProducts, error: linkedProductsError } =
          await catalogClient
            .from("catalog_products")
            .select("id, spu")
            .in("spu", uniqueLinkedSpus);

        if (linkedProductsError) {
          console.error("digideal linked product lookup error", {
            message: linkedProductsError.message,
            details: linkedProductsError.details,
            hint: linkedProductsError.hint,
            code: linkedProductsError.code,
          });
        } else if (linkedProducts?.length) {
          const productIdBySpu = new Map<string, string>();
          linkedProducts.forEach((row: any) => {
            const spu = typeof row?.spu === "string" ? row.spu.trim() : "";
            const id = row?.id ? String(row.id).trim() : "";
            if (!spu || !id) return;
            productIdBySpu.set(spu, id);
          });

          const linkedProductIds = Array.from(new Set(productIdBySpu.values()));
          if (linkedProductIds.length > 0) {
            const { data: variantRows, error: variantError } = await catalogClient
              .from("catalog_variants")
              .select("product_id, purchase_price_cny, weight")
              .in("product_id", linkedProductIds);

            if (variantError) {
              console.error("digideal linked variant lookup error", {
                message: variantError.message,
                details: variantError.details,
                hint: variantError.hint,
                code: variantError.code,
              });
            } else if (variantRows?.length) {
              const minByProductId = new Map<
                string,
                { minPurchase: number | null; minWeight: number | null }
              >();

              variantRows.forEach((row: any) => {
                const productId = row?.product_id ? String(row.product_id) : "";
                if (!productId) return;
                const purchaseCny = toNumber(row.purchase_price_cny);
                const weightKg = toNumber(row.weight);

                const current =
                  minByProductId.get(productId) ?? {
                    minPurchase: null,
                    minWeight: null,
                  };

                if (
                  purchaseCny !== null &&
                  purchaseCny > 0 &&
                  (current.minPurchase === null || purchaseCny < current.minPurchase)
                ) {
                  current.minPurchase = purchaseCny;
                }

                if (
                  weightKg !== null &&
                  weightKg > 0 &&
                  (current.minWeight === null || weightKg < current.minWeight)
                ) {
                  current.minWeight = weightKg;
                }

                minByProductId.set(productId, current);
              });

              productIdBySpu.forEach((productId, spu) => {
                const stats = minByProductId.get(productId);
                if (!stats) return;
                linkedStatsBySpu.set(spu, {
                  min_purchase_price_cny: stats.minPurchase,
                  min_weight_kg: stats.minWeight,
                });
              });
            }
          }
        }
      }
    }

    const items =
      products?.map((product) => {
        const productId = String((product as any).product_id ?? "").trim();
        const letsDealUrlFallback =
          provider === "letsdeal" ? letsDealDealUrlMap.get(productId) : null;
        const resolvedProductUrl =
          toText((product as any).product_url) ||
          toText(letsDealUrlFallback?.dealUrl) ||
          null;
        const resolvedProductSlug =
          toText((product as any).product_slug) ||
          extractLetsDealSlugFromUrl(resolvedProductUrl) ||
          null;
        const slugTitleFallback = resolvedProductSlug
          ? toHumanReadableSlug(resolvedProductSlug)
          : null;
        const resolvedListingTitle =
          toText((product as any).listing_title) ||
          toText((product as any).title_h1) ||
          slugTitleFallback ||
          null;
        const resolvedTitleH1 =
          toText((product as any).title_h1) ||
          toText((product as any).listing_title) ||
          slugTitleFallback ||
          null;
        const imageFields = sanitizeDealImageFields(product as Record<string, unknown>);
        const detail = detailMap.get(product.product_id);
        const purchasePrice = toNumber(detail?.purchase_price);
        const weightKgValue = toNumber(detail?.weight_kg);
        const weightGramsValue = toNumber(detail?.weight_grams);
        const weightKg = normalizeWeightKg(
          weightKgValue,
          weightGramsValue
        );
        const manualSupplierUrl = toText(
          detail?.["1688_URL"] ?? detail?.["1688_url"]
        );
        const supplierMeta = supplierSelectionMetaMap.get(product.product_id);
        // Allow estimated price calculation after picking a supplier + variant via the
        // production-supplier flow (no manual DigiDeal supplier lock set yet).
        const selectedSupplierUrl = manualSupplierUrl || toText(supplierMeta?.detail_url);
        const supplierSelected = Boolean(manualSupplierUrl) || Boolean(supplierMeta);
        const storedShipping =
          typeof product.shipping_cost_kr === "number"
            ? toNumber(product.shipping_cost_kr)
            : null;
        const shippingCost =
          storedShipping ??
          extractShippingCost(
            [toText(product.description_html), toText(product.bullet_points_text)]
              .filter(Boolean)
              .join(" ")
          );
        const canEstimate =
          purchasePrice !== null &&
          weightKg !== null &&
          Boolean(selectedSupplierUrl) &&
          marketConfig !== null;
        const classifiedShippingClass = normalizeShippingClass(detail?.shipping_class);
        const shippingClass = classifiedShippingClass || supplierMeta?.shipping_class || "NOR";
        const shippingClassConfidence = toNumber(detail?.shipping_class_confidence);
        const shippingClassSource = toText(detail?.shipping_class_source) || null;
        const shippingClassModel = toText(detail?.shipping_class_model) || null;
        const shippingClassReason = toText(detail?.shipping_class_reason) || null;
        const shippingClassifiedAt = toText(detail?.shipping_class_classified_at) || null;
        const classConfig = marketConfig
          ? resolveClassConfig(classMap, shippingClass)
          : null;
        const directCost =
          purchasePrice !== null &&
          purchasePrice > 0 &&
          weightKg !== null &&
          weightKg > 0 &&
          marketConfig &&
          classConfig
            ? computeRerunCostBreakdown(
                purchasePrice,
                weightKg,
                marketConfig,
                classConfig
              )
            : null;
        let estimatedPrice =
          canEstimate && classConfig && marketConfig
            ? computeEstimatedPrice(purchasePrice, weightKg, marketConfig, classConfig)
            : null;
        const linkedSpu =
          typeof (product as any).identical_spu === "string"
            ? String((product as any).identical_spu).trim()
            : "";
        const groupId =
          typeof (product as any).digideal_group_id === "string"
            ? String((product as any).digideal_group_id).trim()
            : "";
        const groupCount = toNumber((product as any).digideal_group_count);
        if (!estimatedPrice && linkedSpu && classConfig && marketConfig) {
          const linked = linkedStatsBySpu.get(linkedSpu);
          const linkedPurchase = toNumber(linked?.min_purchase_price_cny);
          const linkedWeightKg = toNumber(linked?.min_weight_kg);
          if (linkedPurchase !== null && linkedWeightKg !== null) {
            estimatedPrice = computeEstimatedPrice(
              linkedPurchase,
              linkedWeightKg,
              marketConfig,
              classConfig
            );
          }
        }
        const resolvedPriceFields = resolveDealPriceFields({
          provider,
          rawPrice: toNumber(product.last_price),
          rawOriginalPrice: toNumber(product.last_original_price),
          rawDiscountPercent: toNumber(product.last_discount_percent),
          rawSaveKr: toNumber(product.last_you_save_kr),
          fallbackPrice:
            provider === "letsdeal"
              ? letsDealFallbackPriceMap.get(String(product.product_id ?? "")) ?? null
              : null,
        });
        const overridePrice =
          supplierMeta?.price_override_price !== null &&
          supplierMeta?.price_override_price !== undefined &&
          Number.isFinite(Number(supplierMeta?.price_override_price)) &&
          Number(supplierMeta?.price_override_price) > 0
            ? Number(supplierMeta?.price_override_price)
            : null;
        const marketPrice = resolvedPriceFields.price;
        const benchmarkTotal =
          marketPrice !== null ? marketPrice + Math.max(0, shippingCost ?? 0) : null;
        const benchmarkPriceRaw =
          estimatedPrice !== null &&
          benchmarkTotal !== null &&
          Number.isFinite(benchmarkTotal) &&
          benchmarkTotal > 0
            ? clampNumber(
                estimatedPrice,
                benchmarkTotal * DIGIDEAL_SUPPLIER_SHARE_FLOOR,
                benchmarkTotal * DIGIDEAL_SUPPLIER_SHARE_TARGET_MAX
              )
            : estimatedPrice;
        const fallbackTotalCost =
          estimatedPrice !== null &&
          marketConfig &&
          Number.isFinite(marketConfig.markup_percent) &&
          Number.isFinite(marketConfig.markup_fixed)
            ? (() => {
                const divisor = 1 + Number(marketConfig.markup_percent);
                if (!Number.isFinite(divisor) || divisor <= 0) return null;
                const result =
                  (estimatedPrice - Number(marketConfig.markup_fixed)) / divisor;
                return Number.isFinite(result) && result > 0 ? result : null;
              })()
            : null;
        const totalCost = directCost?.totalCost ?? fallbackTotalCost;
        const maxAllowedByMargin =
          totalCost !== null && totalCost > 0
            ? totalCost / (1 - DIGIDEAL_MAX_MARGIN_PERCENT / 100)
            : null;
        const benchmarkPrice =
          benchmarkPriceRaw !== null && maxAllowedByMargin !== null
            ? Math.min(benchmarkPriceRaw, maxAllowedByMargin)
            : benchmarkPriceRaw;
        const displayedPrice = overridePrice ?? benchmarkPrice;
        const rerunMarginPercent =
          displayedPrice !== null &&
          totalCost !== null &&
          displayedPrice > 0
            ? ((displayedPrice - totalCost) / displayedPrice) * 100
            : null;
        return {
          product_id: product.product_id,
          listing_title: resolvedListingTitle,
          title_h1: resolvedTitleH1,
          subtitle:
            typeof (product as any).subtitle === "string"
              ? String((product as any).subtitle).trim() || null
              : null,
          identical_spu: linkedSpu || null,
          digideal_group_id: groupId || null,
          digideal_group_count: groupCount,
          google_taxonomy_id: toNumber((product as any).google_taxonomy_id),
          google_taxonomy_path:
            typeof (product as any).google_taxonomy_path === "string"
              ? String((product as any).google_taxonomy_path).trim() || null
              : null,
          product_url: resolvedProductUrl,
          product_slug: resolvedProductSlug,
          prodno: product.prodno ?? null,
          seller_name: normalizeSellerName(product.seller_name),
          seller_orgnr: product.seller_orgnr ?? null,
          status: product.status ?? null,
          last_price: resolvedPriceFields.price,
          last_original_price: resolvedPriceFields.originalPrice,
          last_discount_percent: resolvedPriceFields.discountPercent,
          last_you_save_kr: resolvedPriceFields.saveKr,
          last_purchased_count: toNumber(product.last_purchased_count),
          last_instock_qty: toNumber(product.last_instock_qty),
          last_available_qty: toNumber(product.last_available_qty),
          last_reserved_qty: toNumber(product.last_reserved_qty),
          primary_image_url: imageFields.primaryImageUrl,
          image_urls: imageFields.imageUrls,
          first_seen_at: product.first_seen_at ?? null,
          last_seen_at: product.last_seen_at ?? null,
          digideal_rerun_added: product.digideal_rerun_added ?? null,
          digideal_rerun_partner_comment:
            product.digideal_rerun_partner_comment ?? null,
          digideal_rerun_status: product.digideal_rerun_status ?? null,
          digideal_add_rerun: product.digideal_add_rerun ?? null,
          digideal_add_rerun_at: product.digideal_add_rerun_at ?? null,
          digideal_add_rerun_comment:
            product.digideal_add_rerun_comment ?? null,
          purchase_price: purchasePrice,
          weight_kg: weightKgValue,
          weight_grams: weightGramsValue,
          supplier_url: manualSupplierUrl || null,
          supplier_locked: Boolean(manualSupplierUrl),
          supplier_count: supplierCountMap.get(product.product_id) ?? null,
          supplier_selected: supplierSelected,
          supplier_selected_offer_image_url: supplierMeta?.image_url ?? null,
          supplier_selected_offer_title: supplierMeta?.title ?? null,
          supplier_selected_offer_detail_url: supplierMeta?.detail_url ?? null,
          supplier_payload_status: supplierMeta?.payload_status ?? null,
          supplier_payload_source: supplierMeta?.payload_source ?? null,
          supplier_payload_error: supplierMeta?.payload_error ?? null,
          supplier_payload_saved_at: supplierMeta?.payload_saved_at ?? null,
          supplier_payload_file_name: supplierMeta?.payload_file_name ?? null,
          supplier_payload_file_path: supplierMeta?.payload_file_path ?? null,
          shipping_class: shippingClass,
          shipping_class_confidence: shippingClassConfidence,
          shipping_class_source: shippingClassSource,
          shipping_class_model: shippingClassModel,
          shipping_class_reason: shippingClassReason,
          shipping_class_classified_at: shippingClassifiedAt,
          supplier_variant_available_count:
            supplierMeta?.variant_available_count ?? null,
          supplier_variant_selected_count:
            supplierMeta?.variant_selected_count ?? null,
          supplier_variant_packs_text: supplierMeta?.variant_packs_text ?? null,
          digideal_price_override_price:
            supplierMeta?.price_override_price ?? null,
          digideal_price_override_mode:
            supplierMeta?.price_override_mode ?? null,
          digideal_price_override_margin_percent:
            supplierMeta?.price_override_margin_percent ?? null,
          digideal_price_override_updated_at:
            supplierMeta?.price_override_updated_at ?? null,
          digideal_price_ignored:
            supplierMeta?.price_ignored ?? false,
          digideal_price_ignored_at:
            supplierMeta?.price_ignored_at ?? null,
          digideal_extreme_ratio_confirmed:
            supplierMeta?.extreme_ratio_confirmed ?? false,
          digideal_extreme_ratio_confirmed_at:
            supplierMeta?.extreme_ratio_confirmed_at ?? null,
          shipping_cost: shippingCost,
          estimated_rerun_price: estimatedPrice,
          rerun_margin_percent: rerunMarginPercent,
          sold_today: normalizeDisplayedSales(product.sold_today, fakeSalesOffset),
          sold_7d: normalizeDisplayedSales(product.sold_7d, fakeSalesOffset),
          sold_all_time: normalizeDisplayedSales(
            product.last_purchased_count,
            fakeSalesOffset
          ),
          report_exists: reportExistsMap.get(product.product_id) ?? false,
        };
      }) ?? [];

    let filteredItems = items;
    if (needsComputedRangeFilter) {
      filteredItems = filteredItems.filter((item) => {
        const rowPrice = toNumber((item as any).last_price);
        const rowMargin = toNumber((item as any).rerun_margin_percent);

        if (priceRange) {
          if (rowPrice === null) return false;
          if (priceRange.min !== null && rowPrice < priceRange.min) return false;
          if (priceRange.max !== null && rowPrice > priceRange.max) return false;
        }

        if (rerunMarginRange) {
          if (rowMargin === null) return false;
          if (rerunMarginRange.min !== null && rowMargin < rerunMarginRange.min) return false;
          if (rerunMarginRange.max !== null && rowMargin > rerunMarginRange.max) return false;
        }

        return true;
      });
    }

    const finalItems = needsComputedRangeFilter
      ? filteredItems.slice((page - 1) * pageSize, page * pageSize)
      : filteredItems;
    const finalTotal = needsComputedRangeFilter
      ? filteredItems.length
      : count ?? filteredItems.length;

    return NextResponse.json({
      items: finalItems,
      page,
      pageSize,
      total: finalTotal,
    });
  } catch (err) {
    console.error("digideal api unexpected error", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected error",
        ...(debug ? { debug: err instanceof Error ? err.stack : err } : {}),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    product_id?: string;
    comment?: string;
    add_to_pipeline?: boolean;
    add_directly?: boolean;
    provider?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
  const provider = resolveDealsProvider(payload?.provider);
  const providerConfig = getDealsProviderConfig(provider);
  const productsTable = providerConfig.productsTable;
  if (!productId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }

  const rawComment =
    typeof payload?.comment === "string" ? payload.comment.trim() : "";
  const comment = rawComment ? rawComment : null;
  const addToPipeline = true;

  const now = new Date().toISOString();
  const statusValue = "Queued";
  const updates: Record<string, unknown> = {
    digideal_add_rerun: true,
    digideal_add_rerun_at: now,
    digideal_rerun_status: statusValue,
  };
  if (comment !== null) {
    updates.digideal_add_rerun_comment = comment;
  }

  let inserted = false;
  if (addToPipeline) {
    const { error: insertError } = await supabase
      .from("discovery_production_items")
      .upsert(
        [
          {
            user_id: user.id,
            provider,
            product_id: productId,
          },
        ],
        { onConflict: "user_id,provider,product_id" }
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    inserted = true;
  }

  const { data: updated, error: updateError } = await supabase
    .from(productsTable)
    .update(updates)
    .eq("product_id", productId)
    .select(
      "product_id, digideal_add_rerun, digideal_add_rerun_at, digideal_add_rerun_comment, digideal_rerun_status"
    )
    .maybeSingle();

  if (updateError) {
    if (inserted) {
      await supabase
        .from("discovery_production_items")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider)
        .eq("product_id", productId);
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updated) {
    if (inserted) {
      await supabase
        .from("discovery_production_items")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider)
        .eq("product_id", productId);
    }
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  if (comment !== null && addToPipeline) {
    let userLabel = user.email ?? user.id ?? "Unknown";
    const { data: settings } = await supabase
      .from("partner_user_settings")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (settings?.full_name) {
      userLabel = settings.full_name;
    }

    const { error: commentError } = await supabase
      .from("discovery_production_comments")
      .insert({
        provider,
        product_id: productId,
        user_id: user.id,
        user_label: userLabel,
        comment,
      });

    if (commentError) {
      return NextResponse.json({ error: commentError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    product_id: updated.product_id,
    added: Boolean(updated.digideal_add_rerun),
    added_at: updated.digideal_add_rerun_at ?? now,
    comment: updated.digideal_add_rerun_comment ?? null,
    status: updated.digideal_rerun_status ?? statusValue,
  });
}

export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: {
    product_id?: string;
    provider?: string;
    supplier_url?: string;
    weight_grams?: number;
    purchase_price?: number;
    remove_supplier?: boolean;
    price_override_action?: "set" | "clear";
    price_override_price?: number;
    price_override_margin_percent?: number;
    price_override_mode?: string;
    ignore_price_action?: "set" | "clear";
    extreme_ratio_action?: "confirm" | "clear";
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
  const provider = resolveDealsProvider(payload?.provider);
  const providerConfig = getDealsProviderConfig(provider);
  const productsTable = providerConfig.productsTable;
  const removeSupplier = payload?.remove_supplier === true;
  const priceOverrideAction =
    payload?.price_override_action === "set" || payload?.price_override_action === "clear"
      ? payload.price_override_action
      : null;
  const extremeRatioAction =
    payload?.extreme_ratio_action === "confirm" || payload?.extreme_ratio_action === "clear"
      ? payload.extreme_ratio_action
      : null;
  const ignorePriceAction =
    payload?.ignore_price_action === "set" || payload?.ignore_price_action === "clear"
      ? payload.ignore_price_action
      : null;
  const supplierUrl =
    typeof payload?.supplier_url === "string" ? payload.supplier_url.trim() : "";
  const normalizedSupplierUrl = supplierUrl ? normalize1688Url(supplierUrl) : "";
  const purchasePrice = toNumber(payload?.purchase_price);
  const weightGramsInput = toNumber(payload?.weight_grams);
  if (!productId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }

  if (priceOverrideAction || extremeRatioAction || ignorePriceAction) {
    const { data: existingSelection, error: selectionFetchError } = await adminClient
      .from("discovery_production_supplier_selection")
      .select("selected_offer")
      .eq("provider", provider)
      .eq("product_id", productId)
      .maybeSingle();

    if (selectionFetchError) {
      return NextResponse.json({ error: selectionFetchError.message }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const selectedOfferBase =
      existingSelection?.selected_offer &&
      typeof existingSelection.selected_offer === "object"
        ? { ...(existingSelection.selected_offer as Record<string, unknown>) }
        : {};

    if (priceOverrideAction === "set") {
      const overridePrice = toNumber(payload?.price_override_price);
      if (overridePrice === null || overridePrice <= 0) {
        return NextResponse.json(
          { error: "Missing price_override_price." },
          { status: 400 }
        );
      }

      const marginPercent = toNumber(payload?.price_override_margin_percent);
      const modeText =
        typeof payload?.price_override_mode === "string"
          ? payload.price_override_mode.trim()
          : "";

      selectedOfferBase._digideal_price_override_price = Number(overridePrice);
      selectedOfferBase._digideal_price_override_mode = modeText || "manual";
      selectedOfferBase._digideal_price_override_margin_percent =
        marginPercent !== null ? Number(marginPercent) : null;
      selectedOfferBase._digideal_price_override_updated_at = nowIso;
    } else if (priceOverrideAction === "clear") {
      delete selectedOfferBase._digideal_price_override_price;
      delete selectedOfferBase._digideal_price_override_mode;
      delete selectedOfferBase._digideal_price_override_margin_percent;
      delete selectedOfferBase._digideal_price_override_updated_at;
    }

    if (extremeRatioAction === "confirm") {
      selectedOfferBase._digideal_extreme_ratio_confirmed = true;
      selectedOfferBase._digideal_extreme_ratio_confirmed_at = nowIso;
    } else if (extremeRatioAction === "clear") {
      delete selectedOfferBase._digideal_extreme_ratio_confirmed;
      delete selectedOfferBase._digideal_extreme_ratio_confirmed_at;
    }

    if (ignorePriceAction === "set") {
      selectedOfferBase._digideal_price_ignored = true;
      selectedOfferBase._digideal_price_ignored_at = nowIso;
    } else if (ignorePriceAction === "clear") {
      delete selectedOfferBase._digideal_price_ignored;
      delete selectedOfferBase._digideal_price_ignored_at;
    }

    const { data: savedSelection, error: selectionSaveError } = await adminClient
      .from("discovery_production_supplier_selection")
      .upsert(
        {
          provider,
          product_id: productId,
          selected_offer: selectedOfferBase,
          updated_at: nowIso,
        },
        { onConflict: "provider,product_id" }
      )
      .select("selected_offer")
      .maybeSingle();

    if (selectionSaveError) {
      return NextResponse.json({ error: selectionSaveError.message }, { status: 500 });
    }

    const savedOffer =
      savedSelection?.selected_offer && typeof savedSelection.selected_offer === "object"
        ? (savedSelection.selected_offer as Record<string, unknown>)
        : null;

    return NextResponse.json({
      item: {
        product_id: productId,
        digideal_price_override_price: toNumber(
          savedOffer?._digideal_price_override_price
        ),
        digideal_price_override_mode:
          toText(savedOffer?._digideal_price_override_mode) || null,
        digideal_price_override_margin_percent: toNumber(
          savedOffer?._digideal_price_override_margin_percent
        ),
        digideal_price_override_updated_at:
          toText(savedOffer?._digideal_price_override_updated_at) || null,
        digideal_price_ignored:
          savedOffer?._digideal_price_ignored === true,
        digideal_price_ignored_at:
          toText(savedOffer?._digideal_price_ignored_at) || null,
        digideal_extreme_ratio_confirmed:
          savedOffer?._digideal_extreme_ratio_confirmed === true,
        digideal_extreme_ratio_confirmed_at:
          toText(savedOffer?._digideal_extreme_ratio_confirmed_at) || null,
      },
    });
  }

  if (removeSupplier) {
    const { data, error } = await adminClient
      .from(productsTable)
      .update({
        purchase_price: null,
        weight_grams: null,
        weight_kg: null,
        "1688_URL": null,
      })
      .eq("product_id", productId)
      .select('product_id, purchase_price, weight_kg, weight_grams, "1688_URL"')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({
      item: {
        product_id: data.product_id,
        purchase_price: data.purchase_price,
        weight_kg: data.weight_kg,
        weight_grams: data.weight_grams,
        supplier_url: (data as DigidealDetailRow)["1688_URL"] ?? null,
      },
    });
  }
  if (!normalizedSupplierUrl) {
    return NextResponse.json({ error: "Missing supplier_url." }, { status: 400 });
  }
  if (purchasePrice === null || purchasePrice <= 0) {
    return NextResponse.json(
      { error: "Missing purchase_price." },
      { status: 400 }
    );
  }
  if (weightGramsInput === null || weightGramsInput <= 0) {
    return NextResponse.json(
      { error: "Missing weight_grams." },
      { status: 400 }
    );
  }

  const weightGrams = Math.round(weightGramsInput);
  const weightKg = Number((weightGrams / 1000).toFixed(3));

  const { data, error } = await adminClient
    .from(productsTable)
    .update({
      purchase_price: purchasePrice,
      weight_grams: weightGrams,
      weight_kg: weightKg,
      "1688_URL": normalizedSupplierUrl,
    })
    .eq("product_id", productId)
    .select('product_id, purchase_price, weight_kg, weight_grams, "1688_URL"')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      product_id: data.product_id,
      purchase_price: data.purchase_price,
      weight_kg: data.weight_kg,
      weight_grams: data.weight_grams,
      supplier_url: (data as DigidealDetailRow)["1688_URL"] ?? null,
    },
  });
}
