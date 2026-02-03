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

const headers = [
  'spu',
  'sku',
  'sku_norm',
  'barcode',
  'title',
  'subtitle',
  'option1_name',
  'option2_name',
  'option3_name',
  'option4_name',
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
  'created_at',
  'updated_at',
  'visible_updated_at',
];

const lines = [headers.join('\t')];
const pageSize = 1000;
let offset = 0;

while (true) {
  const { data, error } = await supabase
    .from('catalog_variants')
    .select(
      [
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
        'catalog_products (spu, title, subtitle, option1_name, option2_name, option3_name, option4_name, created_at, updated_at, visible_updated_at)'
      ].join(',')
    )
    .ilike('catalog_products.spu', 'ND-%')
    .order('updated_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) break;

  for (const row of data) {
    const product = row.catalog_products || {};
    const values = [
      product.spu ?? '',
      row.sku ?? '',
      row.sku_norm ?? '',
      row.barcode ?? '',
      product.title ?? '',
      product.subtitle ?? '',
      product.option1_name ?? '',
      product.option2_name ?? '',
      product.option3_name ?? '',
      product.option4_name ?? '',
      row.option1 ?? '',
      row.option2 ?? '',
      row.option3 ?? '',
      row.option4 ?? '',
      row.option1_zh ?? '',
      row.option2_zh ?? '',
      row.option3_zh ?? '',
      row.option4_zh ?? '',
      row.option_combined_zh ?? '',
      row.variation_color_se ?? '',
      row.variation_size_se ?? '',
      row.variation_other_se ?? '',
      row.variation_amount_se ?? '',
      row.shipping_name_en ?? '',
      row.shipping_name_zh ?? '',
      row.short_title_zh ?? '',
      row.supplier_name ?? '',
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

  if (data.length < pageSize) break;
  offset += pageSize;
}

const outPath = path.join('/srv/nordexo-hub/exports', 'nd-options-variations.tsv');
await fs.writeFile(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${lines.length - 1} rows to ${outPath}`);
