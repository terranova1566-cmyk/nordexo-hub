import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.EXPORT_SKU_LIMIT ?? 2000);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_FILE = process.env.EXPORT_FILE ?? `latest-${LIMIT}-skus-full-${timestamp}.tsv`;
const OUT_PATH = path.join('/srv/nordexo-hub/exports', OUT_FILE);

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

const sanitize = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
};

const selectFields = [
  ...variantFields,
  `catalog_products (${productFields.join(',')})`,
].join(',');

const lines = [headers.join('\t')];
let rowCount = 0;
let offset = 0;
const PAGE_SIZE = Math.min(1000, LIMIT);

while (rowCount < LIMIT) {
  const from = offset;
  const to = Math.min(offset + PAGE_SIZE - 1, LIMIT - 1);
  const { data: variants, error } = await supabase
    .from('catalog_variants')
    .select(selectFields)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  if (!variants?.length) break;

  for (const variant of variants) {
    if (rowCount >= LIMIT) break;
    const product = variant.catalog_products || {};
    const values = [
      variant.product_id ?? '',
      product.spu ?? '',
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

    lines.push(values.map(sanitize).join('\t'));
    rowCount += 1;
  }

  if (variants.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
await fs.writeFile(OUT_PATH, lines.join('\n'), 'utf8');
console.log(`Wrote ${rowCount} rows to ${OUT_PATH}`);
