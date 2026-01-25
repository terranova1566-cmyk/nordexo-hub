import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

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

const extractTextValue = (row: Record<string, unknown>) => {
  if (row.value_text) return String(row.value_text);
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number);
  }
  if (typeof row.value === "string") return row.value;
  if (row.value_json !== null && row.value_json !== undefined) {
    return JSON.stringify(row.value_json);
  }
  if (row.value != null) return JSON.stringify(row.value);
  return null;
};

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const queryText = searchParams.get("q")?.trim() ?? "";
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50;
  const updatedFrom = searchParams.get("updatedFrom")?.trim() ?? "";
  const updatedTo = searchParams.get("updatedTo")?.trim() ?? "";
  const createdFrom = searchParams.get("createdFrom")?.trim() ?? "";
  const createdTo = searchParams.get("createdTo")?.trim() ?? "";
  const shopifyParam = searchParams.get("shopify")?.trim() ?? "";
  const shopifyAllowed = [
    "shopify_tingelo",
    "shopify_wellando",
    "shopify_sparklar",
    "shopify_shopify",
  ];
  const shopifyTypes = shopifyParam
    ? shopifyParam
        .split(",")
        .map((value) => value.trim())
        .filter((value) => shopifyAllowed.includes(value))
    : ["shopify_tingelo"];
  const baseLimit = Math.max(pageSize * page, 200);
  const limit = Math.min(baseLimit, 2000);

  const selectFields =
    "id, sku, product_id, price, purchase_price_cny, weight, shipping_class, updated_at, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi, catalog_products(spu, title)";

  const variantMap = new Map<string, Record<string, unknown>>();

  let createdProductIds: string[] | null = null;
  if (createdFrom || createdTo) {
    let productQuery = adminClient
      .from("catalog_products")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (createdFrom) productQuery = productQuery.gte("created_at", createdFrom);
    if (createdTo)
      productQuery = productQuery.lte(
        "created_at",
        `${createdTo}T23:59:59.999Z`
      );
    const { data: createdRows, error: createdError } = await productQuery;
    if (createdError) {
      return NextResponse.json(
        { error: createdError.message },
        { status: 500 }
      );
    }
    createdProductIds =
      createdRows?.map((row) => String(row.id)).filter(Boolean) ?? [];
    if (createdProductIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
  }

  if (queryText) {
    let skuQuery = adminClient
      .from("catalog_variants")
      .select(selectFields)
      .ilike("sku", `%${queryText}%`)
      .limit(limit);
    if (createdProductIds) {
      skuQuery = skuQuery.in("product_id", createdProductIds);
    }
    if (updatedFrom) skuQuery = skuQuery.gte("updated_at", updatedFrom);
    if (updatedTo) skuQuery = skuQuery.lte("updated_at", `${updatedTo}T23:59:59.999Z`);
    const { data: skuVariants } = await skuQuery;

    skuVariants?.forEach((row) => {
      if (row.id) variantMap.set(String(row.id), row);
    });

    const { data: productMatches } = await adminClient
      .from("catalog_products")
      .select("id")
      .or(`spu.ilike.%${queryText}%,title.ilike.%${queryText}%`)
      .limit(limit);

    const productIds =
      productMatches?.map((row) => row.id).filter(Boolean) ?? [];
    const filteredProductIds = createdProductIds
      ? productIds.filter((id) => createdProductIds.includes(String(id)))
      : productIds;

    if (filteredProductIds.length > 0) {
      let productVariantsQuery = adminClient
        .from("catalog_variants")
        .select(selectFields)
        .in("product_id", filteredProductIds)
        .limit(limit);
      if (updatedFrom)
        productVariantsQuery = productVariantsQuery.gte("updated_at", updatedFrom);
      if (updatedTo)
        productVariantsQuery = productVariantsQuery.lte(
          "updated_at",
          `${updatedTo}T23:59:59.999Z`
        );
      const { data: productVariants } = await productVariantsQuery;

      productVariants?.forEach((row) => {
        if (row.id) variantMap.set(String(row.id), row);
      });
    }
  } else {
    let variantsQuery = adminClient
      .from("catalog_variants")
      .select(selectFields)
      .order("sku", { ascending: true })
      .limit(limit);
    if (createdProductIds) {
      variantsQuery = variantsQuery.in("product_id", createdProductIds);
    }
    if (updatedFrom) variantsQuery = variantsQuery.gte("updated_at", updatedFrom);
    if (updatedTo)
      variantsQuery = variantsQuery.lte("updated_at", `${updatedTo}T23:59:59.999Z`);
    const { data: variants } = await variantsQuery;

    variants?.forEach((row) => {
      if (row.id) variantMap.set(String(row.id), row);
    });
  }

  const variants = Array.from(variantMap.values());
  const variantIds = variants.map((row) => row.id).filter(Boolean);
  const spus = Array.from(
    new Set(
      variants
        .map((row) => {
          const product = Array.isArray(row.catalog_products)
            ? row.catalog_products[0]
            : row.catalog_products;
          return product?.spu ? String(product.spu) : null;
        })
        .filter(Boolean)
    )
  );
  const productIds = Array.from(
    new Set(
      variants
        .map((row) => row.product_id)
        .filter(Boolean)
        .map((id) => String(id))
    )
  );

  const fallbackBySpu = new Map<string, { effective_long_title?: string | null }>();
  if (spus.length > 0) {
    const { data: fallbackRows } = await adminClient
      .from("catalog_products_fallback")
      .select("spu, effective_long_title")
      .in("spu", spus);
    fallbackRows?.forEach((row) => {
      if (row.spu) fallbackBySpu.set(String(row.spu), row);
    });
  }

  const shortTitleByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: metaDefs } = await adminClient
      .from("metafield_definitions")
      .select("id, namespace, key")
      .eq("resource", "catalog_product")
      .eq("key", "short_title")
      .in("namespace", PRODUCT_META_NAMESPACES);

    const defMap = new Map(
      metaDefs?.map((def) => [def.id, def]) ?? []
    );
    const defIds = Array.from(defMap.keys());

    if (defIds.length > 0) {
      const { data: metaValues } = await adminClient
        .from("metafield_values")
        .select("definition_id, target_id, value_text, value, value_number, value_json")
        .eq("target_type", "product")
        .in("definition_id", defIds)
        .in("target_id", productIds);

      const byProduct = new Map<string, Map<string, string>>();
      metaValues?.forEach((row) => {
        const def = defMap.get(row.definition_id);
        if (!def || !row.target_id) return;
        const text = extractTextValue(row);
        if (!text) return;
        const productId = String(row.target_id);
        const byNamespace = byProduct.get(productId) ?? new Map<string, string>();
        byNamespace.set(def.namespace ?? "", text);
        byProduct.set(productId, byNamespace);
      });

      byProduct.forEach((namespaces, productId) => {
        for (const namespace of PRODUCT_META_NAMESPACES) {
          const value = namespaces.get(namespace);
          if (value) {
            shortTitleByProduct.set(productId, value);
            break;
          }
        }
      });
    }
  }

  const variantPriceRows = new Map<
    string,
    Map<string, Map<string, number | null>>
  >();
  const shopifyPriceMap = new Map<
    string,
    Map<string, { price: number | null; compare: number | null }>
  >();

  if (variantIds.length > 0) {
    const { data: priceRows } = await adminClient
      .from("catalog_variant_prices")
      .select("catalog_variant_id, market, price_type, price, compare_at_price")
      .in("catalog_variant_id", variantIds)
      .in("price_type", [
        "b2b_fixed",
        "b2b_calc",
        "b2b_dropship",
        ...shopifyTypes,
      ])
      .is("deleted_at", null);

    priceRows?.forEach((row) => {
      const variantId = row.catalog_variant_id;
      if (!variantId) return;
      const type = String(row.price_type || "");
      if (shopifyTypes.includes(type)) {
        const perVariant = shopifyPriceMap.get(variantId) ?? new Map();
        const current = perVariant.get(type) ?? { price: null, compare: null };
        const priceValue =
          row.price !== null && row.price !== undefined
            ? Number(row.price)
            : null;
        const compareValue =
          row.compare_at_price !== null && row.compare_at_price !== undefined
            ? Number(row.compare_at_price)
            : null;
        perVariant.set(type, {
          price:
            current.price ?? (Number.isFinite(priceValue) ? priceValue : null),
          compare:
            current.compare ??
            (Number.isFinite(compareValue) ? compareValue : null),
        });
        shopifyPriceMap.set(variantId, perVariant);
        return;
      }
      const entry = variantPriceRows.get(variantId) ?? new Map();
      const typeEntry = entry.get(type) ?? new Map<string, number | null>();
      const market = row.market?.toUpperCase();
      if (market) {
        let priceValue: number | null = null;
        if (row.price !== null && row.price !== undefined) {
          const numeric = Number(row.price);
          if (Number.isFinite(numeric)) {
            priceValue = numeric;
          }
        }
        typeEntry.set(market, priceValue);
      }
      entry.set(type, typeEntry);
      variantPriceRows.set(variantId, entry);
    });
  }

  const resolveMarketPrice = (
    entry: Map<string, Map<string, number | null>> | undefined,
    market: "SE" | "NO" | "DK" | "FI",
    fallback: number | null | undefined
  ) => {
    if (!entry) {
      return fallback ?? null;
    }
    const readPrice = (type: string) => entry.get(type)?.get(market);
    const fixed = readPrice("b2b_fixed") ?? readPrice("b2b_dropship");
    if (fixed !== undefined && fixed !== null) return fixed;
    const calc = readPrice("b2b_calc");
    if (calc !== undefined && calc !== null) return calc;
    return fallback ?? null;
  };

  const items = variants
    .map((variant) => {
      const product =
        (Array.isArray(variant.catalog_products)
          ? variant.catalog_products[0]
          : variant.catalog_products) ??
        null;
      const productId = variant.product_id ? String(variant.product_id) : null;
      const rawVariant = variant as Record<string, unknown>;
      const fallbackTitle = product?.spu
        ? fallbackBySpu.get(String(product.spu))?.effective_long_title ?? null
        : null;
      const baseTitle = product?.title ?? fallbackTitle ?? null;
      const shortTitle =
        (productId ? shortTitleByProduct.get(productId) : null) ??
        baseTitle ??
        null;
      const priceEntry = variantPriceRows.get(String(rawVariant.id));
      const legacySe =
        rawVariant.b2b_dropship_price_se !== null &&
        rawVariant.b2b_dropship_price_se !== undefined
          ? Number(rawVariant.b2b_dropship_price_se)
          : null;
      const legacyNo =
        rawVariant.b2b_dropship_price_no !== null &&
        rawVariant.b2b_dropship_price_no !== undefined
          ? Number(rawVariant.b2b_dropship_price_no)
          : null;
      const legacyDk =
        rawVariant.b2b_dropship_price_dk !== null &&
        rawVariant.b2b_dropship_price_dk !== undefined
          ? Number(rawVariant.b2b_dropship_price_dk)
          : null;
      const legacyFi =
        rawVariant.b2b_dropship_price_fi !== null &&
        rawVariant.b2b_dropship_price_fi !== undefined
          ? Number(rawVariant.b2b_dropship_price_fi)
          : null;
      const b2bSe = resolveMarketPrice(
        priceEntry,
        "SE",
        legacySe
      );
      const b2bNo = resolveMarketPrice(
        priceEntry,
        "NO",
        legacyNo
      );
      const b2bDk = resolveMarketPrice(
        priceEntry,
        "DK",
        legacyDk
      );
      const b2bFi = resolveMarketPrice(
        priceEntry,
        "FI",
        legacyFi
      );
      const shopifyEntries = shopifyPriceMap.get(String(rawVariant.id));
      const shopifyPrices = shopifyEntries
        ? Object.fromEntries(shopifyEntries.entries())
        : {};

      return {
        id: String(rawVariant.id),
        spu: product?.spu ?? null,
        sku: (rawVariant.sku as string | null) ?? null,
        title: baseTitle,
        short_title: shortTitle,
        shipping_class: (rawVariant.shipping_class as string | null) ?? null,
        weight:
          rawVariant.weight !== null && rawVariant.weight !== undefined
            ? Number(rawVariant.weight)
            : null,
        purchase_price_cny:
          rawVariant.purchase_price_cny !== null &&
          rawVariant.purchase_price_cny !== undefined
            ? Number(rawVariant.purchase_price_cny)
            : null,
        b2b_se: b2bSe,
        b2b_no: b2bNo,
        b2b_dk: b2bDk,
        b2b_fi: b2bFi,
        b2c_price:
          rawVariant.price !== null && rawVariant.price !== undefined
            ? Number(rawVariant.price)
            : null,
        shopify_prices: shopifyPrices,
      };
    })
    .sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? ""));

  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return NextResponse.json({ items: paged, total, page, pageSize });
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

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const variantId = payload.variantId ? String(payload.variantId) : "";
  const field = payload.field ? String(payload.field) : "";
  const rawValue = payload.value;

  if (!variantId || !field) {
    return NextResponse.json(
      { error: "Missing variantId or field." },
      { status: 400 }
    );
  }

  const toNumber = (value: unknown) => {
    if (value === "" || value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const now = new Date().toISOString();

  const b2bMarketMap: Record<string, { market: string; currency: string }> = {
    b2b_se: { market: "SE", currency: "SEK" },
    b2b_no: { market: "NO", currency: "NOK" },
    b2b_dk: { market: "DK", currency: "DKK" },
    b2b_fi: { market: "FI", currency: "EUR" },
  };

  if (field in b2bMarketMap) {
    const { market, currency } = b2bMarketMap[field];
    const priceValue = toNumber(rawValue);
    if (priceValue === null) {
      const { error } = await adminClient
        .from("catalog_variant_prices")
        .update({ deleted_at: now, updated_at: now })
        .eq("catalog_variant_id", variantId)
        .eq("price_type", "b2b_fixed")
        .eq("market", market);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    const { data: existingRow, error: existingError } = await adminClient
      .from("catalog_variant_prices")
      .select("id")
      .eq("catalog_variant_id", variantId)
      .eq("price_type", "b2b_fixed")
      .eq("market", market)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existingRow?.id) {
      const { error } = await adminClient
        .from("catalog_variant_prices")
        .update({
          currency,
          price: priceValue,
          deleted_at: null,
          updated_at: now,
        })
        .eq("id", existingRow.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await adminClient.from("catalog_variant_prices").insert({
        catalog_variant_id: variantId,
        price_type: "b2b_fixed",
        market,
        currency,
        price: priceValue,
        deleted_at: null,
        updated_at: now,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (field === "b2c_price") {
    const priceValue = toNumber(rawValue);
    const { error } = await adminClient
      .from("catalog_variants")
      .update({ price: priceValue, updated_at: now })
      .eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (field === "purchase_price_cny") {
    const value = toNumber(rawValue);
    const { error } = await adminClient
      .from("catalog_variants")
      .update({ purchase_price_cny: value, updated_at: now })
      .eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (field === "weight") {
    const value = toNumber(rawValue);
    const { error } = await adminClient
      .from("catalog_variants")
      .update({ weight: value, updated_at: now })
      .eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (field === "shipping_class") {
    const value =
      rawValue !== null && rawValue !== undefined
        ? String(rawValue).toUpperCase()
        : null;
    const { error } = await adminClient
      .from("catalog_variants")
      .update({ shipping_class: value, updated_at: now })
      .eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Unsupported field." },
    { status: 400 }
  );
}
