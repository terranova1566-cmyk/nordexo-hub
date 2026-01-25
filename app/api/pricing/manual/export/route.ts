import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
const EXPORT_ROOT = "/srv/incoming-scripts/uploads/pricing-exports";
const HISTORY_PATH = "/srv/incoming-scripts/uploads/pricing-exports-history.json";
const SHOPIFY_PRICE_TYPES = [
  "shopify_tingelo",
  "shopify_wellando",
  "shopify_sparklar",
  "shopify_shopify",
];

type ExportHistory = {
  id: string;
  file_name: string;
  stored_path: string;
  row_count: number;
  created_at: string;
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

const readHistory = async (): Promise<ExportHistory[]> => {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExportHistory[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = async (entries: ExportHistory[]) => {
  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(entries, null, 2));
};

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

type ExportFilters = {
  skuPrefix?: string;
  createdFrom?: string;
  createdTo?: string;
  missing?: {
    b2b?: boolean;
    b2c?: boolean;
    shopifyTingelo?: boolean;
    shopifyWellando?: boolean;
    shopifySparklar?: boolean;
  };
};

export async function POST(request: Request) {
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

  const filters = (await request.json().catch(() => null)) as ExportFilters | null;
  const skuPrefix = filters?.skuPrefix?.trim() ?? "";
  const createdFrom = filters?.createdFrom?.trim() ?? "";
  const createdTo = filters?.createdTo?.trim() ?? "";
  const missingFilters = {
    b2b: Boolean(filters?.missing?.b2b),
    b2c: Boolean(filters?.missing?.b2c),
    shopifyTingelo: Boolean(filters?.missing?.shopifyTingelo),
    shopifyWellando: Boolean(filters?.missing?.shopifyWellando),
    shopifySparklar: Boolean(filters?.missing?.shopifySparklar),
  };

  const selectFields =
    "id, sku, product_id, price, purchase_price_cny, weight, shipping_class, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi, catalog_products(spu, title, created_at)";

  const variants: Record<string, unknown>[] = [];
  let createdProductIds: string[] | null = null;
  if (createdFrom || createdTo) {
    let productQuery = adminClient
      .from("catalog_products")
      .select("id")
      .order("created_at", { ascending: false });
    if (createdFrom) productQuery = productQuery.gte("created_at", createdFrom);
    if (createdTo) {
      productQuery = productQuery.lte(
        "created_at",
        `${createdTo}T23:59:59.999Z`
      );
    }
    const { data: createdRows, error: createdError } = await productQuery;
    if (createdError) {
      return NextResponse.json({ error: createdError.message }, { status: 500 });
    }
    createdProductIds =
      createdRows?.map((row) => String(row.id)).filter(Boolean) ?? [];
    if (createdProductIds.length === 0) {
      return NextResponse.json({
        id: `pricing-${Date.now()}`,
        file_name: "",
        stored_path: "",
        row_count: 0,
        created_at: new Date().toISOString(),
      });
    }
  }

  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = adminClient
      .from("catalog_variants")
      .select(selectFields)
      .order("sku", { ascending: true });

    if (skuPrefix) {
      query = query.ilike("sku", `${skuPrefix}%`);
    }
    if (createdProductIds) {
      query = query.in("product_id", createdProductIds);
    }

    const { data, error } = await query.range(
      offset,
      offset + pageSize - 1
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    variants.push(...data);
    if (data.length < pageSize) break;
  }

  const productIds = Array.from(
    new Set(
      variants
        .map((row) => row.product_id)
        .filter(Boolean)
        .map((id) => String(id))
    )
  );
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

    const defMap = new Map(metaDefs?.map((def) => [def.id, def]) ?? []);
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

  const variantIds = variants.map((row) => String(row.id)).filter(Boolean);
  const variantPriceRows = new Map<
    string,
    Map<string, Map<string, number | null>>
  >();
  const shopifyPriceMap = new Map<
    string,
    Map<string, { price: number | null; compare: number | null }>
  >();

  for (const batch of chunk(variantIds, 500)) {
    const { data: priceRows } = await adminClient
      .from("catalog_variant_prices")
      .select("catalog_variant_id, market, price_type, price, compare_at_price")
      .in("catalog_variant_id", batch)
      .in("price_type", [
        "b2b_fixed",
        "b2b_calc",
        "b2b_dropship",
        ...SHOPIFY_PRICE_TYPES,
      ])
      .is("deleted_at", null);

    priceRows?.forEach((row) => {
      const variantId = row.catalog_variant_id;
      if (!variantId) return;
      const type = String(row.price_type || "");
      if (SHOPIFY_PRICE_TYPES.includes(type)) {
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
    if (!entry) return fallback ?? null;
    const readPrice = (type: string) => entry.get(type)?.get(market);
    const fixed = readPrice("b2b_fixed") ?? readPrice("b2b_dropship");
    if (fixed !== undefined && fixed !== null) return fixed;
    const calc = readPrice("b2b_calc");
    if (calc !== undefined && calc !== null) return calc;
    return fallback ?? null;
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pricing");
  sheet.addRow([
    "SPU",
    "SKU",
    "Short Title",
    "Shipping Class",
    "Weight (kg)",
    "Stock",
    "B2B SE",
    "B2B NO",
    "B2B DK",
    "B2B FI",
    "B2C",
    "Shopify Tingelo Price",
    "Shopify Tingelo Compare",
    "Shopify Wellando Price",
    "Shopify Wellando Compare",
    "Shopify Sparklar Price",
    "Shopify Sparklar Compare",
    "Shopify Price",
    "Shopify Compare",
  ]);

  const exportRows = variants
    .map((variant) => {
      const product =
        (Array.isArray(variant.catalog_products)
          ? variant.catalog_products[0]
          : variant.catalog_products) ?? null;
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
    const b2bSe = resolveMarketPrice(priceEntry, "SE", legacySe);
    const b2bNo = resolveMarketPrice(priceEntry, "NO", legacyNo);
    const b2bDk = resolveMarketPrice(priceEntry, "DK", legacyDk);
    const b2bFi = resolveMarketPrice(priceEntry, "FI", legacyFi);
    const shopifyEntries = shopifyPriceMap.get(String(rawVariant.id));
    const shopifyPrices = shopifyEntries
      ? Object.fromEntries(shopifyEntries.entries())
      : {};

      return {
        spu: product?.spu ?? "",
        sku: rawVariant.sku ?? "",
        shortTitle: shortTitle ?? baseTitle ?? "",
        shippingClass: rawVariant.shipping_class ?? "",
        weight: rawVariant.weight ?? "",
        purchasePrice: rawVariant.purchase_price_cny ?? "",
        b2bSe,
        b2bNo,
        b2bDk,
        b2bFi,
        b2c: rawVariant.price ?? "",
        shopifyTingeloPrice: shopifyPrices["shopify_tingelo"]?.price ?? null,
        shopifyTingeloCompare: shopifyPrices["shopify_tingelo"]?.compare ?? null,
        shopifyWellandoPrice: shopifyPrices["shopify_wellando"]?.price ?? null,
        shopifyWellandoCompare: shopifyPrices["shopify_wellando"]?.compare ?? null,
        shopifySparklarPrice: shopifyPrices["shopify_sparklar"]?.price ?? null,
        shopifySparklarCompare: shopifyPrices["shopify_sparklar"]?.compare ?? null,
        shopifyShopifyPrice: shopifyPrices["shopify_shopify"]?.price ?? null,
        shopifyShopifyCompare: shopifyPrices["shopify_shopify"]?.compare ?? null,
      };
    })
    .filter((row) => {
      if (
        !missingFilters.b2b &&
        !missingFilters.b2c &&
        !missingFilters.shopifyTingelo &&
        !missingFilters.shopifyWellando &&
        !missingFilters.shopifySparklar
      ) {
        return true;
      }
      const missingB2b =
        row.b2bSe == null ||
        row.b2bNo == null ||
        row.b2bDk == null ||
        row.b2bFi == null;
      const missingB2c = row.b2c == null || row.b2c === "";
      const missingShopifyTingelo = row.shopifyTingeloPrice == null;
      const missingShopifyWellando = row.shopifyWellandoPrice == null;
      const missingShopifySparklar = row.shopifySparklarPrice == null;

      const matches: boolean[] = [];
      if (missingFilters.b2b) matches.push(missingB2b);
      if (missingFilters.b2c) matches.push(missingB2c);
      if (missingFilters.shopifyTingelo) matches.push(missingShopifyTingelo);
      if (missingFilters.shopifyWellando) matches.push(missingShopifyWellando);
      if (missingFilters.shopifySparklar) matches.push(missingShopifySparklar);
      return matches.some(Boolean);
    });

  exportRows.forEach((row) => {
    sheet.addRow([
      row.spu,
      row.sku,
      row.shortTitle,
      row.shippingClass,
      row.weight,
      row.purchasePrice,
      row.b2bSe ?? "",
      row.b2bNo ?? "",
      row.b2bDk ?? "",
      row.b2bFi ?? "",
      row.b2c ?? "",
      row.shopifyTingeloPrice ?? "",
      row.shopifyTingeloCompare ?? "",
      row.shopifyWellandoPrice ?? "",
      row.shopifyWellandoCompare ?? "",
      row.shopifySparklarPrice ?? "",
      row.shopifySparklarCompare ?? "",
      row.shopifyShopifyPrice ?? "",
      row.shopifyShopifyCompare ?? "",
    ]);
  });

  await fs.mkdir(EXPORT_ROOT, { recursive: true });
  const id = `pricing-${Date.now()}`;
  const fileName = `${id}.xlsx`;
  const storedPath = path.join(EXPORT_ROOT, fileName);
  const buffer = await workbook.xlsx.writeBuffer();
  await fs.writeFile(storedPath, Buffer.from(buffer));

  const history = await readHistory();
  const createdAt = new Date().toISOString();
  const entry: ExportHistory = {
    id,
    file_name: fileName,
    stored_path: storedPath,
    row_count: exportRows.length,
    created_at: createdAt,
  };
  history.unshift(entry);
  await writeHistory(history.slice(0, 50));

  return NextResponse.json(entry);
}
