import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { once } from 'events';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const EXCLUDE_SPU_PREFIXES = (process.env.EXCLUDE_SPU_PREFIXES ?? 'MB,KV')
  .split(',')
  .map((prefix) => prefix.trim())
  .filter(Boolean);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_FILE = process.env.EXPORT_FILE ?? `products-full-${timestamp}.csv`;
const REPORT_FILE = process.env.EXPORT_REPORT_FILE ?? `products-full-report-${timestamp}.json`;
const OUT_PATH = path.join('/srv/nordexo-hub/exports', OUT_FILE);
const REPORT_PATH = path.join('/srv/nordexo-hub/exports', REPORT_FILE);

const PAGE_SIZE = Number(process.env.EXPORT_PAGE_SIZE ?? 1000);

const productFields = [
  'id',
  'spu',
  'title',
  'subtitle',
  'description_html',
  'tags',
  'product_type',
  'shopify_category_name',
  'shopify_category_path',
  'google_taxonomy_l1',
  'google_taxonomy_l2',
  'google_taxonomy_l3',
  'product_categorizer_keywords',
  'legacy_title_sv',
  'legacy_description_sv',
  'legacy_bullets_sv',
  'brand',
  'vendor',
  'option1_name',
  'option2_name',
  'option3_name',
  'option4_name',
  'created_at',
  'updated_at',
  'visible_updated_at',
  'nordic_partner_enabled',
  'is_blocked',
];

const variantFields = [
  'product_id',
  'sku',
  'sku_norm',
  'barcode',
  'option1',
  'option2',
  'option3',
  'option4',
  'option1_zh',
  'option2_zh',
  'option3_zh',
  'option4_zh',
  'option_combined_zh',
  'variation_color_se',
  'variation_size_se',
  'variation_other_se',
  'variation_amount_se',
  'shipping_name_en',
  'shipping_name_zh',
  'short_title_zh',
  'supplier_name',
  'shipping_class',
  'weight',
  'purchase_price_cny',
  'updated_at',
];

const headers = [
  'product_id',
  'spu',
  'title',
  'subtitle',
  'description_html',
  'tags',
  'product_type',
  'shopify_category_name',
  'shopify_category_path',
  'google_taxonomy_l1',
  'google_taxonomy_l2',
  'google_taxonomy_l3',
  'product_categorizer_keywords',
  'legacy_title_sv',
  'legacy_description_sv',
  'legacy_bullets_sv',
  'brand',
  'vendor',
  'option1_name',
  'option2_name',
  'option3_name',
  'option4_name',
  'product_created_at',
  'product_updated_at',
  'product_visible_updated_at',
  'nordic_partner_enabled',
  'is_blocked',
  'sku',
  'sku_norm',
  'barcode',
  'option1',
  'option2',
  'option3',
  'option4',
  'option1_zh',
  'option2_zh',
  'option3_zh',
  'option4_zh',
  'option_combined_zh',
  'variation_color_se',
  'variation_size_se',
  'variation_other_se',
  'variation_amount_se',
  'shipping_name_en',
  'shipping_name_zh',
  'short_title_zh',
  'supplier_name',
  'shipping_class',
  'variant_weight',
  'purchase_price_cny',
  'variant_updated_at',
];

const sanitizeValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
};

const csvEscape = (value) => {
  const text = sanitizeValue(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const selectFields = [
  ...variantFields,
  `catalog_products!inner(${productFields.join(',')})`,
].join(',');

const applySpuExclusions = (query) => {
  if (!EXCLUDE_SPU_PREFIXES.length) return query;
  let next = query;
  for (const prefix of EXCLUDE_SPU_PREFIXES) {
    next = next.not('catalog_products.spu', 'ilike', `${prefix}%`);
  }
  return next;
};

const startTime = Date.now();
await fsPromises.mkdir(path.dirname(OUT_PATH), { recursive: true });

const writer = fs.createWriteStream(OUT_PATH, { encoding: 'utf8' });
writer.write(headers.map(csvEscape).join(',') + '\n');

const spuCounts = new Map();
let rowCount = 0;
let offset = 0;

while (true) {
  const from = offset;
  const to = offset + PAGE_SIZE - 1;

  let query = supabase
    .from('catalog_variants')
    .select(selectFields)
    .order('id', { ascending: true })
    .range(from, to);

  query = applySpuExclusions(query);

  const { data: variants, error } = await query;

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  if (!variants?.length) break;

  for (const variant of variants) {
    const product = variant.catalog_products || {};
    const spu = product.spu ?? '';
    if (spu) {
      spuCounts.set(spu, (spuCounts.get(spu) ?? 0) + 1);
    }

    const values = [
      variant.product_id ?? '',
      spu,
      product.title ?? '',
      product.subtitle ?? '',
      product.description_html ?? '',
      product.tags ?? '',
      product.product_type ?? '',
      product.shopify_category_name ?? '',
      product.shopify_category_path ?? '',
      product.google_taxonomy_l1 ?? '',
      product.google_taxonomy_l2 ?? '',
      product.google_taxonomy_l3 ?? '',
      product.product_categorizer_keywords ?? '',
      product.legacy_title_sv ?? '',
      product.legacy_description_sv ?? '',
      product.legacy_bullets_sv ?? '',
      product.brand ?? '',
      product.vendor ?? '',
      product.option1_name ?? '',
      product.option2_name ?? '',
      product.option3_name ?? '',
      product.option4_name ?? '',
      product.created_at ?? '',
      product.updated_at ?? '',
      product.visible_updated_at ?? '',
      product.nordic_partner_enabled ?? '',
      product.is_blocked ?? '',
      variant.sku ?? '',
      variant.sku_norm ?? '',
      variant.barcode ?? '',
      variant.option1 ?? '',
      variant.option2 ?? '',
      variant.option3 ?? '',
      variant.option4 ?? '',
      variant.option1_zh ?? '',
      variant.option2_zh ?? '',
      variant.option3_zh ?? '',
      variant.option4_zh ?? '',
      variant.option_combined_zh ?? '',
      variant.variation_color_se ?? '',
      variant.variation_size_se ?? '',
      variant.variation_other_se ?? '',
      variant.variation_amount_se ?? '',
      variant.shipping_name_en ?? '',
      variant.shipping_name_zh ?? '',
      variant.short_title_zh ?? '',
      variant.supplier_name ?? '',
      variant.shipping_class ?? '',
      variant.weight ?? '',
      variant.purchase_price_cny ?? '',
      variant.updated_at ?? '',
    ];

    if (!writer.write(values.map(csvEscape).join(',') + '\n')) {
      await once(writer, 'drain');
    }

    rowCount += 1;
  }

  if (variants.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

writer.end();
await once(writer, 'finish');

let excludedCount = 0;
if (EXCLUDE_SPU_PREFIXES.length) {
  const orFilters = EXCLUDE_SPU_PREFIXES
    .map((prefix) => `spu.ilike.${prefix}%`)
    .join(',');

  const { count, error } = await supabase
    .from('catalog_variants')
    .select('id, catalog_products!inner(spu)', { count: 'exact', head: true })
    .or(orFilters, { foreignTable: 'catalog_products' });

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  excludedCount = count ?? 0;
}

const topSpus = Array.from(spuCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([spu, count]) => ({ spu, count }));

const report = {
  total_rows_exported: rowCount,
  count_excluded_by_prefix: excludedCount,
  unique_spu_count: spuCounts.size,
  top_20_spus_by_row_count: topSpus,
};

await fsPromises.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

const runtimeMs = Date.now() - startTime;
console.log(`Output: ${OUT_PATH}`);
console.log(`Rows: ${rowCount}`);
console.log(`Runtime: ${runtimeMs}ms`);
