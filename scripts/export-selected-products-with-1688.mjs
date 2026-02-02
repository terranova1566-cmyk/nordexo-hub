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

const spus = [
  'ND-22526',
  'ND-22520',
  'ND-22529',
  'ND-22528',
  'ND-22525',
  'ND-22527',
  'ND-22524',
  'ND-22523',
  'ND-22521',
];

const { data: products, error: productsError } = await supabase
  .from('catalog_products')
  .select('id,spu,title,subtitle,brand,vendor,product_type,option1_name,option2_name,option3_name,option4_name,created_at,updated_at,visible_updated_at,supplier_1688_url')
  .in('spu', spus);

if (productsError) {
  console.error('catalog_products error', productsError);
  process.exit(1);
}

const productById = new Map();
for (const p of products || []) {
  productById.set(p.id, p);
}

const productIds = (products || []).map((p) => p.id);

const { data: variants, error: variantsError } = await supabase
  .from('catalog_variants')
  .select('product_id,sku,option1,option2,option3,option4,option_combined_zh,variation_color_se,variation_size_se,variation_other_se,variation_amount_se,shipping_class,weight,purchase_price_cny')
  .in('product_id', productIds)
  .order('sku', { ascending: true });

if (variantsError) {
  console.error('catalog_variants error', variantsError);
  process.exit(1);
}

const headers = [
  'spu',
  'sku',
  'title',
  'subtitle',
  'brand',
  'vendor',
  'product_type',
  'option1_name',
  'option2_name',
  'option3_name',
  'option4_name',
  'shipping_class',
  'weight_kg',
  'purchase_price_cny',
  'option1',
  'option2',
  'option3',
  'option4',
  '1688_combined',
  'supplier_1688_url',
  'variation_color_se',
  'variation_size_se',
  'variation_other_se',
  'variation_amount_se',
  'created_at',
  'updated_at',
  'visible_updated_at',
];

const lines = [headers.join('\t')];
for (const row of variants || []) {
  const product = productById.get(row.product_id) || {};
  const values = [
    product.spu ?? '',
    row.sku ?? '',
    product.title ?? '',
    product.subtitle ?? '',
    product.brand ?? '',
    product.vendor ?? '',
    product.product_type ?? '',
    product.option1_name ?? '',
    product.option2_name ?? '',
    product.option3_name ?? '',
    product.option4_name ?? '',
    row.shipping_class ?? '',
    row.weight ?? '',
    row.purchase_price_cny ?? '',
    row.option1 ?? '',
    row.option2 ?? '',
    row.option3 ?? '',
    row.option4 ?? '',
    row.option_combined_zh ?? '',
    product.supplier_1688_url ?? '',
    row.variation_color_se ?? '',
    row.variation_size_se ?? '',
    row.variation_other_se ?? '',
    row.variation_amount_se ?? '',
    product.created_at ?? '',
    product.updated_at ?? '',
    product.visible_updated_at ?? '',
  ];
  const sanitized = values.map((v) => {
    if (v == null) return '';
    const s = String(v);
    return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  });
  lines.push(sanitized.join('\t'));
}

const outPath = path.join('/srv/nordexo-hub/exports', 'selected-products-with-1688.tsv');
await fs.writeFile(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${lines.length - 1} rows to ${outPath}`);
