import { NextResponse } from "next/server";
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
      "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, shopify_category_id, shopify_category_path, image_folder, images, updated_at, brand, vendor, nordic_partner_enabled, option4_name"
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
      "id, sku, option1, option2, option3, option4, variation_color_se, variation_size_se, variation_other_se, variation_amount_se, price, variant_image_url, barcode, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi"
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
  });
}
