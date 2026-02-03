import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const ALLOWED = new Set(['Antal', 'Färg', 'Storlek', 'Alternativ']);
const PAGE_SIZE = 1000;

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isAllowed(name) {
  if (!name) return true;
  return ALLOWED.has(name);
}

function valuePresent(value) {
  const text = normalizeText(value);
  return text !== '';
}

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

function detectSizeText(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return /\d+\s?(cm|mm|m)\b/.test(lower) || /\d+\s?(x|×)\s?\d+/.test(lower);
}

async function fetchAllProducts() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id,spu,option1_name,option2_name,option3_name,option4_name')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchVariantsByProductIds(productIds) {
  const map = new Map();
  const chunks = chunkArray(productIds, 200);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_variants')
      .select('product_id,sku,option1,option2,option3,option4')
      .in('product_id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }
  }
  return map;
}

function summarizeVariants(variants, optionIndex) {
  const key = `option${optionIndex}`;
  const values = new Set();
  let missing = 0;
  for (const row of variants) {
    const value = normalizeText(row[key]);
    if (value) {
      if (values.size < 5) values.add(value);
    } else {
      missing += 1;
    }
  }
  return {
    variant_count: variants.length,
    missing_count: missing,
    sample_values: Array.from(values).join(' | '),
  };
}

async function main() {
  console.log('[audit] loading catalog_products...');
  const products = await fetchAllProducts();
  console.log(`[audit] catalog_products loaded: ${products.length}`);

  const flagged = [];
  const productIds = new Set();

  for (const product of products) {
    const fields = [
      ['option1_name', 1],
      ['option2_name', 2],
      ['option3_name', 3],
      ['option4_name', 4],
    ];
    for (const [field, index] of fields) {
      const raw = normalizeText(product[field]);
      if (!raw) continue;
      if (isAllowed(raw)) continue;
      flagged.push({
        product_id: product.id,
        spu: product.spu ?? '',
        field,
        option_index: index,
        option_name: raw,
        has_size_hint: detectSizeText(raw) ? 'true' : 'false',
      });
      if (product.id) productIds.add(product.id);
    }
  }

  console.log(`[audit] flagged option names: ${flagged.length}`);
  const productIdList = Array.from(productIds);
  const variantsByProduct = productIdList.length
    ? await fetchVariantsByProductIds(productIdList)
    : new Map();

  const rows = [];
  for (const entry of flagged) {
    const variants = variantsByProduct.get(entry.product_id) ?? [];
    const summary = summarizeVariants(variants, entry.option_index);
    rows.push({
      ...entry,
      variant_count: summary.variant_count,
      missing_option_values: summary.missing_count,
      sample_option_values: summary.sample_values,
    });
  }

  const headers = [
    'product_id',
    'spu',
    'field',
    'option_index',
    'option_name',
    'has_size_hint',
    'variant_count',
    'missing_option_values',
    'sample_option_values',
  ];

  const lines = [headers.join('\t')];
  for (const row of rows) {
    const values = headers.map((key) => {
      const value = row[key];
      if (value == null) return '';
      return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    });
    lines.push(values.join('\t'));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join('/srv/nordexo-hub/exports', `option-name-audit-${timestamp}.tsv`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join('\n'), 'utf8');

  console.log(`[audit] wrote ${rows.length} row(s) to ${outPath}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
