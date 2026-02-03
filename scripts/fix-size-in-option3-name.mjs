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

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isAllowed(name) {
  if (!name) return true;
  return ALLOWED.has(name);
}

function extractSizeTokens(text) {
  if (!text) return [];
  const tokens = new Set();
  const normalized = text.replace(/\s+/g, ' ');

  const unitMatches = normalized.match(/\d+(?:[.,]\d+)?\s?(?:cm|mm|m)\b/gi) || [];
  for (const raw of unitMatches) {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const unitMatch = cleaned.match(/(cm|mm|m)$/i);
    const unit = unitMatch ? unitMatch[1].toLowerCase() : '';
    const num = cleaned.replace(/(cm|mm|m)$/i, '').trim().replace(',', '.');
    const value = unit ? `${num} ${unit}` : cleaned;
    tokens.add(value);
  }

  const dimMatches = normalized.match(/\d+(?:[.,]\d+)?\s?(?:x|×)\s?\d+(?:[.,]\d+)?(?:\s?(?:cm|mm|m))?/gi) || [];
  for (const raw of dimMatches) {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (cleaned) tokens.add(cleaned);
  }

  return Array.from(tokens).filter(Boolean);
}

function valueMissing(value) {
  return normalizeText(value) === '';
}

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
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
      .select('id,product_id,sku,option1,option2,option3,option4')
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

async function applyUpdates(table, updates) {
  let updated = 0;
  for (const update of updates) {
    const id = update?.id;
    if (!id) continue;
    const payload = { ...update };
    delete payload.id;
    if (!Object.keys(payload).length) continue;
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    if (error) {
      console.error(`[fix] ${table} update failed`, id, error.message || error);
      continue;
    }
    updated += 1;
    if (updated % 1000 === 0) {
      console.log(`[fix] ${table} updated ${updated} rows...`);
    }
  }
  return updated;
}

async function main() {
  console.log('[fix] loading catalog_products...');
  const products = await fetchAllProducts();
  console.log(`[fix] catalog_products loaded: ${products.length}`);

  const candidates = [];
  for (const product of products) {
    const option3Name = normalizeText(product.option3_name);
    if (!option3Name) continue;
    if (isAllowed(option3Name)) continue;
    const tokens = extractSizeTokens(option3Name);
    if (!tokens.length) continue;
    candidates.push({
      product,
      option3Name,
      tokens,
    });
  }

  console.log(`[fix] size-in-option3 candidates: ${candidates.length}`);

  const productIds = candidates.map((entry) => entry.product.id).filter(Boolean);
  const variantsByProduct = productIds.length
    ? await fetchVariantsByProductIds(productIds)
    : new Map();

  const productUpdates = [];
  const variantUpdates = [];
  const reportRows = [];

  for (const entry of candidates) {
    const { product, option3Name, tokens } = entry;
    const variants = variantsByProduct.get(product.id) ?? [];

    if (tokens.length !== 1) {
      reportRows.push({
        product_id: product.id,
        spu: product.spu ?? '',
        option3_name: option3Name,
        size_token: tokens.join(' | '),
        status: 'skipped_multiple_tokens',
        variant_count: variants.length,
        variant_updates: 0,
      });
      continue;
    }

    const sizeValue = tokens[0];

    if (option3Name !== 'Storlek') {
      productUpdates.push({
        id: product.id,
        option3_name: 'Storlek',
      });
    }

    let updatedVariants = 0;
    for (const variant of variants) {
      if (!valueMissing(variant.option3)) continue;
      variantUpdates.push({
        id: variant.id,
        option3: sizeValue,
      });
      updatedVariants += 1;
    }

    reportRows.push({
      product_id: product.id,
      spu: product.spu ?? '',
      option3_name: option3Name,
      size_token: sizeValue,
      status: updatedVariants ? 'queued' : 'name_only',
      variant_count: variants.length,
      variant_updates: updatedVariants,
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join('/srv/nordexo-hub/exports', `option3-size-fix-${timestamp}.tsv`);
  const headers = [
    'product_id',
    'spu',
    'option3_name',
    'size_token',
    'status',
    'variant_count',
    'variant_updates',
  ];
  const lines = [headers.join('\t')];
  for (const row of reportRows) {
    const values = headers.map((key) => {
      const value = row[key];
      if (value == null) return '';
      return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    });
    lines.push(values.join('\t'));
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join('\n'), 'utf8');

  console.log(`[fix] report written: ${outPath}`);
  console.log(`[fix] product updates queued: ${productUpdates.length}`);
  console.log(`[fix] variant updates queued: ${variantUpdates.length}`);

  if (!APPLY) {
    console.log('[fix] dry-run complete (use --apply to write updates)');
    return;
  }

  const updatedProducts = await applyUpdates('catalog_products', productUpdates);
  const updatedVariants = await applyUpdates('catalog_variants', variantUpdates);

  console.log(`[fix] catalog_products updated: ${updatedProducts}`);
  console.log(`[fix] catalog_variants updated: ${updatedVariants}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
