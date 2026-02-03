import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_LEGACY_PATH = '/srv/incoming-scripts/legacy-product-data-batch1.xlsx';
const DEFAULT_EXPORT_DIR = '/srv/nordexo-hub/exports';
const PAGE_SIZE = 1000;
const DEFAULT_OPTION_LABELS = {
  1: 'Antal',
  2: 'Färg',
  3: 'Storlek',
  4: 'Alternativ',
};
const ALLOWED_OPTION_LABELS = new Set(Object.values(DEFAULT_OPTION_LABELS));

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const trimmed = arg.slice(2);
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      flags.add(trimmed);
      continue;
    }
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    values.set(key, value);
  }

  const optionsRaw = values.get('options') || '1,2,3,4';
  const optionSet = new Set();
  for (const token of optionsRaw.split(',')) {
    const num = Number(token.trim());
    if ([1, 2, 3, 4].includes(num)) optionSet.add(num);
  }

  const onlySpuRaw = values.get('only-spu') || '';
  const onlySpus = onlySpuRaw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return {
    apply: flags.has('apply'),
    noDraft: flags.has('no-draft'),
    includeDraftOnly: flags.has('include-draft-only'),
    legacyPath: values.get('legacy') || DEFAULT_LEGACY_PATH,
    exportDir: values.get('export-dir') || DEFAULT_EXPORT_DIR,
    options: optionSet,
    onlySpus,
  };
}

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function normalizeCellValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    if (value.formula != null && value.result != null) return value.result;
  }
  return value;
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeOptionValue(value) {
  const text = normalizeString(value);
  return text ? text : null;
}

function normalizeOptionLabel(value) {
  const text = normalizeOptionValue(value);
  if (!text) return null;
  return ALLOWED_OPTION_LABELS.has(text) ? text : null;
}

function parseNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function formatKg(value) {
  const rounded = Math.round(value * 1000) / 1000;
  const fixed = rounded.toFixed(3);
  return fixed.replace(/\.?0+$/, '');
}

function toKgFromGrams(value) {
  const num = parseNumber(value);
  if (num == null) return null;
  return parseNumber(formatKg(num / 1000));
}

function normalizeDraftWeight(value, unit) {
  const num = parseNumber(value);
  if (num == null) return null;
  const unitText = normalizeString(unit).toLowerCase();
  if (unitText.includes('kg')) return num;
  if (unitText.includes('g') && !unitText.includes('kg')) return num / 1000;
  return num >= 10 ? num / 1000 : num;
}

function normalizeShippingClass(value) {
  const text = normalizeString(value).toUpperCase();
  return text || null;
}

function isMissing(value) {
  if (value == null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return normalizeString(value) === '';
}

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

async function loadLegacyWorkbook(legacyPath) {
  if (!fs.existsSync(legacyPath)) {
    throw new Error(`Legacy workbook not found: ${legacyPath}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(legacyPath);
  const spuSheet = workbook.getWorksheet('SPU data');
  const skuSheet = workbook.getWorksheet('SKU data');
  if (!spuSheet || !skuSheet) {
    throw new Error('Missing required sheets: "SPU data" and/or "SKU data"');
  }

  function sheetToRows(sheet) {
    const rows = [];
    const headerRow = sheet.getRow(1);
    const headers = headerRow.values
      .slice(1)
      .map((cell) => normalizeString(normalizeCellValue(cell)));
    const headerCount = headers.length;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record = {};
      for (let col = 1; col <= headerCount; col += 1) {
        const key = headers[col - 1];
        if (!key) continue;
        const cell = row.getCell(col);
        record[key] = normalizeCellValue(cell.value);
      }
      rows.push(record);
    });

    return rows;
  }

  const spuRows = sheetToRows(spuSheet);
  const skuRows = sheetToRows(skuSheet);
  return { spuRows, skuRows };
}

function buildLegacyMaps(spuRows, skuRows, options) {
  const productsBySpu = new Map();
  for (const row of spuRows) {
    const spu = normalizeString(row.spu);
    if (!spu) continue;
    productsBySpu.set(spu, {
      spu,
      option1_name: row.option1_name,
      option2_name: row.option2_name,
      option3_name: row.option3_name,
      option4_name: row.option4_name,
    });
  }

  const skusBySpu = new Map();
  const skuBySku = new Map();
  const optionPresence = new Map();

  function markPresence(spu, optionIndex) {
    if (!optionPresence.has(spu)) {
      optionPresence.set(spu, { 1: false, 2: false, 3: false, 4: false });
    }
    optionPresence.get(spu)[optionIndex] = true;
  }

  for (const row of skuRows) {
    const spu = normalizeString(row.spu);
    const sku = normalizeString(row.sku);
    if (!spu || !sku) continue;

    const record = {
      spu,
      sku,
      option1: row.option1_name,
      option2: row.option2_name,
      option3: row.option3_name,
      option4: row.option4_name,
      option_combined_zh: row.option_combined_cn,
      option1_zh: row.option1_cn,
      option2_zh: row.option2_cn,
      option3_zh: row.option3_cn,
      option4_zh: row.option4_cn,
      shipping_name_en: row.shipping_name_en,
      shipping_name_zh: row.shipping_name_cn,
      short_title_zh: row.short_title_cn,
      shipping_class: row.shipping_class,
      purchase_price_cny: row.purchase_price_cny,
      product_weight_gram: row.product_weight_gram,
    };

    skuBySku.set(sku, record);
    if (!skusBySpu.has(spu)) skusBySpu.set(spu, []);
    skusBySpu.get(spu).push(record);

    for (const opt of [1, 2, 3, 4]) {
      if (!options.has(opt)) continue;
      const value = normalizeOptionValue(record[`option${opt}`]);
      if (value != null) markPresence(spu, opt);
    }
  }

  return { productsBySpu, skuBySku, skusBySpu, optionPresence };
}

async function fetchCatalogProductsBySpu(supabase, spus) {
  const map = new Map();
  const chunks = chunkArray(spus, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id,spu,option1_name,option2_name,option3_name,option4_name')
      .in('spu', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.spu, row);
    }
  }
  return map;
}

async function fetchCatalogProductsById(supabase, ids) {
  const map = new Map();
  const chunks = chunkArray(ids, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id,spu,option1_name,option2_name,option3_name,option4_name')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.id, row);
    }
  }
  return map;
}

async function fetchCatalogVariantsByProductIds(supabase, productIds) {
  const map = new Map();
  const chunks = chunkArray(productIds, 200);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_variants')
      .select(
        [
          'id',
          'product_id',
          'sku',
          'option1',
          'option2',
          'option3',
          'option4',
          'option1_zh',
          'option2_zh',
          'option3_zh',
          'option4_zh',
          'option_combined_zh',
          'shipping_name_en',
          'shipping_name_zh',
          'short_title_zh',
          'shipping_class',
          'purchase_price_cny',
          'weight',
        ].join(',')
      )
      .in('product_id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.sku, row);
    }
  }
  return map;
}

async function fetchCatalogVariantsBySkus(supabase, skus) {
  const map = new Map();
  const chunks = chunkArray(skus, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_variants')
      .select(
        [
          'id',
          'product_id',
          'sku',
          'option1',
          'option2',
          'option3',
          'option4',
          'option1_zh',
          'option2_zh',
          'option3_zh',
          'option4_zh',
          'option_combined_zh',
          'shipping_name_en',
          'shipping_name_zh',
          'short_title_zh',
          'shipping_class',
          'purchase_price_cny',
          'weight',
        ].join(',')
      )
      .in('sku', chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.sku, row);
    }
  }
  return map;
}

async function fetchDraftVariantsBySkus(supabase, skus) {
  const map = new Map();
  const chunks = chunkArray(skus, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('draft_variants')
      .select(
        [
          'draft_spu',
          'draft_sku',
          'draft_option1',
          'draft_option2',
          'draft_option3',
          'draft_option4',
          'draft_option1_zh',
          'draft_option2_zh',
          'draft_option3_zh',
          'draft_option4_zh',
          'draft_option_combined_zh',
          'draft_shipping_name_en',
          'draft_shipping_name_zh',
          'draft_short_title_zh',
          'draft_shipping_class',
          'draft_purchase_price_cny',
          'draft_weight',
          'draft_weight_unit',
        ].join(',')
      )
      .in('draft_sku', chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row.draft_sku) map.set(row.draft_sku, row);
    }
  }
  return map;
}

async function fetchDraftProductsBySpus(supabase, spus) {
  const map = new Map();
  const chunks = chunkArray(spus, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('draft_products')
      .select('draft_spu,draft_option1_name,draft_option2_name,draft_option3_name,draft_option4_name')
      .in('draft_spu', chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row.draft_spu) map.set(row.draft_spu, row);
    }
  }
  return map;
}

function buildTsv(rows, headers) {
  const lines = [headers.join('\t')];
  for (const row of rows) {
    const values = headers.map((key) => {
      const value = row[key];
      if (value == null) return '';
      return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    });
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}

async function writeReport(exportDir, baseName, rows, headers) {
  if (!rows.length) return null;
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const filePath = path.join(exportDir, baseName);
  await fs.promises.writeFile(filePath, buildTsv(rows, headers), 'utf8');
  return filePath;
}

async function applyUpdates(supabase, table, updates, key = 'id') {
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;
  const concurrency = 10;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= updates.length) break;
      const update = updates[current];
      const id = update?.[key];
      if (!id) {
        skipped += 1;
        continue;
      }
      const payload = { ...update };
      delete payload[key];
      if (!Object.keys(payload).length) {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from(table).update(payload).eq(key, id);
      if (error) {
        failed += 1;
        console.error(`[backfill] ${table} update failed`, id, error.message || error);
        continue;
      }
      updated += 1;
      if (updated % 1000 === 0) {
        console.log(`[backfill] ${table} updated ${updated} rows...`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (skipped) console.log(`[backfill] ${table} skipped updates: ${skipped}`);
  if (failed) console.log(`[backfill] ${table} failed updates: ${failed}`);
  return { updated, skipped, failed };
}

function diffValue(a, b) {
  if (a == null && b == null) return false;
  return normalizeString(a) !== normalizeString(b);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const envPath = '/srv/nordexo-hub/.env.local';
  const env = loadEnv(envPath);
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRole) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  console.log(`[backfill] legacy workbook: ${opts.legacyPath}`);
  const { spuRows, skuRows } = await loadLegacyWorkbook(opts.legacyPath);
  const { productsBySpu, skuBySku, skusBySpu, optionPresence } = buildLegacyMaps(
    spuRows,
    skuRows,
    opts.options
  );

  let legacySpus = Array.from(productsBySpu.keys());
  let allowedSpuSet = null;
  if (opts.onlySpus.length) {
    allowedSpuSet = new Set(opts.onlySpus);
    legacySpus = legacySpus.filter((spu) => allowedSpuSet.has(spu));
  }

  console.log(`[backfill] legacy SPUs: ${legacySpus.length}`);

  const catalogProducts = await fetchCatalogProductsBySpu(supabase, legacySpus);
  const productIdBySpu = new Map();
  const productById = new Map();
  for (const [spu, row] of catalogProducts.entries()) {
    productIdBySpu.set(spu, row.id);
    productById.set(row.id, row);
  }

  const productIds = Array.from(productIdBySpu.values());
  console.log(`[backfill] catalog_products matched: ${productIds.length}`);

  const catalogVariants = await fetchCatalogVariantsByProductIds(supabase, productIds);
  console.log(`[backfill] catalog_variants matched: ${catalogVariants.size}`);

  const legacySkus = allowedSpuSet
    ? Array.from(skuBySku.values())
        .filter((row) => allowedSpuSet.has(row.spu))
        .map((row) => row.sku)
    : Array.from(skuBySku.keys());
  const draftVariantBySku = opts.noDraft
    ? new Map()
    : await fetchDraftVariantsBySkus(supabase, legacySkus);
  const draftProductBySpu = opts.noDraft
    ? new Map()
    : await fetchDraftProductsBySpus(supabase, legacySpus);

  const variantUpdates = [];
  const productUpdates = [];
  const variantDiffs = [];
  const productDiffs = [];

  let missingVariants = 0;

  for (const [sku, legacyRow] of skuBySku.entries()) {
    if (allowedSpuSet && !allowedSpuSet.has(legacyRow.spu)) continue;
    const variant = catalogVariants.get(sku);
    if (!variant) {
      missingVariants += 1;
      continue;
    }

    const draft = draftVariantBySku.get(sku);
    const update = { id: variant.id };
    let changed = false;

    for (const opt of opts.options) {
      const legacyValue = normalizeOptionValue(legacyRow[`option${opt}`]);
      const nextValue = legacyValue;
      const current = variant[`option${opt}`];
      if (diffValue(current, nextValue)) {
        update[`option${opt}`] = nextValue;
        changed = true;
        variantDiffs.push({
          source: 'legacy',
          spu: legacyRow.spu,
          sku,
          field: `option${opt}`,
          db_value: current ?? '',
          legacy_value: legacyValue ?? '',
          draft_value: draft?.[`draft_option${opt}`] ?? '',
          next_value: nextValue ?? '',
          reason: 'sync_to_legacy',
        });
      }
    }

    const legacyWeightKg = toKgFromGrams(legacyRow.product_weight_gram);
    const draftWeightKg = normalizeDraftWeight(draft?.draft_weight, draft?.draft_weight_unit);
    const logistics = [
      {
        field: 'purchase_price_cny',
        legacy: legacyRow.purchase_price_cny,
        draft: draft?.draft_purchase_price_cny,
        normalize: parseNumber,
      },
      {
        field: 'weight',
        legacy: legacyWeightKg,
        draft: draftWeightKg,
        normalize: (value) => (typeof value === 'number' ? value : parseNumber(value)),
      },
      {
        field: 'shipping_class',
        legacy: legacyRow.shipping_class,
        draft: draft?.draft_shipping_class,
        normalize: normalizeShippingClass,
      },
      {
        field: 'shipping_name_en',
        legacy: legacyRow.shipping_name_en,
        draft: draft?.draft_shipping_name_en,
        normalize: normalizeOptionValue,
      },
      {
        field: 'shipping_name_zh',
        legacy: legacyRow.shipping_name_zh,
        draft: draft?.draft_shipping_name_zh,
        normalize: normalizeOptionValue,
      },
      {
        field: 'short_title_zh',
        legacy: legacyRow.short_title_zh,
        draft: draft?.draft_short_title_zh,
        normalize: normalizeOptionValue,
      },
    ];

    for (const item of logistics) {
      const current = variant[item.field];
      if (!isMissing(current)) continue;
      const legacyValue = item.normalize(item.legacy);
      const draftValue = item.normalize(item.draft);
      const nextValue = legacyValue != null && legacyValue !== '' ? legacyValue : draftValue;
      if (nextValue == null || nextValue === '') continue;
      update[item.field] = nextValue;
      changed = true;
      variantDiffs.push({
        source: legacyValue != null && legacyValue !== '' ? 'legacy' : 'draft',
        spu: legacyRow.spu,
        sku,
        field: item.field,
        db_value: current ?? '',
        legacy_value: legacyValue ?? '',
        draft_value: draftValue ?? '',
        next_value: nextValue ?? '',
        reason: 'fill_missing',
      });
    }

    if (changed) variantUpdates.push(update);
  }

  for (const [spu, legacyProduct] of productsBySpu.entries()) {
    if (opts.onlySpus.length && !opts.onlySpus.includes(spu)) continue;
    const product = catalogProducts.get(spu);
    if (!product) continue;
    const update = { id: product.id };
    let changed = false;
    const presence = optionPresence.get(spu) || { 1: false, 2: false, 3: false, 4: false };

    for (const opt of opts.options) {
      const hasValue = presence[opt];
      const legacyName = normalizeOptionLabel(legacyProduct[`option${opt}_name`]);
      const nextName = hasValue ? legacyName ?? DEFAULT_OPTION_LABELS[opt] : null;
      const currentName = product[`option${opt}_name`];
      if (diffValue(currentName, nextName)) {
        update[`option${opt}_name`] = nextName;
        changed = true;
        productDiffs.push({
          spu,
          field: `option${opt}_name`,
          db_value: currentName ?? '',
          legacy_value: legacyName ?? '',
          has_value: hasValue ? 'true' : 'false',
          next_value: nextName ?? '',
          reason: 'legacy_option_name',
        });
      }
    }

    if (changed) productUpdates.push(update);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const variantReport = await writeReport(
    opts.exportDir,
    `legacy-backfill-variants-${timestamp}.tsv`,
    variantDiffs,
    ['source', 'spu', 'sku', 'field', 'db_value', 'legacy_value', 'draft_value', 'next_value', 'reason']
  );
  const productReport = await writeReport(
    opts.exportDir,
    `legacy-backfill-products-${timestamp}.tsv`,
    productDiffs,
    ['spu', 'field', 'db_value', 'legacy_value', 'has_value', 'next_value', 'reason']
  );

  console.log(`[backfill] legacy variants missing in catalog: ${missingVariants}`);
  console.log(`[backfill] legacy variant updates queued: ${variantUpdates.length}`);
  console.log(`[backfill] legacy product updates queued: ${productUpdates.length}`);

  if (variantReport) console.log(`[backfill] variant diff report: ${variantReport}`);
  if (productReport) console.log(`[backfill] product diff report: ${productReport}`);

  if (!opts.apply) {
    console.log('[backfill] dry-run complete (use --apply to write updates)');
    return;
  }

  const variantResult = await applyUpdates(supabase, 'catalog_variants', variantUpdates, 'id');
  const productResult = await applyUpdates(supabase, 'catalog_products', productUpdates, 'id');

  console.log(`[backfill] catalog_variants updated: ${variantResult.updated}`);
  console.log(`[backfill] catalog_products updated: ${productResult.updated}`);

  if (!opts.includeDraftOnly) return;

  console.log('[backfill] draft-only pass enabled');
  let draftFrom = 0;
  let draftUpdatedVariants = 0;
  let draftUpdatedProducts = 0;
  const draftProductUpdates = new Map();

  while (true) {
    const { data: draftRows, error } = await supabase
      .from('draft_variants')
      .select(
        [
          'draft_spu',
          'draft_sku',
          'draft_option1',
          'draft_option2',
          'draft_option3',
          'draft_option4',
          'draft_option1_zh',
          'draft_option2_zh',
          'draft_option3_zh',
          'draft_option4_zh',
          'draft_option_combined_zh',
          'draft_shipping_name_en',
          'draft_shipping_name_zh',
          'draft_short_title_zh',
          'draft_shipping_class',
          'draft_purchase_price_cny',
          'draft_weight',
          'draft_weight_unit',
        ].join(',')
      )
      .range(draftFrom, draftFrom + PAGE_SIZE - 1);

    if (error) throw error;
    if (!draftRows || draftRows.length === 0) break;

    const draftSkus = draftRows.map((row) => row.draft_sku).filter(Boolean);
    const catalogBySku = await fetchCatalogVariantsBySkus(supabase, draftSkus);
    const productIds = Array.from(new Set(Array.from(catalogBySku.values()).map((row) => row.product_id)));
    const catalogProductsById = await fetchCatalogProductsById(supabase, productIds);
    const draftSpus = Array.from(new Set(draftRows.map((row) => row.draft_spu).filter(Boolean)));
    const draftProducts = await fetchDraftProductsBySpus(supabase, draftSpus);

    const optionPresenceDraft = new Map();
    for (const row of draftRows) {
      const spu = normalizeString(row.draft_spu);
      if (!spu) continue;
      if (!optionPresenceDraft.has(spu)) {
        optionPresenceDraft.set(spu, { 1: false, 2: false, 3: false, 4: false });
      }
      for (const opt of opts.options) {
        const value = normalizeOptionValue(row[`draft_option${opt}`]);
        if (value != null) optionPresenceDraft.get(spu)[opt] = true;
      }
    }

    const updates = [];
    for (const row of draftRows) {
      const sku = normalizeString(row.draft_sku);
      if (!sku) continue;
      const variant = catalogBySku.get(sku);
      if (!variant) continue;
      const update = { id: variant.id };
      let changed = false;

      for (const opt of opts.options) {
        const current = variant[`option${opt}`];
        if (!isMissing(current)) continue;
        const nextValue = normalizeOptionValue(row[`draft_option${opt}`]);
        if (nextValue == null) continue;
        update[`option${opt}`] = nextValue;
        changed = true;
      }

      const logistics = [
        { field: 'purchase_price_cny', value: row.draft_purchase_price_cny, normalize: parseNumber },
        { field: 'shipping_class', value: row.draft_shipping_class, normalize: normalizeShippingClass },
        { field: 'shipping_name_en', value: row.draft_shipping_name_en, normalize: normalizeOptionValue },
        { field: 'shipping_name_zh', value: row.draft_shipping_name_zh, normalize: normalizeOptionValue },
        { field: 'short_title_zh', value: row.draft_short_title_zh, normalize: normalizeOptionValue },
        {
          field: 'weight',
          value: normalizeDraftWeight(row.draft_weight, row.draft_weight_unit),
          normalize: (v) => (typeof v === 'number' ? v : parseNumber(v)),
        },
      ];

      for (const item of logistics) {
        const current = variant[item.field];
        if (!isMissing(current)) continue;
        const nextValue = item.normalize(item.value);
        if (nextValue == null || nextValue === '') continue;
        update[item.field] = nextValue;
        changed = true;
      }

      if (changed) updates.push(update);
    }

    if (updates.length) {
      const updated = await applyUpdates(supabase, 'catalog_variants', updates, 'id');
      draftUpdatedVariants += updated.updated;
    }

    for (const [spu, presence] of optionPresenceDraft.entries()) {
      const product = Array.from(catalogProductsById.values()).find((row) => row.spu === spu);
      const draftProduct = draftProducts.get(spu);
      if (!product || !draftProduct) continue;
      const update = { id: product.id };
      let changed = false;
      for (const opt of opts.options) {
        const current = product[`option${opt}_name`];
        if (!isMissing(current)) continue;
        if (!presence[opt]) continue;
        const nextName = normalizeOptionValue(draftProduct[`draft_option${opt}_name`]);
        if (nextName == null) continue;
        update[`option${opt}_name`] = nextName;
        changed = true;
      }
      if (changed) draftProductUpdates.set(product.id, update);
    }

    draftFrom += PAGE_SIZE;
  }

  if (draftProductUpdates.size) {
    const updates = Array.from(draftProductUpdates.values());
    const updated = await applyUpdates(supabase, 'catalog_products', updates, 'id');
    draftUpdatedProducts = updated.updated;
  }

  console.log(`[backfill] draft-only catalog_variants updated: ${draftUpdatedVariants}`);
  console.log(`[backfill] draft-only catalog_products updated: ${draftUpdatedProducts}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
