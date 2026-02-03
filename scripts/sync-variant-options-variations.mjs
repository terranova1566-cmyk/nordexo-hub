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

const DEFAULT_OPTION_LABELS = {
  1: 'Antal',
  2: 'Färg',
  3: 'Storlek',
  4: 'Alternativ',
};

const PAIRS = [
  { index: 1, option: 'option1', variation: 'variation_amount_se' },
  { index: 2, option: 'option2', variation: 'variation_color_se' },
  { index: 3, option: 'option3', variation: 'variation_size_se' },
  { index: 4, option: 'option4', variation: 'variation_other_se' },
];

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 1000);

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

  const onlySpuRaw = values.get('only-spu') || '';
  const onlySpus = onlySpuRaw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return {
    apply: flags.has('apply'),
    onlySpus,
    reportDir: values.get('export-dir') || '/srv/nordexo-hub/exports',
  };
}

function normalizeValue(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}


function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

async function applyUpdates(table, updates, key = 'id') {
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
        console.error(`[sync] ${table} update failed`, id, error.message || error);
        continue;
      }
      updated += 1;
      if (updated % 1000 === 0) {
        console.log(`[sync] ${table} updated ${updated} rows...`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (skipped) console.log(`[sync] ${table} skipped updates: ${skipped}`);
  if (failed) console.log(`[sync] ${table} failed updates: ${failed}`);
  return { updated, skipped, failed };
}

async function fetchProductIdsBySpu(spus) {
  if (!spus.length) return [];
  const ids = [];
  const chunks = chunkArray(spus, 500);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id,spu')
      .in('spu', chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row?.id) ids.push(row.id);
    }
  }
  return ids;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = opts.reportDir;

  const onlyProductIds = opts.onlySpus.length ? await fetchProductIdsBySpu(opts.onlySpus) : [];
  if (opts.onlySpus.length) {
    console.log(`[sync] only-spu filter: ${opts.onlySpus.length} spu(s)`);
    console.log(`[sync] matched product ids: ${onlyProductIds.length}`);
    if (!onlyProductIds.length) return;
  }

  const updates = [];
  const updateRows = [];
  const conflictRows = [];
  const presenceByProduct = new Map();

  async function processRows(rows) {
    for (const row of rows) {
      const update = { id: row.id };
      let changed = false;

      for (const pair of PAIRS) {
        const optValue = normalizeValue(row[pair.option]);
        const varValue = normalizeValue(row[pair.variation]);
        const hasOpt = optValue != null;
        const hasVar = varValue != null;

        if (!presenceByProduct.has(row.product_id)) {
          presenceByProduct.set(row.product_id, { 1: false, 2: false, 3: false, 4: false });
        }
        if (hasOpt || hasVar) {
          presenceByProduct.get(row.product_id)[pair.index] = true;
        }

        if (hasOpt && !hasVar) {
          update[pair.variation] = optValue;
          changed = true;
          updateRows.push({
            id: row.id,
            product_id: row.product_id ?? '',
            sku: row.sku ?? '',
            field: pair.variation,
            from_value: '',
            to_value: optValue,
            direction: `${pair.option}->${pair.variation}`,
          });
        } else if (!hasOpt && hasVar) {
          update[pair.option] = varValue;
          changed = true;
          updateRows.push({
            id: row.id,
            product_id: row.product_id ?? '',
            sku: row.sku ?? '',
            field: pair.option,
            from_value: '',
            to_value: varValue,
            direction: `${pair.variation}->${pair.option}`,
          });
        } else if (hasOpt && hasVar && optValue !== varValue) {
          conflictRows.push({
            id: row.id,
            product_id: row.product_id ?? '',
            sku: row.sku ?? '',
            option_field: pair.option,
            variation_field: pair.variation,
            option_value: optValue,
            variation_value: varValue,
          });
        }
      }

      if (changed) updates.push(update);
    }
  }

  if (onlyProductIds.length) {
    const chunks = chunkArray(onlyProductIds, 200);
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
            'variation_amount_se',
            'variation_color_se',
            'variation_size_se',
            'variation_other_se',
          ].join(',')
        )
        .in('product_id', chunk);
      if (error) throw error;
      if (data?.length) await processRows(data);
    }
  } else {
    let offset = 0;
    while (true) {
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
            'variation_amount_se',
            'variation_color_se',
            'variation_size_se',
            'variation_other_se',
          ].join(',')
        )
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      await processRows(data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const updateReportPath = path.join(reportDir, `options-variation-sync-${timestamp}.tsv`);
  const conflictReportPath = path.join(reportDir, `options-variation-conflicts-${timestamp}.tsv`);

  const updateHeaders = ['id', 'product_id', 'sku', 'field', 'from_value', 'to_value', 'direction'];
  const conflictHeaders = ['id', 'product_id', 'sku', 'option_field', 'variation_field', 'option_value', 'variation_value'];

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    updateReportPath,
    [updateHeaders.join('\t')]
      .concat(
        updateRows.map((row) =>
          updateHeaders
            .map((key) => (row[key] == null ? '' : String(row[key]).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')))
            .join('\t')
        )
      )
      .join('\n'),
    'utf8'
  );
  await fs.writeFile(
    conflictReportPath,
    [conflictHeaders.join('\t')]
      .concat(
        conflictRows.map((row) =>
          conflictHeaders
            .map((key) => (row[key] == null ? '' : String(row[key]).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')))
            .join('\t')
        )
      )
      .join('\n'),
    'utf8'
  );

  console.log(`[sync] variant updates queued: ${updates.length}`);
  console.log(`[sync] conflict rows: ${conflictRows.length}`);
  console.log(`[sync] update report: ${updateReportPath}`);
  console.log(`[sync] conflict report: ${conflictReportPath}`);

  const productUpdates = [];
  const productReportRows = [];

  for (const [productId, presence] of presenceByProduct.entries()) {
    const update = { id: productId };
    for (const pair of PAIRS) {
      const next = presence[pair.index] ? DEFAULT_OPTION_LABELS[pair.index] : null;
      update[`option${pair.index}_name`] = next;
      productReportRows.push({
        id: productId,
        field: `option${pair.index}_name`,
        to_value: next ?? '',
      });
    }
    productUpdates.push(update);
  }

  const productReportPath = path.join(reportDir, `options-name-sync-${timestamp}.tsv`);
  const productHeaders = ['id', 'field', 'to_value'];
  await fs.writeFile(
    productReportPath,
    [productHeaders.join('\t')]
      .concat(
        productReportRows.map((row) =>
          productHeaders
            .map((key) => (row[key] == null ? '' : String(row[key]).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')))
            .join('\t')
        )
      )
      .join('\n'),
    'utf8'
  );

  console.log(`[sync] product option-name updates queued: ${productUpdates.length}`);
  console.log(`[sync] product report: ${productReportPath}`);

  if (!opts.apply) {
    console.log('[sync] dry-run complete (use --apply to write updates)');
    return;
  }

  const variantResult = await applyUpdates('catalog_variants', updates, 'id');
  const productResult = await applyUpdates('catalog_products', productUpdates, 'id');

  console.log(`[sync] catalog_variants updated: ${variantResult.updated}`);
  console.log(`[sync] catalog_products updated: ${productResult.updated}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
