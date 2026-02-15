import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const PRODUCT_SELECT =
  "product_id, listing_title, title_h1, product_url, product_slug, prodno, seller_name, seller_orgnr, status, last_price, last_original_price, last_discount_percent, last_you_save_kr, last_purchased_count, last_instock_qty, last_available_qty, last_reserved_qty, primary_image_url, image_urls, first_seen_at, last_seen_at, description_html, bullet_points_text, google_taxonomy_id, google_taxonomy_path, sold_today, sold_7d, digideal_rerun_added, digideal_rerun_partner_comment, digideal_rerun_status, digideal_add_rerun, digideal_add_rerun_at, digideal_add_rerun_comment, shipping_cost_kr, identical_spu, digideal_group_id, digideal_group_count";

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
  "1688_URL"?: string | null;
  "1688_url"?: string | null;
};

type SupplierSearchRow = {
  provider: string;
  product_id: string;
  offers: unknown;
};

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

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

const computeEstimatedPrice = (
  purchaseCny: number,
  weightKg: number,
  market: MarketConfig,
  classConfig: ShippingConfig
) => {
  const weightG = weightKg * 1000;
  const useLow = weightG <= market.weight_threshold_g;
  const rate = useLow ? classConfig.rate_low : classConfig.rate_high;
  const base = useLow ? classConfig.base_low : classConfig.base_high;
  const mult = useLow ? classConfig.mult_low : classConfig.mult_high;
  const shippingCny = weightG * mult * rate + base;
  const shippingLocal = shippingCny * market.fx_rate_cny + market.packing_fee;
  const stockLocal = purchaseCny * market.fx_rate_cny;
  const totalCost = stockLocal + shippingLocal;
  const rawPrice = totalCost * (1 + market.markup_percent) + market.markup_fixed;
  const price =
    market.currency === "EUR"
      ? Number(rawPrice.toFixed(2))
      : Math.round(rawPrice);
  return Number.isFinite(price) ? price : null;
};

const loadLastSoldAtMap = async (supabase: any) => {
  const lastSoldAt = new Map<string, string | null>();
  const chunkSize = 1000;
  let offset = 0;

  let currentProductId = "";
  let prevCount: number | null = null;
  let lastSoldDate: string | null = null;

  while (true) {
    const { data, error } = await supabase
      .from("digideal_product_daily")
      .select("product_id, scrape_date, purchased_count")
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
    }>;

    if (rows.length === 0) break;

    for (const row of rows) {
      const productId = typeof row.product_id === "string" ? row.product_id : "";
      const scrapeDate =
        typeof row.scrape_date === "string" ? row.scrape_date : null;
      const purchased =
        typeof row.purchased_count === "number"
          ? row.purchased_count
          : row.purchased_count === null || row.purchased_count === undefined
            ? null
            : Number(row.purchased_count);

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

const loadPriceMatchIds = async (supabase: any) => {
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
    supabase.from("digideal_products").select(primarySelect)
  );
  if (
    response.error?.message &&
    response.error.message.toLowerCase().includes("1688")
  ) {
    response = await baseFilters(
      supabase.from("digideal_products").select(fallbackSelect)
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

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = searchParams.get("q")?.trim();
    const category = searchParams.get("category")?.trim();
    const categoriesParam = searchParams.get("categories")?.trim() ?? null;
    const categorySelections = parseCategorySelections(categoriesParam);
    const tag = searchParams.get("tag")?.trim();
    const seller = searchParams.get("seller")?.trim();
    const sellersParam = searchParams.get("sellers")?.trim();
    const firstSeenFrom = searchParams.get("firstSeenFrom")?.trim();
    const firstSeenTo = searchParams.get("firstSeenTo")?.trim();
    const status = (searchParams.get("status") ?? "online").toLowerCase();
    const sort = (searchParams.get("sort") ?? "last_seen_desc").toLowerCase();
    const priceMatch = searchParams.get("priceMatch")?.trim().toLowerCase();
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
    const effectiveStatus =
      needsActivityFilter && inactiveMode === "offline" ? "all" : status;

    let query = supabase
      .from("digideal_products_search")
      .select(PRODUCT_SELECT, { count: "exact" });

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
        .from("digideal_views")
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
        .from("digideal_view_items")
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
      const { ids, error: priceMatchError } = await loadPriceMatchIds(supabase);
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

    if (minSold !== null && minSold > 0) {
      switch (minSoldMetric) {
        case "sold_today":
          query = query.gte("sold_today", minSold);
          break;
        case "sold_7d":
          query = query.gte("sold_7d", minSold);
          break;
        case "sold_all_time":
        default:
          query = query.gte("last_purchased_count", minSold);
          break;
      }
    }

  if (q) {
    const tokens = buildSearchTokens(q);
    tokens.forEach((like) => {
      query = query.or(
        [
          `listing_title.ilike.${like}`,
          `title_h1.ilike.${like}`,
          `product_slug.ilike.${like}`,
          `prodno.ilike.${like}`,
          `seller_name.ilike.${like}`,
        ].join(",")
      );
    });
  }

  if (category) {
    const tokens = buildSearchTokens(category);
    tokens.forEach((like) => {
      query = query.or(
        [
          `listing_title.ilike.${like}`,
          `title_h1.ilike.${like}`,
          `product_slug.ilike.${like}`,
        ].join(",")
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

  if (needsActivityFilter) {
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

    let filtered: any[] = all;

    if (inactiveMode === "offline") {
      const onlineKeys = new Set(
        all
          .filter((row) => String(row?.status ?? "").toLowerCase() === "online")
          .map(toKey)
      );

      filtered = all.filter((row) => {
        if (String(row?.status ?? "").toLowerCase() !== "offline") return false;
        if (daysSinceTimestamp(row?.last_seen_at ?? null) < inactiveDays) return false;
        const key = toKey(row);
        return key.length > 2 && !onlineKeys.has(key);
      });
    } else {
      const { map: lastSoldMap, error: lastSoldError } = await loadLastSoldAtMap(
        supabase
      );
      if (lastSoldError) {
        console.error("digideal last sold map error", {
          message: lastSoldError.message,
          details: lastSoldError.details,
          hint: lastSoldError.hint,
          code: lastSoldError.code,
        });
      }

      filtered = all.filter((row) => {
        const productId =
          typeof row?.product_id === "string" ? row.product_id.trim() : "";
        if (!productId) return false;
        const lastSoldAt = lastSoldMap.get(productId) ?? null;
        return daysSinceDate(lastSoldAt) >= inactiveDays;
      });
    }

    const seenKeys = new Set<string>();
    const deduped: any[] = [];
    for (const row of filtered) {
      const key = toKey(row);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push(row);
    }

    count = deduped.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    products = deduped.slice(from, to);
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
    let reportExistsMap = new Map<string, boolean>();
    if (productIds.length) {
      const { data: analysisRows, error: analysisError } = await supabase
        .from("digideal_content_analysis")
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
        'product_id, purchase_price, weight_kg, weight_grams, "1688_URL"';
      const fallbackSelect =
        "product_id, purchase_price, weight_kg, weight_grams, 1688_url";

      const primaryResponse = await supabase
        .from("digideal_products")
        .select(primarySelect)
        .in("product_id", productIds);
      detailRows = primaryResponse.data as DigidealDetailRow[] | null;
      detailError = primaryResponse.error;

      if (
        detailError?.message &&
        detailError.message.toLowerCase().includes("1688")
      ) {
        const fallbackResponse = await supabase
          .from("digideal_products")
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
      }
    >();
    if (productIds.length) {
      const [supplierSearchResponse, supplierSelectionResponse] = await Promise.all([
        supabase
          .from("discovery_production_supplier_searches")
          .select("provider, product_id, offers")
          .eq("provider", "digideal")
          .in("product_id", productIds),
        supabase
          .from("discovery_production_supplier_selection")
          .select("provider, product_id, selected_offer")
          .eq("provider", "digideal")
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
          });
        });
      }
    }

    let marketConfig: MarketConfig | null = null;
    let classMap = new Map<string, ShippingConfig>();
    if (productIds.length) {
      const { data: marketRow, error: marketError } = await supabase
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

      const { data: classRows, error: classError } = await supabase
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
        const shippingClass = "NOR";
        const classConfig = marketConfig
          ? resolveClassConfig(classMap, shippingClass)
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
        return {
          product_id: product.product_id,
          listing_title: product.listing_title ?? null,
          title_h1: product.title_h1 ?? null,
          identical_spu: linkedSpu || null,
          digideal_group_id: groupId || null,
          digideal_group_count: groupCount,
          google_taxonomy_id: toNumber((product as any).google_taxonomy_id),
          google_taxonomy_path:
            typeof (product as any).google_taxonomy_path === "string"
              ? String((product as any).google_taxonomy_path).trim() || null
              : null,
          product_url: product.product_url ?? null,
          product_slug: product.product_slug ?? null,
          prodno: product.prodno ?? null,
          seller_name: normalizeSellerName(product.seller_name),
          seller_orgnr: product.seller_orgnr ?? null,
          status: product.status ?? null,
          last_price: toNumber(product.last_price),
          last_original_price: toNumber(product.last_original_price),
          last_discount_percent: toNumber(product.last_discount_percent),
          last_you_save_kr: toNumber(product.last_you_save_kr),
          last_purchased_count: toNumber(product.last_purchased_count),
          last_instock_qty: toNumber(product.last_instock_qty),
          last_available_qty: toNumber(product.last_available_qty),
          last_reserved_qty: toNumber(product.last_reserved_qty),
          primary_image_url: product.primary_image_url ?? null,
          image_urls: product.image_urls ?? null,
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
          supplier_variant_available_count:
            supplierMeta?.variant_available_count ?? null,
          supplier_variant_selected_count:
            supplierMeta?.variant_selected_count ?? null,
          supplier_variant_packs_text: supplierMeta?.variant_packs_text ?? null,
          shipping_cost: shippingCost,
          estimated_rerun_price: estimatedPrice,
          sold_today: toNumber(product.sold_today) ?? 0,
          sold_7d: toNumber(product.sold_7d) ?? 0,
          sold_all_time: toNumber(product.last_purchased_count) ?? 0,
          report_exists: reportExistsMap.get(product.product_id) ?? false,
        };
      }) ?? [];

    return NextResponse.json({
      items,
      page,
      pageSize,
      total: count ?? items.length,
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
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
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
            provider: "digideal",
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
    .from("digideal_products")
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
        .eq("provider", "digideal")
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
        .eq("provider", "digideal")
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
        provider: "digideal",
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
    supplier_url?: string;
    weight_grams?: number;
    purchase_price?: number;
    remove_supplier?: boolean;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
  const removeSupplier = payload?.remove_supplier === true;
  const supplierUrl =
    typeof payload?.supplier_url === "string" ? payload.supplier_url.trim() : "";
  const normalizedSupplierUrl = supplierUrl ? normalize1688Url(supplierUrl) : "";
  const purchasePrice = toNumber(payload?.purchase_price);
  const weightGramsInput = toNumber(payload?.weight_grams);
  if (!productId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }
  if (removeSupplier) {
    const { data, error } = await adminClient
      .from("digideal_products")
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
    .from("digideal_products")
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
