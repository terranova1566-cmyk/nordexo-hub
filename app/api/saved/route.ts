import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls } from "@/lib/server-images";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("partner_saved_products")
    .select(
      "product_id, created_at, catalog_products(id, spu, title, subtitle, updated_at, images, product_type, image_folder)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const productIds = (data ?? [])
    .map((row) => row.product_id)
    .filter(Boolean);
  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("active_markets")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeMarkets =
    userSettings?.active_markets && userSettings.active_markets.length > 0
      ? userSettings.active_markets
      : ["SE"];

  const variantCountMap = new Map<string, number>();
  const variantPriceMap = new Map<string, { min: number; max: number }>();
  const variantPriceRows = new Map<
    string,
    { hasRows: boolean; byMarket: Map<string, number | null> }
  >();
  const variantPreviewMap = new Map<
    string,
    Array<{
      sku: string | null;
      option1: string | null;
      option2: string | null;
      option3: string | null;
      option4: string | null;
      b2b_dropship_price_se: number | null;
      b2b_dropship_price_no: number | null;
      b2b_dropship_price_dk: number | null;
      b2b_dropship_price_fi: number | null;
    }>
  >();

  if (productIds.length > 0) {
    const { data: variants } = await supabase
      .from("catalog_variants")
      .select(
        "id, product_id, sku, option1, option2, option3, option4, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi"
      )
      .in("product_id", productIds);

    const variantIds = variants?.map((variant) => variant.id).filter(Boolean) ?? [];
    if (variantIds.length > 0) {
      const { data: priceRows } = await supabase
        .from("catalog_variant_prices")
        .select("catalog_variant_id, market, currency, price")
        .in("catalog_variant_id", variantIds)
        .eq("price_type", "b2b_dropship")
        .is("deleted_at", null);

      priceRows?.forEach((row) => {
        const variantId = row.catalog_variant_id;
        if (!variantId) return;
        const entry =
          variantPriceRows.get(variantId) ?? {
            hasRows: true,
            byMarket: new Map<string, number | null>(),
          };
        entry.hasRows = true;
        const market = row.market?.toUpperCase();
        if (market) {
          let priceValue: number | null = null;
          if (row.price !== null && row.price !== undefined) {
            const numeric = Number(row.price);
            if (Number.isFinite(numeric)) {
              priceValue = numeric;
            }
          }
          entry.byMarket.set(market, priceValue);
        }
        variantPriceRows.set(variantId, entry);
      });
    }

    variants?.forEach((variant) => {
      const priceEntry = variantPriceRows.get(variant.id);
      const useTablePrices = Boolean(priceEntry?.hasRows);
      const resolveMarketPrice = (
        market: "SE" | "NO" | "DK" | "FI",
        fallback: number | null | undefined
      ) => {
        if (!useTablePrices) {
          return fallback ?? null;
        }
        if (!priceEntry) return null;
        return priceEntry.byMarket.has(market)
          ? priceEntry.byMarket.get(market) ?? null
          : null;
      };
      const priceSe = resolveMarketPrice("SE", variant.b2b_dropship_price_se);
      const priceNo = resolveMarketPrice("NO", variant.b2b_dropship_price_no);
      const priceDk = resolveMarketPrice("DK", variant.b2b_dropship_price_dk);
      const priceFi = resolveMarketPrice("FI", variant.b2b_dropship_price_fi);

      variantCountMap.set(
        variant.product_id,
        (variantCountMap.get(variant.product_id) ?? 0) + 1
      );

      const preview = variantPreviewMap.get(variant.product_id) ?? [];
      if (preview.length < 10) {
        preview.push({
          sku: variant.sku ?? null,
          option1: variant.option1 ?? null,
          option2: variant.option2 ?? null,
          option3: variant.option3 ?? null,
          option4: variant.option4 ?? null,
          b2b_dropship_price_se: priceSe,
          b2b_dropship_price_no: priceNo,
          b2b_dropship_price_dk: priceDk,
          b2b_dropship_price_fi: priceFi,
        });
        variantPreviewMap.set(variant.product_id, preview);
      }

      const rawPrice = priceSe;
      if (rawPrice === null || rawPrice === undefined) return;
      const price = Number(rawPrice);
      if (!Number.isFinite(price)) return;

      const current = variantPriceMap.get(variant.product_id);
      if (!current) {
        variantPriceMap.set(variant.product_id, { min: price, max: price });
      } else {
        const nextMin = price < current.min ? price : current.min;
        const nextMax = price > current.max ? price : current.max;
        variantPriceMap.set(variant.product_id, { min: nextMin, max: nextMax });
      }
    });
  }

  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const product = Array.isArray(row.catalog_products)
        ? row.catalog_products[0]
        : row.catalog_products;
      if (!product) return null;

      const imageUrls = await loadImageUrls(product.image_folder, {
        size: "thumb",
      });

      return {
        product_id: row.product_id,
        created_at: row.created_at,
        product,
        thumbnail_url: imageUrls[0] ?? null,
        variant_count: variantCountMap.get(product.id) ?? 0,
        price_min: variantPriceMap.get(product.id)?.min ?? null,
        price_max: variantPriceMap.get(product.id)?.max ?? null,
        variant_preview: variantPreviewMap.get(product.id) ?? [],
      };
    })
  );

  return NextResponse.json({
    items: items.filter(Boolean),
    active_markets: activeMarkets,
  });
}

export async function DELETE() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("partner_saved_products")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
