import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const UPLOAD_ROOT = "/srv/incoming-scripts/uploads/pricing-imports";

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s()_-]/g, "")
    .trim();

const normalizeNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\s+/g, "");
  if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const readCellText = (cell: ExcelJS.Cell) => {
  if (!cell) return "";
  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }
  if (typeof cell.value === "number") {
    return cell.text || String(cell.value);
  }
  if (typeof cell.value === "object" && cell.value !== null) {
    if ("text" in cell.value && typeof cell.value.text === "string") {
      return cell.value.text;
    }
  }
  return cell.text?.trim?.() ?? String(cell.value ?? "").trim();
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user };
};

const b2bMarketMap: Record<string, { market: string; currency: string }> = {
  b2b_se: { market: "SE", currency: "SEK" },
  b2b_no: { market: "NO", currency: "NOK" },
  b2b_dk: { market: "DK", currency: "DKK" },
  b2b_fi: { market: "FI", currency: "EUR" },
};

async function upsertB2BPrice(
  adminClient: AdminClient,
  variantId: string,
  field: keyof typeof b2bMarketMap,
  value: number | null,
  now: string
) {
  const mapping = b2bMarketMap[field];
  if (!mapping) return;
  const { market, currency } = mapping;
  if (value === null) {
    await adminClient
      .from("catalog_variant_prices")
      .update({ deleted_at: now, updated_at: now })
      .eq("catalog_variant_id", variantId)
      .eq("price_type", "b2b_fixed")
      .eq("market", market);
    return;
  }

  const { data: existingRow } = await adminClient
    .from("catalog_variant_prices")
    .select("id")
    .eq("catalog_variant_id", variantId)
    .eq("price_type", "b2b_fixed")
    .eq("market", market)
    .maybeSingle();

  if (existingRow?.id) {
    await adminClient
      .from("catalog_variant_prices")
      .update({
        currency,
        price: value,
        deleted_at: null,
        updated_at: now,
      })
      .eq("id", existingRow.id);
  } else {
    await adminClient.from("catalog_variant_prices").insert({
      catalog_variant_id: variantId,
      price_type: "b2b_fixed",
      market,
      currency,
      price: value,
      deleted_at: null,
      updated_at: now,
    });
  }
}

async function updateShopifyPrices(
  adminClient: AdminClient,
  variantId: string,
  priceType: string,
  price: number | null,
  compare: number | null,
  now: string
) {
  if (price === null && compare === null) return false;
  const { data: existingRow } = await adminClient
    .from("catalog_variant_prices")
    .select("id")
    .eq("catalog_variant_id", variantId)
    .eq("price_type", priceType)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existingRow?.id) {
    return false;
  }

  await adminClient
    .from("catalog_variant_prices")
    .update({
      price: price ?? undefined,
      compare_at_price: compare ?? undefined,
      updated_at: now,
    })
    .eq("id", existingRow.id);
  return true;
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }
  const admin = adminClient as AdminClient;

  const formData = await request.formData();
  const file = (formData.get("file") || formData.get("workbook")) as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing Excel file." }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const rawName = file.name || "pricing-import.xlsx";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storedPath = path.join(
    UPLOAD_ROOT,
    `${Date.now()}-${safeName}`
  );

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(storedPath, buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Missing worksheet." }, { status: 400 });
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const normalized = normalizeHeader(readCellText(cell));
    if (normalized) headerMap.set(normalized, colNumber);
  });

  const headerLookup = (name: string) => headerMap.get(normalizeHeader(name));
  const skuCol =
    headerLookup("sku") || headerLookup("SKU");

  if (!skuCol) {
    return NextResponse.json({ error: "SKU column is required." }, { status: 400 });
  }

  const fieldColumns: Record<string, number | undefined> = {
    shipping_class:
      headerLookup("shipping class") || headerLookup("shipping_class"),
    weight:
      headerLookup("weight (kg)") || headerLookup("weight"),
    purchase_price_cny:
      headerLookup("stock") ||
      headerLookup("stock (cny)") ||
      headerLookup("purchase price (cny)"),
    b2b_se: headerLookup("b2b se"),
    b2b_no: headerLookup("b2b no"),
    b2b_dk: headerLookup("b2b dk"),
    b2b_fi: headerLookup("b2b fi"),
    b2c_price: headerLookup("b2c"),
    shopify_tingelo_price: headerLookup("shopify tingelo price"),
    shopify_tingelo_compare: headerLookup("shopify tingelo compare"),
    shopify_wellando_price: headerLookup("shopify wellando price"),
    shopify_wellando_compare: headerLookup("shopify wellando compare"),
    shopify_sparklar_price: headerLookup("shopify sparklar price"),
    shopify_sparklar_compare: headerLookup("shopify sparklar compare"),
    shopify_shopify_price: headerLookup("shopify price"),
    shopify_shopify_compare: headerLookup("shopify compare"),
  };

  const skuValues: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = readCellText(row.getCell(skuCol)).trim();
    if (sku) skuValues.push(sku);
  });

  const uniqueSkus = Array.from(new Set(skuValues));
  const skuMap = new Map<string, string>();
  const chunks = [];
  for (let i = 0; i < uniqueSkus.length; i += 500) {
    chunks.push(uniqueSkus.slice(i, i + 500));
  }
  for (const batch of chunks) {
    const { data: rows } = await admin
      .from("catalog_variants")
      .select("id, sku")
      .in("sku", batch);
    rows?.forEach((row) => {
      if (row.sku && row.id) skuMap.set(String(row.sku), String(row.id));
    });
  }

  let updatedRows = 0;
  let skippedRows = 0;
  let shopifySkipped = 0;
  const now = new Date().toISOString();
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sku = readCellText(row.getCell(skuCol)).trim();
    if (!sku) {
      skippedRows += 1;
      continue;
    }
    const variantId = skuMap.get(sku);
    if (!variantId) {
      errors.push(`SKU not found: ${sku}`);
      skippedRows += 1;
      continue;
    }

    const updatePayload: Record<string, unknown> = {};
    if (fieldColumns.shipping_class) {
      const value = readCellText(row.getCell(fieldColumns.shipping_class)).trim();
      if (value) {
        updatePayload.shipping_class = value.toUpperCase();
      }
    }
    if (fieldColumns.weight) {
      const value = normalizeNumber(readCellText(row.getCell(fieldColumns.weight)));
      if (value !== null) updatePayload.weight = value;
    }
    if (fieldColumns.purchase_price_cny) {
      const value = normalizeNumber(
        readCellText(row.getCell(fieldColumns.purchase_price_cny))
      );
      if (value !== null) updatePayload.purchase_price_cny = value;
    }
    if (fieldColumns.b2c_price) {
      const value = normalizeNumber(
        readCellText(row.getCell(fieldColumns.b2c_price))
      );
      if (value !== null) updatePayload.price = value;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await admin
        .from("catalog_variants")
        .update({ ...updatePayload, updated_at: now })
        .eq("id", variantId);
      if (error) {
        errors.push(`SKU ${sku}: ${error.message}`);
        continue;
      }
    }

    for (const field of ["b2b_se", "b2b_no", "b2b_dk", "b2b_fi"] as const) {
      const column = fieldColumns[field];
      if (!column) continue;
      const value = normalizeNumber(readCellText(row.getCell(column)));
      if (value === null) continue;
      await upsertB2BPrice(admin, variantId, field, value, now);
    }

    const shopifyFields = [
      {
        priceKey: "shopify_tingelo_price",
        compareKey: "shopify_tingelo_compare",
        priceType: "shopify_tingelo",
      },
      {
        priceKey: "shopify_wellando_price",
        compareKey: "shopify_wellando_compare",
        priceType: "shopify_wellando",
      },
      {
        priceKey: "shopify_sparklar_price",
        compareKey: "shopify_sparklar_compare",
        priceType: "shopify_sparklar",
      },
      {
        priceKey: "shopify_shopify_price",
        compareKey: "shopify_shopify_compare",
        priceType: "shopify_shopify",
      },
    ];

    for (const shop of shopifyFields) {
      const priceColumn = fieldColumns[shop.priceKey];
      const compareColumn = fieldColumns[shop.compareKey];
      const shopifyPrice =
        priceColumn &&
        normalizeNumber(readCellText(row.getCell(priceColumn)));
      const shopifyCompare =
        compareColumn &&
        normalizeNumber(readCellText(row.getCell(compareColumn)));
      if (shopifyPrice === null && shopifyCompare === null) {
        continue;
      }
      const updated = await updateShopifyPrices(
        admin,
        variantId,
        shop.priceType,
        shopifyPrice ?? null,
        shopifyCompare ?? null,
        now
      );
      if (!updated) {
        shopifySkipped += 1;
      }
    }

    updatedRows += 1;
  }

  return NextResponse.json({
    updatedRows,
    skippedRows,
    shopifySkipped,
    errors,
    storedPath,
  });
}
