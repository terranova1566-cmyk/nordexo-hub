import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls, resolveImageUrl } from "@/lib/server-images";

const PRODUCT_META_KEYS = [
  "description_short",
  "description_extended",
  "short_title",
  "long_title",
  "subtitle",
  "subtitle_sv",
  "bullets_short",
  "bullets",
  "bullets_long",
  "specs",
];
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; adminClient: AdminClient }
> => {
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

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient: adminClient as AdminClient };
};

const extractTextValue = (row: {
  value_text?: string | null;
  value_number?: number | null;
  value?: unknown;
  value_json?: unknown;
}) => {
  if (row.value_text) return row.value_text;
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number);
  }
  if (typeof row.value === "string") return row.value;
  if (row.value_json !== null && row.value_json !== undefined) {
    return JSON.stringify(row.value_json);
  }
  if (row.value != null) {
    return JSON.stringify(row.value);
  }
  return null;
};

const normalizeText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeBoolean = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (["true", "1", "yes", "y"].includes(raw)) return true;
  if (["false", "0", "no", "n"].includes(raw)) return false;
  return null;
};

const normalizeList = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) || typeof value === "object") return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to list parsing
    }
  }
  const parts = raw
    .split(/[\r\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("active_markets, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeMarkets =
    userSettings?.active_markets && userSettings.active_markets.length > 0
      ? userSettings.active_markets
      : ["SE"];
  const isAdmin = Boolean(userSettings?.is_admin);

  const { data: product, error: productError } = await supabase
    .from("catalog_products")
    .select(
      "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, shopify_category_id, shopify_category_path, image_folder, images, updated_at, created_at, visible_updated_at, brand, vendor, nordic_partner_enabled, option1_name, option2_name, option3_name, option4_name, supplier_1688_url, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, product_categorizer_keywords, shopify_tingelo_sync, shopify_collection_handles, shopify_collection_ids, shopify_tingelo_category_keys, video_files, is_blocked, blocked_at, blocked_by, legacy_title_sv, legacy_description_sv, legacy_bullets_sv"
    )
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (!product || (!isAdmin && !product.nordic_partner_enabled)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: fallbackRow } = product.spu
    ? await supabase
        .from("catalog_products_fallback")
        .select("effective_long_title, effective_description_html, effective_bullets")
        .eq("spu", product.spu)
        .maybeSingle()
    : { data: null };

  const resolvedTitle =
    product.title ?? fallbackRow?.effective_long_title ?? null;
  const resolvedDescription =
    product.description_html ??
    fallbackRow?.effective_description_html ??
    null;
  const resolvedProduct = {
    ...product,
    title: resolvedTitle,
    description_html: resolvedDescription,
  };

  const { data: variants, error: variantError } = await supabase
    .from("catalog_variants")
    .select(
      "id, sku, sku_norm, sku_bak, inventory_quantity, option1, option2, option3, option4, option_combined_zh, option1_zh, option2_zh, option3_zh, option4_zh, short_title_zh, variation_color_se, variation_size_se, variation_other_se, variation_amount_se, price, compare_at_price, cost, variant_image_url, barcode, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi, shipping_name_en, shipping_name_zh, shipping_class, weight, purchase_price_cny, supplier_name, supplier_location, tax_code, hs_code, country_of_origin, category_code_fq, category_code_ld, taxable"
    )
    .eq("product_id", id)
    .order("sku", { ascending: true });

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const { data: savedRow } = await supabase
    .from("partner_saved_products")
    .select("id")
    .eq("product_id", id)
    .maybeSingle();

  const { data: exportRows } = await supabase
    .from("partner_export_items")
    .select("partner_exports(created_at, user_id)")
    .eq("partner_exports.user_id", user.id)
    .eq("product_id", id);

  const latestExport = exportRows
    ?.map((row) => {
      const exportData = row.partner_exports as
        | { created_at?: string }
        | Array<{ created_at?: string }>
        | undefined;
      return Array.isArray(exportData)
        ? exportData[0]?.created_at
        : exportData?.created_at;
    })
    .filter(Boolean)
    .sort()
    .pop();

  const variantIds = variants?.map((variant) => variant.id).filter(Boolean) ?? [];
  const variantPriceRows = new Map<
    string,
    Map<string, Map<string, number | null>>
  >();

  if (variantIds.length > 0) {
    const { data: priceRows } = await supabase
      .from("catalog_variant_prices")
      .select("catalog_variant_id, market, currency, price, price_type")
      .in("catalog_variant_id", variantIds)
      .in("price_type", ["b2b_fixed", "b2b_calc", "b2b_dropship"])
      .is("deleted_at", null);

    priceRows?.forEach((row) => {
      const variantId = row.catalog_variant_id;
      if (!variantId) return;
      const type = String(row.price_type || "b2b_dropship");
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

  const resolvedVariants = await Promise.all(
    (variants ?? []).map(async (variant) => {
      const resolveMarketPrice = (
        market: "SE" | "NO" | "DK" | "FI",
        fallback: number | null | undefined
      ) => {
        const priceEntry = variantPriceRows.get(variant.id);
        if (!priceEntry) return fallback ?? null;
        const readPrice = (type: string) => priceEntry.get(type)?.get(market);
        const fixed = readPrice("b2b_fixed") ?? readPrice("b2b_dropship");
        if (fixed !== undefined && fixed !== null) return fixed;
        const calc = readPrice("b2b_calc");
        if (calc !== undefined && calc !== null) return calc;
        return fallback ?? null;
      };

      return {
        ...variant,
        b2b_dropship_price_se: resolveMarketPrice(
          "SE",
          variant.b2b_dropship_price_se
        ),
        b2b_dropship_price_no: resolveMarketPrice(
          "NO",
          variant.b2b_dropship_price_no
        ),
        b2b_dropship_price_dk: resolveMarketPrice(
          "DK",
          variant.b2b_dropship_price_dk
        ),
        b2b_dropship_price_fi: resolveMarketPrice(
          "FI",
          variant.b2b_dropship_price_fi
        ),
        variant_image_url: await resolveImageUrl(
          product.image_folder,
          variant.variant_image_url,
          { size: "thumb" }
        ),
      };
    })
  );

  const { data: metaDefs } = await supabase
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);

  const metaDefMap = new Map(
    metaDefs?.map((def) => [def.id, def]) ?? []
  );
  const metaDefIds = Array.from(metaDefMap.keys());
  const metaValuesByKey = new Map<string, Map<string, string>>();

  if (metaDefIds.length > 0) {
    const { data: metaValues } = await supabase
      .from("metafield_values")
      .select("definition_id, value_text, value, value_number, value_json")
      .eq("target_type", "product")
      .eq("target_id", id)
      .in("definition_id", metaDefIds);

    metaValues?.forEach((row) => {
      const def = metaDefMap.get(row.definition_id);
      if (!def) return;
      let text: string | null = null;
      if (row.value_text) {
        text = row.value_text;
      } else if (row.value_number !== null && row.value_number !== undefined) {
        text = String(row.value_number);
      } else if (typeof row.value === "string") {
        text = row.value;
      } else if (row.value_json !== null && row.value_json !== undefined) {
        text = JSON.stringify(row.value_json);
      } else if (row.value != null) {
        text = JSON.stringify(row.value);
      }

      if (!text) return;
      const key = def.key;
      const namespace = def.namespace ?? "";
      const byNamespace = metaValuesByKey.get(key) ?? new Map<string, string>();
      byNamespace.set(namespace, text);
      metaValuesByKey.set(key, byNamespace);
    });
  }

  const pickMetaValue = (key: string) => {
    const byNamespace = metaValuesByKey.get(key);
    if (!byNamespace) return null;
    for (const namespace of PRODUCT_META_NAMESPACES) {
      const value = byNamespace.get(namespace);
      if (value) return value;
    }
    return null;
  };

  const descriptionShort = pickMetaValue("description_short");
  const descriptionExtended = pickMetaValue("description_extended");
  const shortTitle = pickMetaValue("short_title");
  const longTitle =
    pickMetaValue("long_title") ??
    fallbackRow?.effective_long_title ??
    resolvedTitle ??
    null;
  const subtitle =
    pickMetaValue("subtitle") ??
    pickMetaValue("subtitle_sv") ??
    product.subtitle ??
    null;
  const bulletsShort = pickMetaValue("bullets_short");
  const bullets = pickMetaValue("bullets") ?? fallbackRow?.effective_bullets ?? null;
  const bulletsLong = pickMetaValue("bullets_long");
  const specs = pickMetaValue("specs");

  const { data: allMetaDefs } = await supabase
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product");

  const allMetaDefIds = (allMetaDefs ?? [])
    .map((def) => def.id)
    .filter(Boolean);
  const metaValuesByDef = new Map<string, string>();

  if (allMetaDefIds.length > 0) {
    const { data: metaValues } = await supabase
      .from("metafield_values")
      .select("definition_id, value_text, value, value_number, value_json")
      .eq("target_type", "product")
      .eq("target_id", id)
      .in("definition_id", allMetaDefIds);

    metaValues?.forEach((row) => {
      const definitionId = row.definition_id;
      if (!definitionId) return;
      const text = extractTextValue(row);
      if (!text) return;
      metaValuesByDef.set(String(definitionId), text);
    });
  }

  const internalMetafields = (allMetaDefs ?? [])
    .filter((def) => {
      const key = def.key ?? "";
      const namespace = def.namespace ?? "";
      const isVisible =
        PRODUCT_META_KEYS.includes(key) &&
        PRODUCT_META_NAMESPACES.includes(namespace);
      return !isVisible;
    })
    .map((def) => ({
      id: def.id,
      key: def.key ?? "",
      namespace: def.namespace ?? "",
      value: metaValuesByDef.get(String(def.id)) ?? null,
    }))
    .sort((a, b) => {
      const ns = a.namespace.localeCompare(b.namespace);
      if (ns !== 0) return ns;
      return a.key.localeCompare(b.key);
    });

  const [imageUrls, thumbnailUrls, originalUrls] = await Promise.all([
    loadImageUrls(product.image_folder, { size: "standard" }),
    loadImageUrls(product.image_folder, { size: "thumb" }),
    loadImageUrls(product.image_folder, { size: "original" }),
  ]);

  return NextResponse.json({
    product: resolvedProduct,
    variants: resolvedVariants,
    is_saved: Boolean(savedRow),
    is_exported: Boolean(latestExport),
    latest_exported_at: latestExport ?? null,
    active_markets: activeMarkets,
    image_urls: imageUrls,
    thumbnail_urls: thumbnailUrls,
    original_urls: originalUrls,
    short_title: shortTitle,
    long_title: longTitle,
    description_short: descriptionShort,
    description_extended: descriptionExtended,
    subtitle,
    bullets_short: bulletsShort,
    bullets,
    bullets_long: bulletsLong,
    specs,
    internal_metafields: internalMetafields,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { id } = await context.params;
  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const productPayload = payload?.product ?? null;
  const variantsPayload = Array.isArray(payload?.variants) ? payload.variants : [];
  const metafieldsPayload = Array.isArray(payload?.metafields)
    ? payload.metafields
    : [];

  const productUpdates: Record<string, unknown> = {};
  const setProductField = (field: string, value: unknown) => {
    if (!productPayload || !(field in productPayload)) return;
    productUpdates[field] = normalizeText(value);
  };
  const setProductListField = (field: string, value: unknown) => {
    if (!productPayload || !(field in productPayload)) return;
    productUpdates[field] = normalizeList(value);
  };
  const setProductBoolField = (field: string, value: unknown) => {
    if (!productPayload || !(field in productPayload)) return;
    productUpdates[field] = normalizeBoolean(value);
  };

  setProductField("supplier_1688_url", productPayload?.supplier_1688_url);
  setProductField("product_type", productPayload?.product_type);
  setProductField("brand", productPayload?.brand);
  setProductField("vendor", productPayload?.vendor);
  setProductField("tags", productPayload?.tags);
  setProductField("shopify_category_name", productPayload?.shopify_category_name);
  setProductField("shopify_category_path", productPayload?.shopify_category_path);
  setProductField("shopify_category_id", productPayload?.shopify_category_id);
  setProductField("google_taxonomy_l1", productPayload?.google_taxonomy_l1);
  setProductField("google_taxonomy_l2", productPayload?.google_taxonomy_l2);
  setProductField("google_taxonomy_l3", productPayload?.google_taxonomy_l3);
  setProductField(
    "product_categorizer_keywords",
    productPayload?.product_categorizer_keywords
  );
  setProductField("option1_name", productPayload?.option1_name);
  setProductField("option2_name", productPayload?.option2_name);
  setProductField("option3_name", productPayload?.option3_name);
  setProductField("option4_name", productPayload?.option4_name);
  setProductField("image_folder", productPayload?.image_folder);
  setProductListField("images", productPayload?.images);
  setProductListField("video_files", productPayload?.video_files);
  setProductListField(
    "shopify_collection_handles",
    productPayload?.shopify_collection_handles
  );
  setProductListField(
    "shopify_collection_ids",
    productPayload?.shopify_collection_ids
  );
  setProductListField(
    "shopify_tingelo_category_keys",
    productPayload?.shopify_tingelo_category_keys
  );
  setProductBoolField(
    "shopify_tingelo_sync",
    productPayload?.shopify_tingelo_sync
  );
  setProductBoolField(
    "nordic_partner_enabled",
    productPayload?.nordic_partner_enabled
  );
  setProductBoolField("is_blocked", productPayload?.is_blocked);
  setProductField("blocked_at", productPayload?.blocked_at);
  setProductField("blocked_by", productPayload?.blocked_by);
  setProductField("legacy_title_sv", productPayload?.legacy_title_sv);
  setProductField("legacy_description_sv", productPayload?.legacy_description_sv);
  setProductField("legacy_bullets_sv", productPayload?.legacy_bullets_sv);

  const { adminClient } = adminCheck;

  if (Object.keys(productUpdates).length > 0) {
    const { error: productError } = await adminClient
      .from("catalog_products")
      .update(productUpdates)
      .eq("id", id);

    if (productError) {
      return NextResponse.json(
        { error: productError.message },
        { status: 500 }
      );
    }
  }

  if (variantsPayload.length > 0) {
    for (const entry of variantsPayload) {
      if (!entry?.id) continue;
      const variantUpdates: Record<string, unknown> = {};
      const setVariantText = (field: string) => {
        if (!(field in entry)) return;
        variantUpdates[field] = normalizeText(entry[field]);
      };
      const setVariantNumber = (field: string) => {
        if (!(field in entry)) return;
        variantUpdates[field] = normalizeNumber(entry[field]);
      };
      const setVariantBool = (field: string) => {
        if (!(field in entry)) return;
        variantUpdates[field] = normalizeBoolean(entry[field]);
      };

      setVariantText("sku_norm");
      setVariantText("sku_bak");
      setVariantText("option1");
      setVariantText("option2");
      setVariantText("option3");
      setVariantText("option4");
      setVariantText("option_combined_zh");
      setVariantText("option1_zh");
      setVariantText("option2_zh");
      setVariantText("option3_zh");
      setVariantText("option4_zh");
      setVariantText("short_title_zh");
      setVariantText("variation_color_se");
      setVariantText("variation_size_se");
      setVariantText("variation_other_se");
      setVariantText("variation_amount_se");
      setVariantText("variant_image_url");
      setVariantText("supplier_name");
      setVariantText("supplier_location");
      setVariantText("shipping_name_en");
      setVariantText("shipping_name_zh");
      setVariantText("shipping_class");
      setVariantText("tax_code");
      setVariantText("hs_code");
      setVariantText("country_of_origin");
      setVariantText("category_code_fq");
      setVariantText("category_code_ld");
      setVariantText("barcode");

      setVariantNumber("weight");
      setVariantNumber("purchase_price_cny");
      setVariantNumber("cost");
      setVariantNumber("price");
      setVariantNumber("compare_at_price");
      setVariantNumber("inventory_quantity");
      setVariantNumber("b2b_dropship_price_se");
      setVariantNumber("b2b_dropship_price_no");
      setVariantNumber("b2b_dropship_price_dk");
      setVariantNumber("b2b_dropship_price_fi");

      setVariantBool("taxable");

      if (Object.keys(variantUpdates).length === 0) continue;
      const { error: variantError } = await adminClient
        .from("catalog_variants")
        .update(variantUpdates)
        .eq("id", entry.id);

      if (variantError) {
        return NextResponse.json(
          { error: variantError.message },
          { status: 500 }
        );
      }
    }
  }

  if (metafieldsPayload.length > 0) {
    const upserts: Array<Record<string, unknown>> = [];
    const deleteIds: string[] = [];

    for (const entry of metafieldsPayload) {
      const defId = entry?.definition_id ?? entry?.id;
      if (!defId) continue;
      const normalized = normalizeText(entry?.value);
      if (!normalized) {
        deleteIds.push(String(defId));
        continue;
      }
      upserts.push({
        definition_id: defId,
        target_type: "product",
        target_id: id,
        value_text: normalized,
        value_number: null,
        value_json: null,
        value: null,
      });
    }

    if (upserts.length > 0) {
      const { error: metaError } = await adminClient
        .from("metafield_values")
        .upsert(upserts, {
          onConflict: "definition_id,target_type,target_id",
        });

      if (metaError) {
        return NextResponse.json({ error: metaError.message }, { status: 500 });
      }
    }

    if (deleteIds.length > 0) {
      const { error: deleteError } = await adminClient
        .from("metafield_values")
        .delete()
        .eq("target_type", "product")
        .eq("target_id", id)
        .in("definition_id", deleteIds);

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
