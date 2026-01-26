import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const PRODUCT_SELECT =
  "product_id, listing_title, title_h1, product_url, product_slug, prodno, seller_name, seller_orgnr, status, last_price, last_original_price, last_discount_percent, last_you_save_kr, last_purchased_count, last_instock_qty, last_available_qty, last_reserved_qty, primary_image_url, image_urls, first_seen_at, last_seen_at, description_html, bullet_points_text, sold_today, sold_7d, digideal_rerun_added, digideal_rerun_partner_comment, digideal_rerun_status, digideal_add_rerun, digideal_add_rerun_at, digideal_add_rerun_comment";

const SELLER_GROUPS = [
  {
    display: "Nordexo Limited",
    variants: ["Nordexo Limited77795751", "Nordexo Limited"],
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
  return SELLER_GROUPS.find(
    (group) =>
      group.display.toLowerCase() === normalized ||
      group.variants.some((variant) => variant.toLowerCase() === normalized)
  );
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
    const tag = searchParams.get("tag")?.trim();
    const seller = searchParams.get("seller")?.trim();
    const status = (searchParams.get("status") ?? "online").toLowerCase();
    const sort = (searchParams.get("sort") ?? "last_seen_desc").toLowerCase();

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE))
  );

  let query = supabase
    .from("digideal_products_search")
    .select(PRODUCT_SELECT, { count: "exact" });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  query = query.not("seller_name", "ilike", "%digideal%");
  query = query.not("seller_name", "ilike", "%ace lloyds%");

  if (seller && seller.toLowerCase() !== "all") {
    const group = getSellerGroup(seller);
    if (group) {
      query = query.in("seller_name", group.variants);
    } else {
      const like = `%${escapeLikeToken(seller)}%`;
      query = query.ilike("seller_name", like);
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

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

    const { data: products, error, count } = await query;

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
        const supplierUrl = toText(
          detail?.["1688_URL"] ?? detail?.["1688_url"]
        );
        const shippingCost = extractShippingCost(
          [toText(product.description_html), toText(product.bullet_points_text)]
            .filter(Boolean)
            .join(" ")
        );
        const canEstimate =
          purchasePrice !== null &&
          weightKg !== null &&
          Boolean(supplierUrl) &&
          marketConfig !== null;
        const shippingClass = "NOR";
        const classConfig = marketConfig
          ? resolveClassConfig(classMap, shippingClass)
          : null;
        const estimatedPrice =
          canEstimate && classConfig && marketConfig
            ? computeEstimatedPrice(purchasePrice, weightKg, marketConfig, classConfig)
            : null;
        return {
          product_id: product.product_id,
          listing_title: product.listing_title ?? null,
          title_h1: product.title_h1 ?? null,
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
        supplier_url: supplierUrl || null,
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
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productId = String(payload?.product_id ?? "").trim();
  const supplierUrl =
    typeof payload?.supplier_url === "string" ? payload.supplier_url.trim() : "";
  const purchasePrice = toNumber(payload?.purchase_price);
  const weightGramsInput = toNumber(payload?.weight_grams);
  if (!productId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }
  if (!supplierUrl) {
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
      "1688_URL": supplierUrl,
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
