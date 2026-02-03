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

const PRODUCT_LIMIT = Number(process.env.EXPORT_PRODUCT_LIMIT ?? 350);
const OUT_FILE = process.env.EXPORT_FILE ?? `latest-${PRODUCT_LIMIT}-products-full.tsv`;
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
];

const sanitize = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const { data: products, error: productsError } = await supabase
  .from('catalog_products')
  .select(productFields.join(','))
  .order('updated_at', { ascending: false })
  .limit(PRODUCT_LIMIT);

if (productsError) {
  console.error('Supabase error:', productsError);
  process.exit(1);
}

const productList = products ?? [];
const productIds = productList.map((product) => product.id).filter(Boolean);
const productById = new Map(productList.map((product) => [product.id, product]));

const variants = [];
const PRODUCT_CHUNK_SIZE = 200;

for (const batch of chunk(productIds, PRODUCT_CHUNK_SIZE)) {
  const { data: batchVariants, error: variantsError } = await supabase
    .from('catalog_variants')
    .select(variantFields.join(','))
    .in('product_id', batch);

  if (variantsError) {
    console.error('Supabase error:', variantsError);
    process.exit(1);
  }

  if (batchVariants?.length) {
    variants.push(...batchVariants);
  }
}

const variantsByProduct = new Map();
for (const variant of variants) {
  const entries = variantsByProduct.get(variant.product_id) ?? [];
  entries.push(variant);
  variantsByProduct.set(variant.product_id, entries);
}

const lines = [headers.join('\t')];
let rowCount = 0;

for (const product of productList) {
  const productVariants = variantsByProduct.get(product.id) ?? [];
  const rows = productVariants.length > 0 ? productVariants : [null];

  for (const variant of rows) {
    const values = [
      product.id ?? '',
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
      variant?.sku ?? '',
      variant?.sku_norm ?? '',
      variant?.barcode ?? '',
      variant?.option1 ?? '',
      variant?.option2 ?? '',
      variant?.option3 ?? '',
      variant?.option4 ?? '',
      variant?.option1_zh ?? '',
      variant?.option2_zh ?? '',
      variant?.option3_zh ?? '',
      variant?.option4_zh ?? '',
      variant?.option_combined_zh ?? '',
      variant?.variation_color_se ?? '',
      variant?.variation_size_se ?? '',
      variant?.variation_other_se ?? '',
      variant?.variation_amount_se ?? '',
      variant?.shipping_name_en ?? '',
      variant?.shipping_name_zh ?? '',
      variant?.short_title_zh ?? '',
      variant?.supplier_name ?? '',
      variant?.shipping_class ?? '',
      variant?.weight ?? '',
      variant?.purchase_price_cny ?? '',
    ];

    lines.push(values.map(sanitize).join('\t'));
    rowCount += 1;
  }
}

await fs.writeFile(OUT_PATH, lines.join('\n'), 'utf8');
console.log(`Wrote ${rowCount} rows (${productList.length} products, ${variants.length} variants) to ${OUT_PATH}`);
