import type { SupabaseClient } from "@supabase/supabase-js";

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
  market: string;
  shipping_class: string;
  rate_low: number;
  rate_high: number;
  base_low: number;
  base_high: number;
  mult_low: number;
  mult_high: number;
};

type VariantRow = {
  id: string;
  shipping_class: string | null;
  purchase_price_cny: number | null;
  weight: number | null;
};

type RecalculateResult = {
  consideredVariants: number;
  processedVariants: number;
  skippedVariants: number;
  updatedRows: number;
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
};

const toNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveClassConfig = (
  classMap: Map<string, Map<string, ShippingConfig>>,
  market: string,
  shippingClass: string
) => {
  const marketMap = classMap.get(market);
  if (!marketMap) return null;
  const direct = marketMap.get(shippingClass);
  if (direct) return direct;
  return marketMap.get("NOR") ?? null;
};

const loadMarketConfigs = async (adminClient: SupabaseClient) => {
  const { data: marketRows, error } = await adminClient
    .from("b2b_pricing_markets")
    .select("*");
  if (error) {
    throw new Error(`Unable to load b2b_pricing_markets: ${error.message}`);
  }

  const markets: MarketConfig[] = (marketRows ?? [])
    .map((row) => ({
      market: String(row.market || "").toUpperCase(),
      currency: String(row.currency || "").toUpperCase(),
      fx_rate_cny: toNumber(row.fx_rate_cny) ?? 0,
      weight_threshold_g: Number(row.weight_threshold_g ?? 300),
      packing_fee: toNumber(row.packing_fee) ?? 0,
      markup_percent: toNumber(row.markup_percent) ?? 0,
      markup_fixed: toNumber(row.markup_fixed) ?? 0,
    }))
    .filter((row) => row.market && row.currency);

  if (markets.length === 0) {
    throw new Error("Missing pricing markets configuration.");
  }

  return markets;
};

const loadShippingClassMap = async (adminClient: SupabaseClient) => {
  const { data: classRows, error } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .select("*");
  if (error) {
    throw new Error(
      `Unable to load b2b_pricing_shipping_classes: ${error.message}`
    );
  }

  const classMap = new Map<string, Map<string, ShippingConfig>>();
  (classRows ?? []).forEach((row) => {
    const market = String(row.market || "").toUpperCase();
    const shippingClass = String(row.shipping_class || "").toUpperCase();
    if (!market || !shippingClass) return;
    const entry: ShippingConfig = {
      market,
      shipping_class: shippingClass,
      rate_low: toNumber(row.rate_low) ?? 0,
      rate_high: toNumber(row.rate_high) ?? 0,
      base_low: toNumber(row.base_low) ?? 0,
      base_high: toNumber(row.base_high) ?? 0,
      mult_low: toNumber(row.mult_low) ?? 1,
      mult_high: toNumber(row.mult_high) ?? 1,
    };
    const marketMap = classMap.get(market) ?? new Map();
    marketMap.set(shippingClass, entry);
    classMap.set(market, marketMap);
  });

  return classMap;
};

const loadVariantsForSpus = async (
  adminClient: SupabaseClient,
  spus: string[]
) => {
  const normalizedSpus = Array.from(
    new Set(spus.map((spu) => String(spu || "").trim()).filter(Boolean))
  );
  if (normalizedSpus.length === 0) {
    return [] as VariantRow[];
  }

  const { data: productRows, error: productError } = await adminClient
    .from("catalog_products")
    .select("id")
    .in("spu", normalizedSpus);
  if (productError) {
    throw new Error(
      `Unable to load catalog products for pricing recalc: ${productError.message}`
    );
  }

  const productIds = (productRows ?? [])
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
  if (productIds.length === 0) {
    return [] as VariantRow[];
  }

  const variants: VariantRow[] = [];
  for (const batch of chunk(productIds, 500)) {
    const { data: rows, error } = await adminClient
      .from("catalog_variants")
      .select("id, shipping_class, purchase_price_cny, weight")
      .in("product_id", batch);
    if (error) {
      throw new Error(
        `Unable to load catalog variants for pricing recalc: ${error.message}`
      );
    }
    (rows ?? []).forEach((row) => {
      if (!row.id) return;
      variants.push({
        id: String(row.id),
        shipping_class: row.shipping_class ?? null,
        purchase_price_cny: toNumber(row.purchase_price_cny),
        weight: toNumber(row.weight),
      });
    });
  }

  return variants;
};

export async function recalculateB2BPricesForSpus(
  adminClient: SupabaseClient,
  spus: string[]
): Promise<RecalculateResult> {
  const markets = await loadMarketConfigs(adminClient);
  const classMap = await loadShippingClassMap(adminClient);
  const variants = await loadVariantsForSpus(adminClient, spus);

  if (variants.length === 0) {
    return {
      consideredVariants: 0,
      processedVariants: 0,
      skippedVariants: 0,
      updatedRows: 0,
    };
  }

  const now = new Date().toISOString();
  const priceRows: Array<{
    catalog_variant_id: string;
    price_type: string;
    market: string;
    currency: string;
    price: number;
    shop_id: null;
    deleted_at: null;
    updated_at: string;
  }> = [];

  let processed = 0;
  let skipped = 0;

  for (const variant of variants) {
    const purchaseCny = toNumber(variant.purchase_price_cny);
    const weightKg = toNumber(variant.weight);
    if (purchaseCny === null || weightKg === null) {
      skipped += 1;
      continue;
    }

    const weightG = weightKg * 1000;
    const shippingClass = String(variant.shipping_class || "NOR").toUpperCase();
    let variantProducedRows = false;

    markets.forEach((market) => {
      const classConfig = resolveClassConfig(
        classMap,
        market.market,
        shippingClass
      );
      if (!classConfig) {
        skipped += 1;
        return;
      }

      const useLow = weightG <= market.weight_threshold_g;
      const rate = useLow ? classConfig.rate_low : classConfig.rate_high;
      const base = useLow ? classConfig.base_low : classConfig.base_high;
      const mult = useLow ? classConfig.mult_low : classConfig.mult_high;
      const shippingCny = weightG * mult * rate + base;
      const shippingLocal = shippingCny * market.fx_rate_cny + market.packing_fee;
      const stockLocal = purchaseCny * market.fx_rate_cny;
      const totalCost = stockLocal + shippingLocal;
      const rawPrice =
        totalCost * (1 + market.markup_percent) + market.markup_fixed;
      const price =
        market.currency === "EUR"
          ? Number(rawPrice.toFixed(2))
          : Math.round(rawPrice);

      if (!Number.isFinite(price)) {
        skipped += 1;
        return;
      }

      priceRows.push({
        catalog_variant_id: variant.id,
        price_type: "b2b_calc",
        market: market.market,
        currency: market.currency,
        price,
        shop_id: null,
        deleted_at: null,
        updated_at: now,
      });
      variantProducedRows = true;
    });

    if (variantProducedRows) {
      processed += 1;
    }
  }

  const variantIds = variants.map((variant) => variant.id);
  const b2bPriceTypesToReplace = ["b2b_calc", "b2b_fixed"];
  for (const batch of chunk(variantIds, 500)) {
    const { error: deleteError } = await adminClient
      .from("catalog_variant_prices")
      .delete()
      .in("price_type", b2bPriceTypesToReplace)
      .in("catalog_variant_id", batch);
    if (deleteError) {
      throw new Error(
        `Unable to delete existing b2b pricing rows: ${deleteError.message}`
      );
    }
  }

  const allB2BPriceRows = [
    ...priceRows,
    ...priceRows.map((row) => ({
      ...row,
      price_type: "b2b_fixed",
    })),
  ];

  for (const batch of chunk(allB2BPriceRows, 1000)) {
    if (batch.length === 0) continue;
    const { error: insertError } = await adminClient
      .from("catalog_variant_prices")
      .insert(batch);
    if (insertError) {
      throw new Error(`Unable to insert b2b pricing rows: ${insertError.message}`);
    }
  }

  const b2bByVariant = new Map<
    string,
    { SE: number | null; NO: number | null; DK: number | null; FI: number | null }
  >();
  variants.forEach((variant) => {
    b2bByVariant.set(variant.id, { SE: null, NO: null, DK: null, FI: null });
  });
  priceRows.forEach((row) => {
    const entry = b2bByVariant.get(row.catalog_variant_id);
    if (!entry) return;
    const market = String(row.market || "").toUpperCase();
    if (market === "SE") entry.SE = row.price;
    if (market === "NO") entry.NO = row.price;
    if (market === "DK") entry.DK = row.price;
    if (market === "FI") entry.FI = row.price;
  });

  for (const [variantId, prices] of b2bByVariant.entries()) {
    const { error: variantUpdateError } = await adminClient
      .from("catalog_variants")
      .update({
        b2b_dropship_price_se: prices.SE,
        b2b_dropship_price_no: prices.NO,
        b2b_dropship_price_dk: prices.DK,
        b2b_dropship_price_fi: prices.FI,
        updated_at: now,
      })
      .eq("id", variantId);
    if (variantUpdateError) {
      throw new Error(
        `Unable to sync catalog_variants B2B price columns: ${variantUpdateError.message}`
      );
    }
  }

  return {
    consideredVariants: variants.length,
    processedVariants: processed,
    skippedVariants: skipped,
    updatedRows: priceRows.length,
  };
}
