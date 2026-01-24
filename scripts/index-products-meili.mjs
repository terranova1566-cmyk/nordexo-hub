import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { MeiliSearch } from "meilisearch";

const ROOT = "/srv";
const ENV_FILES = [
  "/srv/partner-product-explorer/.env.local",
  "/srv/node-tools/.env",
  "/srv/shopify-sync/.env",
];

const loadEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").trim();
    }
  }
};

ENV_FILES.forEach(loadEnv);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const MEILI_HOST = process.env.MEILI_HOST;
const MEILI_API_KEY = process.env.MEILI_API_KEY;
const MEILI_INDEX_PRODUCTS = process.env.MEILI_INDEX_PRODUCTS ?? "catalog_products";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE.");
}
if (!MEILI_HOST || !MEILI_API_KEY) {
  throw new Error("Missing MEILI_HOST or MEILI_API_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });

const PRODUCT_META_KEYS = [
  "description_short",
  "description_extended",
  "short_title",
  "medium_title",
  "long_title",
  "subtitle",
  "bullets_short",
  "bullets",
  "bullets_long",
  "specs",
];
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];

const toTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const sanitizeArray = (value) =>
  Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
};

const ensureIndex = async () => {
  try {
    await meili.getIndex(MEILI_INDEX_PRODUCTS);
  } catch {
    await meili.createIndex(MEILI_INDEX_PRODUCTS, { primaryKey: "id" });
  }
  const index = meili.index(MEILI_INDEX_PRODUCTS);
  await index.updateSettings({
    searchableAttributes: [
      "title",
      "spu",
      "meta_long_title",
      "meta_short_title",
      "meta_medium_title",
      "meta_subtitle",
      "subtitle",
      "fallback_long_title",
      "description_html",
      "meta_description_short",
      "meta_description_extended",
      "fallback_description_html",
      "legacy_title_sv",
      "legacy_description_sv",
      "legacy_bullets_sv",
      "meta_bullets",
      "fallback_bullets",
      "product_categorizer_keywords",
      "tags",
      "brand",
      "vendor",
      "product_type",
      "shopify_category_name",
      "shopify_category_path",
      "google_taxonomy_l1",
      "google_taxonomy_l2",
      "google_taxonomy_l3",
      "variant_skus",
      "variant_sku_norms",
      "variant_barcodes",
      "variant_options",
      "option1_zh",
      "option2_zh",
      "option3_zh",
      "option4_zh",
      "option_combined_zh",
      "shipping_name_en",
      "shipping_name_zh",
      "short_title_zh",
      "supplier_name",
    ],
    filterableAttributes: [
      "id",
      "spu",
      "brand",
      "vendor",
      "brand_is_empty",
      "vendor_is_empty",
      "google_taxonomy_l1",
      "google_taxonomy_l2",
      "google_taxonomy_l3",
      "nordic_partner_enabled",
      "is_blocked",
      "variant_count",
      "updated_at",
      "created_at",
      "tags",
    ],
    sortableAttributes: ["updated_at", "title"],
  });
  return index;
};

const loadMetaDefinitions = async () => {
  const { data, error } = await supabase
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

const metaDefs = await loadMetaDefinitions();
const metaDefMap = new Map(metaDefs.map((def) => [def.id, def]));
const metaDefIds = Array.from(metaDefMap.keys());

const index = await ensureIndex();

const PAGE_SIZE = Number(process.env.MEILI_BATCH_SIZE ?? 200);
let offset = 0;
let indexed = 0;

while (true) {
  const { data: products, error } = await supabase
    .from("catalog_products")
    .select(
      "id, spu, title, subtitle, description_html, tags, product_type, shopify_category_name, shopify_category_path, google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3, product_categorizer_keywords, legacy_title_sv, legacy_description_sv, legacy_bullets_sv, updated_at, created_at, brand, vendor, nordic_partner_enabled, is_blocked"
    )
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    throw new Error(error.message);
  }

  if (!products || products.length === 0) break;

  const productIds = products.map((product) => product.id);
  const spus = products.map((product) => product.spu).filter(Boolean);

  const fallbackBySpu = new Map();
  if (spus.length > 0) {
    const { data: fallbackRows } = await supabase
      .from("catalog_products_fallback")
      .select("spu, effective_long_title, effective_description_html, effective_bullets")
      .in("spu", spus);
    fallbackRows?.forEach((row) => {
      if (row.spu) fallbackBySpu.set(row.spu, row);
    });
  }

  const variantsByProduct = new Map();
  if (productIds.length > 0) {
    const { data: variants, error: variantError } = await supabase
      .from("catalog_variants")
      .select(
        "product_id, sku, sku_norm, barcode, option1, option2, option3, option4, option1_zh, option2_zh, option3_zh, option4_zh, option_combined_zh, shipping_name_en, shipping_name_zh, short_title_zh, supplier_name"
      )
      .in("product_id", productIds);

    if (variantError) {
      throw new Error(variantError.message);
    }

    (variants ?? []).forEach((variant) => {
      const entry =
        variantsByProduct.get(variant.product_id) ?? {
          count: 0,
          skus: [],
          skuNorms: [],
          barcodes: [],
          options: [],
          option1_zh: [],
          option2_zh: [],
          option3_zh: [],
          option4_zh: [],
          option_combined_zh: [],
          shipping_name_en: [],
          shipping_name_zh: [],
          short_title_zh: [],
          supplier_name: [],
        };
      entry.count += 1;
      if (variant.sku) entry.skus.push(String(variant.sku));
      if (variant.sku_norm) entry.skuNorms.push(String(variant.sku_norm));
      if (variant.barcode) entry.barcodes.push(String(variant.barcode));
      const optionValues = [
        variant.option1,
        variant.option2,
        variant.option3,
        variant.option4,
      ]
        .filter(Boolean)
        .map((value) => String(value));
      entry.options.push(...optionValues);
      if (variant.option1_zh) entry.option1_zh.push(String(variant.option1_zh));
      if (variant.option2_zh) entry.option2_zh.push(String(variant.option2_zh));
      if (variant.option3_zh) entry.option3_zh.push(String(variant.option3_zh));
      if (variant.option4_zh) entry.option4_zh.push(String(variant.option4_zh));
      if (variant.option_combined_zh) {
        entry.option_combined_zh.push(String(variant.option_combined_zh));
      }
      if (variant.shipping_name_en) {
        entry.shipping_name_en.push(String(variant.shipping_name_en));
      }
      if (variant.shipping_name_zh) {
        entry.shipping_name_zh.push(String(variant.shipping_name_zh));
      }
      if (variant.short_title_zh) {
        entry.short_title_zh.push(String(variant.short_title_zh));
      }
      if (variant.supplier_name) {
        entry.supplier_name.push(String(variant.supplier_name));
      }
      variantsByProduct.set(variant.product_id, entry);
    });
  }

  const metaValuesByProduct = new Map();
  if (metaDefIds.length > 0 && productIds.length > 0) {
    const { data: metaValues, error: metaError } = await supabase
      .from("metafield_values")
      .select("definition_id, target_id, value_text, value, value_number, value_json")
      .eq("target_type", "product")
      .in("definition_id", metaDefIds)
      .in("target_id", productIds);

    if (metaError) {
      throw new Error(metaError.message);
    }

    metaValues?.forEach((row) => {
      const def = metaDefMap.get(row.definition_id);
      if (!def) return;
      let text = null;
      if (row.value_text) text = row.value_text;
      else if (row.value_number !== null && row.value_number !== undefined) {
        text = String(row.value_number);
      } else if (typeof row.value === "string") {
        text = row.value;
      } else if (row.value_json !== null && row.value_json !== undefined) {
        text = JSON.stringify(row.value_json);
      } else if (row.value != null) {
        text = JSON.stringify(row.value);
      }
      if (!text) return;
      const entry =
        metaValuesByProduct.get(row.target_id) ?? new Map();
      const key = def.key;
      entry.set(key, text);
      metaValuesByProduct.set(row.target_id, entry);
    });
  }

  const docs = products.map((product) => {
    const fallback = product.spu ? fallbackBySpu.get(product.spu) : null;
    const resolvedTitle =
      product.title ?? fallback?.effective_long_title ?? null;
    const resolvedDescription =
      product.description_html ??
      fallback?.effective_description_html ??
      null;
    const meta = metaValuesByProduct.get(product.id) ?? new Map();
    const variant = variantsByProduct.get(product.id) ?? { count: 0 };
    const updatedAt = toTimestamp(product.updated_at);
    const createdAt = toTimestamp(product.created_at) ?? updatedAt;

    return {
      id: product.id,
      spu: product.spu ?? null,
      title: resolvedTitle,
      subtitle: product.subtitle ?? null,
      description_html: resolvedDescription,
      legacy_title_sv: product.legacy_title_sv ?? null,
      legacy_description_sv: product.legacy_description_sv ?? null,
      legacy_bullets_sv: product.legacy_bullets_sv ?? null,
      product_categorizer_keywords: product.product_categorizer_keywords ?? null,
      tags: product.tags ?? null,
      brand: product.brand ?? null,
      vendor: product.vendor ?? null,
      product_type: product.product_type ?? null,
      shopify_category_name: product.shopify_category_name ?? null,
      shopify_category_path: product.shopify_category_path ?? null,
      google_taxonomy_l1: product.google_taxonomy_l1 ?? null,
      google_taxonomy_l2: product.google_taxonomy_l2 ?? null,
      google_taxonomy_l3: product.google_taxonomy_l3 ?? null,
      meta_long_title: meta.get("long_title") ?? null,
      meta_short_title: meta.get("short_title") ?? null,
      meta_medium_title: meta.get("medium_title") ?? null,
      meta_subtitle: meta.get("subtitle") ?? null,
      meta_description_short: meta.get("description_short") ?? null,
      meta_description_extended: meta.get("description_extended") ?? null,
      meta_bullets: meta.get("bullets") ?? null,
      fallback_long_title: fallback?.effective_long_title ?? null,
      fallback_description_html: fallback?.effective_description_html ?? null,
      fallback_bullets: fallback?.effective_bullets ?? null,
      meta_specs: meta.get("specs") ?? null,
      variant_count: variant.count ?? 0,
      variant_skus: sanitizeArray(variant.skus),
      variant_sku_norms: sanitizeArray(variant.skuNorms),
      variant_barcodes: sanitizeArray(variant.barcodes),
      variant_options: sanitizeArray(variant.options),
      option1_zh: sanitizeArray(variant.option1_zh),
      option2_zh: sanitizeArray(variant.option2_zh),
      option3_zh: sanitizeArray(variant.option3_zh),
      option4_zh: sanitizeArray(variant.option4_zh),
      option_combined_zh: sanitizeArray(variant.option_combined_zh),
      shipping_name_en: sanitizeArray(variant.shipping_name_en),
      shipping_name_zh: sanitizeArray(variant.shipping_name_zh),
      short_title_zh: sanitizeArray(variant.short_title_zh),
      supplier_name: sanitizeArray(variant.supplier_name),
      nordic_partner_enabled: Boolean(product.nordic_partner_enabled),
      is_blocked: Boolean(product.is_blocked),
      brand_is_empty: !product.brand,
      vendor_is_empty: !product.vendor,
      updated_at: updatedAt,
      created_at: createdAt,
    };
  });

  await index.addDocuments(docs);
  indexed += docs.length;
  offset += PAGE_SIZE;
  process.stdout.write(`Indexed ${indexed} products...\\n`);
}

process.stdout.write(`Done. Indexed ${indexed} products.\\n`);
