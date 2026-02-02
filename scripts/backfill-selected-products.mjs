import { createClient } from '@supabase/supabase-js';

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
  .select('id,spu,supplier_1688_url')
  .in('spu', spus);

if (productsError) {
  console.error('catalog_products error', productsError);
  process.exit(1);
}

const productIdBySpu = new Map();
const supplierUrlBySpu = new Map();
for (const p of products || []) {
  if (p.spu) {
    productIdBySpu.set(p.spu, p.id);
    if (p.supplier_1688_url) supplierUrlBySpu.set(p.spu, p.supplier_1688_url);
  }
}

const productIds = Array.from(productIdBySpu.values());

const { data: variants, error: variantsError } = await supabase
  .from('catalog_variants')
  .select('id,product_id,sku,shipping_class,weight,purchase_price_cny')
  .in('product_id', productIds);

if (variantsError) {
  console.error('catalog_variants error', variantsError);
  process.exit(1);
}

const { data: draftVariants, error: draftVariantsError } = await supabase
  .from('draft_variants')
  .select('draft_sku,draft_spu,draft_shipping_class,draft_purchase_price_cny,draft_price,draft_raw_row')
  .in('draft_spu', spus);

if (draftVariantsError) {
  console.error('draft_variants error', draftVariantsError);
  process.exit(1);
}

const { data: draftProducts, error: draftProductsError } = await supabase
  .from('draft_products')
  .select('draft_spu,draft_raw_row')
  .in('draft_spu', spus);

if (draftProductsError) {
  console.error('draft_products error', draftProductsError);
  process.exit(1);
}

const draftVariantBySku = new Map();
for (const row of draftVariants || []) {
  if (row.draft_sku) draftVariantBySku.set(row.draft_sku, row);
}

const draftShipBySpu = new Map();
for (const row of draftProducts || []) {
  if (row.draft_spu) {
    const ship = row?.draft_raw_row?.product_shiptype || row?.draft_raw_row?.product_shipType;
    if (ship) draftShipBySpu.set(row.draft_spu, String(ship).toUpperCase());
  }
}

const updates = [];

function parseNumber(value) {
  const match = String(value ?? '').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function spuForProductId(productId) {
  for (const [spu, id] of productIdBySpu.entries()) {
    if (id === productId) return spu;
  }
  return null;
}

for (const row of variants || []) {
  const draft = draftVariantBySku.get(row.sku);
  const spu = spuForProductId(row.product_id);
  const updatesRow = { id: row.id };
  let changed = false;

  if (!row.shipping_class) {
    const fromDraft = draft?.draft_shipping_class || (spu ? draftShipBySpu.get(spu) : null);
    if (fromDraft) {
      updatesRow.shipping_class = String(fromDraft).toUpperCase();
      changed = true;
    }
  }

  if (row.purchase_price_cny == null || row.purchase_price_cny === '') {
    const priceCandidate =
      draft?.draft_purchase_price_cny ??
      draft?.draft_price ??
      draft?.draft_raw_row?.price ??
      null;
    const num = parseNumber(priceCandidate);
    if (num != null) {
      updatesRow.purchase_price_cny = num;
      changed = true;
    }
  }

  if (row.weight != null && row.weight !== '') {
    const weightNum = Number(row.weight);
    if (Number.isFinite(weightNum)) {
      if (weightNum >= 10) {
        const kg = weightNum / 1000;
        updatesRow.weight = kg;
        changed = true;
      }
    }
  }

  if (changed) updates.push(updatesRow);
}

let updatedCount = 0;
for (const u of updates) {
  const { error } = await supabase
    .from('catalog_variants')
    .update(u)
    .eq('id', u.id);
  if (error) {
    console.error('update error', u.id, error);
  } else {
    updatedCount += 1;
  }
}

console.log(`catalog_variants updated: ${updatedCount}`);

if (supplierUrlBySpu.size) {
  console.log('Supplier URLs:');
  for (const [spu, url] of supplierUrlBySpu.entries()) {
    console.log(`${spu}\t${url}`);
  }
}
