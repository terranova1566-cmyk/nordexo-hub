import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

const toNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
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
  market: string;
  shipping_class: string;
  rate_low: number;
  rate_high: number;
  base_low: number;
  base_high: number;
  mult_low: number;
  mult_high: number;
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

export async function POST() {
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

  const { data: marketRows, error: marketError } = await adminClient
    .from("b2b_pricing_markets")
    .select("*");

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  const { data: classRows, error: classError } = await adminClient
    .from("b2b_pricing_shipping_classes")
    .select("*");

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 });
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
    return NextResponse.json(
      { error: "Missing pricing markets configuration." },
      { status: 400 }
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

  const pageSize = 500;
  let from = 0;
  let processed = 0;
  let skipped = 0;
  let updatedRows = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data: variants, error: variantError } = await adminClient
      .from("catalog_variants")
      .select("id, shipping_class, purchase_price_cny, weight")
      .order("id", { ascending: true })
      .range(from, to);

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }

    if (!variants || variants.length === 0) break;

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

    for (const variant of variants) {
      const purchaseCny = toNumber(variant.purchase_price_cny);
      const weightKg = toNumber(variant.weight);
      if (purchaseCny === null || weightKg === null) {
        skipped += 1;
        continue;
      }
      const weightG = weightKg * 1000;
      const shippingClass = String(variant.shipping_class || "NOR").toUpperCase();

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
          updated_at: new Date().toISOString(),
        });
      });

      processed += 1;
    }

    if (priceRows.length > 0) {
      const variantIds = Array.from(
        new Set(priceRows.map((row) => row.catalog_variant_id))
      );

      const { error: deleteError } = await adminClient
        .from("catalog_variant_prices")
        .delete()
        .eq("price_type", "b2b_calc")
        .in("catalog_variant_id", variantIds);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      const { error: insertError } = await adminClient
        .from("catalog_variant_prices")
        .insert(priceRows);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      updatedRows += priceRows.length;
    }

    if (variants.length < pageSize) break;
    from += pageSize;
  }

  return NextResponse.json({
    ok: true,
    processedVariants: processed,
    skippedVariants: skipped,
    updatedRows,
  });
}
