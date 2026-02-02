import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(filePath) {
  const out = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function normalizeShiptype(value) {
  const text = String(value || '').trim().toUpperCase();
  return text || null;
}

function parseNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function normalizePrice(value) {
  const num = parseNumber(value);
  return num == null ? null : num;
}

const envPath = '/srv/nordexo-hub/.env.local';
if (!fs.existsSync(envPath)) {
  console.error(`Missing env file at ${envPath}`);
  process.exit(1);
}
const env = loadEnv(envPath);
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function fetchDraftVariants() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('draft_variants')
      .select('id,draft_spu,draft_sku,draft_price,draft_raw_row,draft_purchase_price_cny,draft_shipping_class')
      .or('draft_shipping_class.is.null,draft_purchase_price_cny.is.null')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchDraftProducts(spus) {
  const map = new Map();
  const list = Array.from(spus);
  const chunkSize = 500;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('draft_products')
      .select('draft_spu,draft_raw_row')
      .in('draft_spu', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.draft_spu, row.draft_raw_row || {});
    }
  }
  return map;
}

async function fetchCatalogVariants(skus) {
  const map = new Map();
  const list = Array.from(skus);
  const chunkSize = 500;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('catalog_variants')
      .select('sku,shipping_class,purchase_price_cny')
      .in('sku', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.sku, row);
    }
  }
  return map;
}

async function main() {
  console.log('[backfill] loading draft_variants...');
  const draftVariants = await fetchDraftVariants();
  console.log(`[backfill] draft_variants needing update: ${draftVariants.length}`);
  if (!draftVariants.length) return;

  const spus = new Set(draftVariants.map((row) => row.draft_spu).filter(Boolean));
  const skus = new Set(draftVariants.map((row) => row.draft_sku).filter(Boolean));

  console.log(`[backfill] loading draft_products for ${spus.size} SPU(s)...`);
  const draftProductsBySpu = await fetchDraftProducts(spus);

  console.log(`[backfill] loading catalog_variants for ${skus.size} SKU(s)...`);
  const catalogBySku = await fetchCatalogVariants(skus);

  let updatedDraftVariants = 0;
  let updatedCatalogShipping = 0;
  let updatedCatalogPrice = 0;

  for (const row of draftVariants) {
    const spu = row.draft_spu;
    const sku = row.draft_sku;
    const parentRaw = draftProductsBySpu.get(spu) || {};

    const shiptype = normalizeShiptype(
      row.draft_shipping_class || parentRaw.product_shiptype || parentRaw.product_shipType || ''
    );
    const rawRow = row.draft_raw_row || {};
    const purchasePrice = normalizePrice(
      row.draft_purchase_price_cny || rawRow.purchase_price_cny || rawRow.purchase_price || rawRow['purchase price'] || rawRow.price || row.draft_price
    );

    const update = {};
    if (!row.draft_shipping_class && shiptype) update.draft_shipping_class = shiptype;
    if (row.draft_purchase_price_cny == null && purchasePrice != null) update.draft_purchase_price_cny = purchasePrice;

    if (Object.keys(update).length) {
      const { error } = await supabase.from('draft_variants').update(update).eq('id', row.id);
      if (error) {
        console.error('[backfill] draft_variants update failed', row.id, error.message);
      } else {
        updatedDraftVariants += 1;
      }
    }

    const catalogRow = catalogBySku.get(sku);
    if (!catalogRow) continue;

    if (shiptype && !catalogRow.shipping_class) {
      const { error } = await supabase
        .from('catalog_variants')
        .update({ shipping_class: shiptype })
        .eq('sku', sku)
        .is('shipping_class', null);
      if (error) {
        console.error('[backfill] catalog_variants shipping_class update failed', sku, error.message);
      } else {
        updatedCatalogShipping += 1;
      }
    }
    if (purchasePrice != null && (catalogRow.purchase_price_cny == null)) {
      const { error } = await supabase
        .from('catalog_variants')
        .update({ purchase_price_cny: purchasePrice })
        .eq('sku', sku)
        .is('purchase_price_cny', null);
      if (error) {
        console.error('[backfill] catalog_variants purchase_price_cny update failed', sku, error.message);
      } else {
        updatedCatalogPrice += 1;
      }
    }
  }

  console.log(`[backfill] updated draft_variants: ${updatedDraftVariants}`);
  console.log(`[backfill] updated catalog_variants shipping_class: ${updatedCatalogShipping}`);
  console.log(`[backfill] updated catalog_variants purchase_price_cny: ${updatedCatalogPrice}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
