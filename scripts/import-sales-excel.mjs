import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const ROOT = '/srv';
const ENV_FILES = [
  '/srv/nordexo-hub/.env.local',
  '/srv/node-tools/.env',
  '/srv/shopify-sync/.env',
];

const loadEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
};

ENV_FILES.forEach(loadEnv);

function parseArgs(argv) {
  const args = {
    file: null,
    sheet: process.env.SALES_SHEET ?? 'sales',
    dryRun: false,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--sheet') {
      args.sheet = argv[i + 1] ?? args.sheet;
      i += 1;
      continue;
    }
    if (a === '--limit') {
      const v = Number(argv[i + 1]);
      args.limit = Number.isFinite(v) ? v : null;
      i += 1;
      continue;
    }
    if (!a.startsWith('--') && !args.file) {
      args.file = a;
    }
  }

  if (!args.file) {
    args.file = process.env.SALES_XLSX ?? null;
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.file) {
  console.error(
    'Missing Excel file. Usage: node scripts/import-sales-excel.mjs /path/to/sales.xlsx [--sheet sales] [--dry-run] [--limit N]'
  );
  process.exit(1);
}

const filePath = path.isAbsolute(args.file) ? args.file : path.join(ROOT, args.file);
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const fileBuffer = await fsPromises.readFile(filePath);
const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const toText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = Number(match[0].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function parseUnits(value) {
  const num = parseNumber(value);
  if (num === null) return null;
  const rounded = Math.round(num);
  if (Math.abs(num - rounded) > 1e-9) return null;
  return rounded;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

function parseDateYmd(value) {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return formatYmd(y, m, d);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return raw;
  }

  const isoSlash = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlash) {
    return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return null;

    // Disambiguate DD/MM vs MM/DD; if ambiguous, force ISO input.
    if (a <= 12 && b <= 12) return null;
    const day = a > 12 ? a : b;
    const month = a > 12 ? b : a;
    return formatYmd(y, month, day);
  }

  return null;
}

function normalizeSku(value) {
  const sku = toText(value);
  if (!sku) return { sku: null, sku_norm: null };
  const sku_norm = sku.replace(/\s+/g, '').toUpperCase();
  return { sku, sku_norm };
}

function splitTaxonomyPath(value) {
  const raw = toText(value);
  if (!raw) return { google_taxonomy_path: null, l1: null, l2: null, l3: null };
  const parts = raw
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);
  const google_taxonomy_path = parts.join(' > ');
  return {
    google_taxonomy_path,
    l1: parts[0] ?? null,
    l2: parts[1] ?? null,
    l3: parts[2] ?? null,
  };
}

const FIELD_ALIASES = {
  sku: ['sku', 'variant_sku'],
  sold_date: ['sold_date', 'sale_date', 'sales_date', 'date', 'day'],
  units_sold: ['units_sold', 'units', 'qty', 'quantity', 'amount_sold'],
  revenue: ['revenue', 'sales_value', 'value', 'sales', 'amount', 'total'],
  currency: ['currency', 'curr'],
  seller: ['seller', 'channel', 'store', 'marketplace'],
  title: ['title', 'product_title'],
  supplier_name: ['supplier_name', 'supplier', 'vendor'],
  google_taxonomy_path: ['google_taxonomy_path', 'google_taxonomy', 'taxonomy_path', 'category'],
  google_taxonomy_l1: ['google_taxonomy_l1', 'taxonomy_l1'],
  google_taxonomy_l2: ['google_taxonomy_l2', 'taxonomy_l2'],
  google_taxonomy_l3: ['google_taxonomy_l3', 'taxonomy_l3'],
};

const REQUIRED_FIELDS = ['sku', 'sold_date', 'units_sold', 'revenue'];

console.log('Reading:', filePath);
console.log('SHA256:', fileSha256);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(fileBuffer);

const wantedSheet = String(args.sheet || '').trim();
let ws =
  workbook.getWorksheet(wantedSheet) ||
  workbook.worksheets.find(
    (w) => String(w.name || '').trim().toLowerCase() === wantedSheet.toLowerCase()
  ) ||
  workbook.worksheets[0];

if (!ws) {
  console.error('No worksheet found in file.');
  process.exit(1);
}

console.log('Using worksheet:', ws.name);

const headerRow = ws.getRow(1);
const colCount = headerRow.cellCount || 0;
if (!colCount) {
  console.error('Missing header row (row 1).');
  process.exit(1);
}

const headerByCol = new Map();
for (let c = 1; c <= colCount; c += 1) {
  const cell = headerRow.getCell(c);
  const rawHeader = cell?.text ?? cell?.value ?? '';
  const key = normalizeHeader(rawHeader);
  if (key) headerByCol.set(c, key);
}

const colByField = {};
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  const aliasSet = new Set(aliases.map((a) => normalizeHeader(a)));
  for (const [col, headerKey] of headerByCol.entries()) {
    if (aliasSet.has(headerKey)) {
      colByField[field] = col;
      break;
    }
  }
}

const missingRequired = REQUIRED_FIELDS.filter((f) => !colByField[f]);
if (missingRequired.length) {
  console.error('Missing required columns:', missingRequired.join(', '));
  console.error('Found headers:', Array.from(headerByCol.values()).join(', '));
  process.exit(1);
}

const getCellValue = (row, field) => {
  const col = colByField[field];
  if (!col) return null;
  return row.getCell(col)?.value ?? null;
};

const dimBySku = new Map();
const factAgg = new Map();
const errors = [];

let rawRows = 0;

const lastRow = ws.rowCount || 0;
for (let r = 2; r <= lastRow; r += 1) {
  if (args.limit && rawRows >= args.limit) break;

  const row = ws.getRow(r);
  const skuCell = getCellValue(row, 'sku');
  const dateCell = getCellValue(row, 'sold_date');
  const unitsCell = getCellValue(row, 'units_sold');
  const revenueCell = getCellValue(row, 'revenue');

  // Skip fully empty rows.
  if (
    (skuCell === null || skuCell === undefined || skuCell === '') &&
    (dateCell === null || dateCell === undefined || dateCell === '') &&
    (unitsCell === null || unitsCell === undefined || unitsCell === '') &&
    (revenueCell === null || revenueCell === undefined || revenueCell === '')
  ) {
    continue;
  }

  rawRows += 1;

  const { sku, sku_norm } = normalizeSku(skuCell);
  const sold_date = parseDateYmd(dateCell);
  const units_sold = parseUnits(unitsCell);
  const revenue = parseNumber(revenueCell);
  const currency = toText(getCellValue(row, 'currency')) ?? 'UNK';
  const seller = toText(getCellValue(row, 'seller')) ?? 'all';

  if (!sku) {
    errors.push({ row: r, error: 'Missing sku' });
    continue;
  }
  if (!sold_date) {
    errors.push({
      row: r,
      error:
        'Invalid sold_date (use YYYY-MM-DD or an Excel date). Ambiguous DD/MM vs MM/DD dates are rejected.',
    });
    continue;
  }
  if (units_sold === null || units_sold < 0) {
    errors.push({ row: r, error: 'Invalid units_sold (must be a non-negative integer)' });
    continue;
  }
  if (revenue === null || revenue < 0) {
    errors.push({ row: r, error: 'Invalid revenue (must be a non-negative number)' });
    continue;
  }

  const title = toText(getCellValue(row, 'title'));
  const supplier_name = toText(getCellValue(row, 'supplier_name'));

  const pathCell = getCellValue(row, 'google_taxonomy_path');
  const pathParsed = splitTaxonomyPath(pathCell);
  const google_taxonomy_path = pathParsed.google_taxonomy_path;

  const google_taxonomy_l1 = toText(getCellValue(row, 'google_taxonomy_l1')) ?? pathParsed.l1;
  const google_taxonomy_l2 = toText(getCellValue(row, 'google_taxonomy_l2')) ?? pathParsed.l2;
  const google_taxonomy_l3 = toText(getCellValue(row, 'google_taxonomy_l3')) ?? pathParsed.l3;

  const dimExisting = dimBySku.get(sku) ?? { sku };
  dimBySku.set(sku, {
    sku,
    sku_norm: sku_norm ?? dimExisting.sku_norm ?? null,
    title: title ?? dimExisting.title ?? null,
    supplier_name: supplier_name ?? dimExisting.supplier_name ?? null,
    google_taxonomy_path: google_taxonomy_path ?? dimExisting.google_taxonomy_path ?? null,
    google_taxonomy_l1: google_taxonomy_l1 ?? dimExisting.google_taxonomy_l1 ?? null,
    google_taxonomy_l2: google_taxonomy_l2 ?? dimExisting.google_taxonomy_l2 ?? null,
    google_taxonomy_l3: google_taxonomy_l3 ?? dimExisting.google_taxonomy_l3 ?? null,
  });

  const factKey = `${sku}||${sold_date}||${seller}||${currency}`;
  const existing = factAgg.get(factKey);
  if (existing) {
    existing.units_sold += units_sold;
    existing.revenue += revenue;
  } else {
    factAgg.set(factKey, {
      sku,
      sold_date,
      seller,
      currency,
      units_sold,
      revenue,
    });
  }
}

if (errors.length) {
  console.error(`Found ${errors.length} error(s). First 20:`);
  for (const e of errors.slice(0, 20)) {
    console.error(`- row ${e.row}: ${e.error}`);
  }
  process.exit(1);
}

const dims = Array.from(dimBySku.values());
const facts = Array.from(factAgg.values());

console.log('Raw rows processed:', rawRows);
console.log('Distinct SKUs:', dims.length);
console.log('Distinct fact keys:', facts.length);

if (args.dryRun) {
  console.log('Dry run: not writing to Supabase.');
  console.log('Sample SKU dim rows:', dims.slice(0, 3));
  console.log('Sample fact rows:', facts.slice(0, 3));
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nowIso = new Date().toISOString();

console.log('Creating import run row...');
const { data: runRow, error: runErr } = await supabase
  .from('sales_import_runs')
  .insert({
    file_name: path.basename(filePath),
    file_sha256: fileSha256,
    raw_row_count: rawRows,
    fact_row_count: facts.length,
    error_count: 0,
    meta: {
      sheet: ws.name,
      root: ROOT,
      importer: 'scripts/import-sales-excel.mjs',
      imported_at: nowIso,
    },
  })
  .select('id')
  .maybeSingle();

if (runErr || !runRow?.id) {
  console.error('Failed to create sales_import_runs row:', runErr?.message ?? runErr);
  process.exit(1);
}

const runId = runRow.id;
console.log('Import run id:', runId);

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
};

console.log('Upserting sales_skus...');
const dimBatches = chunk(
  dims.map((d) => ({ ...d, import_run_id: runId })),
  500
);

let dimUpserts = 0;
for (const [idx, batch] of dimBatches.entries()) {
  const { error } = await supabase.from('sales_skus').upsert(batch, { onConflict: 'sku' });
  if (error) {
    console.error('sales_skus upsert failed (batch', idx + 1, '):', error.message);
    process.exit(1);
  }
  dimUpserts += batch.length;
  if ((idx + 1) % 10 === 0 || idx + 1 === dimBatches.length) {
    console.log(`- sales_skus upserted: ${dimUpserts}/${dims.length}`);
  }
}

console.log('Upserting sales_facts...');
const factsWithMeta = facts.map((f) => ({
  ...f,
  import_run_id: runId,
  imported_at: nowIso,
}));

const factBatches = chunk(factsWithMeta, 1000);
let factUpserts = 0;
for (const [idx, batch] of factBatches.entries()) {
  const { error } = await supabase.from('sales_facts').upsert(batch, {
    onConflict: 'sku,sold_date,seller,currency',
  });
  if (error) {
    console.error('sales_facts upsert failed (batch', idx + 1, '):', error.message);
    process.exit(1);
  }
  factUpserts += batch.length;
  if ((idx + 1) % 10 === 0 || idx + 1 === factBatches.length) {
    console.log(`- sales_facts upserted: ${factUpserts}/${facts.length}`);
  }
}

console.log('Import complete.');

