import path from "path";
import fs from "fs/promises";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { runMeiliIndexSpus } from "@/lib/server/meili-index";

export const runtime = "nodejs";

const UPLOAD_ROOT = "/srv/incoming-scripts/uploads/saved-list-imports";
const IMAGE_ROOT = "/srv/resources/media/images";
const SIZE_DIRS = ["", "standard", "small", "thumb", "original"] as const;
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
const PRODUCT_META_KEYS = [
  "description_short",
  "description_extended",
  "short_title",
  "long_title",
  "subtitle",
  "bullets_short",
  "bullets",
  "bullets_long",
  "specs",
] as const;
const B2B_MARKET_CONFIG = {
  SE: { currency: "SEK" },
  NO: { currency: "NOK" },
  DK: { currency: "DKK" },
  FI: { currency: "EUR" },
} as const;

type B2BMarket = keyof typeof B2B_MARKET_CONFIG;
type ProductMetaKey = (typeof PRODUCT_META_KEYS)[number];
type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;
type ImportRow = {
  rowNumber: number;
  spu: string | null;
  productId: string | null;
  variantId: string | null;
  originalSku: string | null;
  sku: string | null;
  supplierLink: string | null;
  purchasePriceCnyRaw: string | null;
  weightRaw: string | null;
  optionCombinedZh: string | null;
  option1Zh: string | null;
  option2Zh: string | null;
  option3Zh: string | null;
  option4Zh: string | null;
  shortTitleZh: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  option4: string | null;
  variationAmountSe: string | null;
  variationColorSe: string | null;
  variationSizeSe: string | null;
  variationOtherSe: string | null;
  variantImage: string | null;
  b2bSeRaw: string | null;
  b2bNoRaw: string | null;
  b2bDkRaw: string | null;
  b2bFiRaw: string | null;
  shortTitle: string | null;
  longTitle: string | null;
  subtitle: string | null;
  descriptionShort: string | null;
  descriptionExtended: string | null;
  bulletsShort: string | null;
  bullets: string | null;
  bulletsLong: string | null;
  specsRaw: string | null;
  supplierName: string | null;
  supplierLocation: string | null;
  shippingNameEn: string | null;
  shippingNameZh: string | null;
  shippingClass: string | null;
};
type ProductIntent = {
  supplierLink: string | null;
  subtitle: string | null;
  metas: Record<ProductMetaKey, string | null>;
  spu: string | null;
};

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

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; adminClient: AdminClient; userId: string }
> => {
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

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing Supabase credentials.",
    };
  }

  return { ok: true, adminClient, userId: user.id };
};

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s()_-]/g, "")
    .trim();

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

const toNullableText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const parseNumber = (raw: string | null) => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { value: null as number | null, error: null as string | null };
  let normalized = trimmed.replace(/\s+/g, "");
  if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return {
      value: null as number | null,
      error: `Invalid number: "${trimmed}"`,
    };
  }
  return { value: parsed, error: null as string | null };
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveFolderPath = (imageFolder: string | null) => {
  if (!imageFolder) return null;
  const folderPath = imageFolder.startsWith("/")
    ? imageFolder
    : path.join(IMAGE_ROOT, imageFolder);
  if (!folderPath.startsWith(IMAGE_ROOT)) return null;
  return folderPath;
};

const exists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const maybeRenameImageForSku = async (input: {
  imageFolder: string | null;
  imageFilename: string | null;
  oldSku: string | null;
  newSku: string | null;
}) => {
  const imageFilename = path.basename(String(input.imageFilename || "").trim());
  const oldSku = String(input.oldSku || "").trim();
  const newSku = String(input.newSku || "").trim();

  if (!imageFilename || !oldSku || !newSku || oldSku === newSku) {
    return { filename: imageFilename || null, renamed: false };
  }

  const matcher = new RegExp(escapeRegExp(oldSku), "ig");
  if (!matcher.test(imageFilename)) {
    return { filename: imageFilename, renamed: false };
  }
  matcher.lastIndex = 0;
  const nextFilename = imageFilename.replace(matcher, newSku);
  if (!nextFilename || nextFilename === imageFilename) {
    return { filename: imageFilename, renamed: false };
  }

  const folderPath = resolveFolderPath(input.imageFolder);
  if (!folderPath) {
    return { filename: nextFilename, renamed: false };
  }

  let renamedAny = false;
  for (const dir of SIZE_DIRS) {
    const fromPath = path.join(folderPath, dir, imageFilename);
    const toPath = path.join(folderPath, dir, nextFilename);
    const [fromExists, toExists] = await Promise.all([
      exists(fromPath),
      exists(toPath),
    ]);
    if (!fromExists) continue;
    if (toExists) {
      throw new Error(
        `Variant image rename target already exists (${nextFilename}).`
      );
    }
    await fs.rename(fromPath, toPath);
    renamedAny = true;
  }

  return { filename: nextFilename, renamed: renamedAny };
};

const syncCanonicalImageRename = async (input: {
  adminClient: AdminClient;
  productId: string;
  fromFilename: string;
  toFilename: string;
  userId: string;
  nowIso: string;
}) => {
  if (!input.fromFilename || !input.toFilename || input.fromFilename === input.toFilename) {
    return;
  }
  const payload: Record<string, unknown> = {
    filename: input.toFilename,
    updated_at: input.nowIso,
    selected_via: "saved_full_import_sku_rename",
    selected_by: input.userId,
    selected_at: input.nowIso,
  };
  try {
    await input.adminClient
      .from("catalog_product_image_assets")
      .update(payload)
      .eq("product_id", input.productId)
      .eq("filename", input.fromFilename);
  } catch {
    // Best effort only.
  }
};

const upsertB2BPrice = async (input: {
  adminClient: AdminClient;
  variantId: string;
  market: B2BMarket;
  value: number | null;
  nowIso: string;
}) => {
  const { adminClient, variantId, market, value, nowIso } = input;
  if (value === null) {
    await adminClient
      .from("catalog_variant_prices")
      .update({ deleted_at: nowIso, updated_at: nowIso })
      .eq("catalog_variant_id", variantId)
      .eq("market", market)
      .in("price_type", ["b2b_fixed", "b2b_dropship"]);
    return;
  }

  const { data: existingRow } = await adminClient
    .from("catalog_variant_prices")
    .select("id")
    .eq("catalog_variant_id", variantId)
    .eq("market", market)
    .eq("price_type", "b2b_fixed")
    .maybeSingle();

  if (existingRow?.id) {
    await adminClient
      .from("catalog_variant_prices")
      .update({
        currency: B2B_MARKET_CONFIG[market].currency,
        price: value,
        deleted_at: null,
        updated_at: nowIso,
      })
      .eq("id", existingRow.id);
    return;
  }

  await adminClient.from("catalog_variant_prices").insert({
    catalog_variant_id: variantId,
    price_type: "b2b_fixed",
    market,
    currency: B2B_MARKET_CONFIG[market].currency,
    price: value,
    deleted_at: null,
    updated_at: nowIso,
  });
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const { adminClient, userId } = adminCheck;
  const formData = await request.formData();
  const file = (formData.get("file") || formData.get("workbook")) as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing Excel file." }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const safeName = (file.name || "saved-import.xlsx").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storedPath = path.join(UPLOAD_ROOT, `${Date.now()}-${safeName}`);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(storedPath, buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Missing worksheet." }, { status: 400 });
  }

  const headerMap = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const normalized = normalizeHeader(readCellText(cell));
    if (normalized) headerMap.set(normalized, colNumber);
  });
  const col = (...names: string[]) => {
    for (const name of names) {
      const hit = headerMap.get(normalizeHeader(name));
      if (hit) return hit;
    }
    return null;
  };

  const requiredHeaders = [
    "SPU",
    "SKU",
    "Original SKU",
    "Product ID",
    "Variant ID",
    "Supplier Link",
    "Purchase Price CNY",
    "Weight KG",
    "Option Combined ZH",
  ];
  const missingHeaders = requiredHeaders.filter((name) => !col(name));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error:
          "This import accepts only the full 'Export all data' format. Missing required columns.",
        missing_headers: missingHeaders,
      },
      { status: 400 }
    );
  }

  const columns = {
    spu: col("SPU")!,
    sku: col("SKU")!,
    originalSku: col("Original SKU")!,
    productId: col("Product ID")!,
    variantId: col("Variant ID")!,
    supplierLink: col("Supplier Link"),
    purchasePriceCny: col("Purchase Price CNY"),
    weight: col("Weight KG", "Weight (kg)", "Weight"),
    optionCombinedZh: col("Option Combined ZH"),
    option1Zh: col("Option1 ZH"),
    option2Zh: col("Option2 ZH"),
    option3Zh: col("Option3 ZH"),
    option4Zh: col("Option4 ZH"),
    shortTitleZh: col("Short Title ZH"),
    option1: col("Option1"),
    option2: col("Option2"),
    option3: col("Option3"),
    option4: col("Option4"),
    variationAmountSe: col("Amount SE"),
    variationColorSe: col("Color SE"),
    variationSizeSe: col("Size SE"),
    variationOtherSe: col("Other SE"),
    variantImage: col("Variant Image"),
    b2bSe: col("B2B SE"),
    b2bNo: col("B2B NO"),
    b2bDk: col("B2B DK"),
    b2bFi: col("B2B FI"),
    shortTitle: col("Short Title"),
    longTitle: col("Long Title"),
    subtitle: col("Subtitle"),
    descriptionShort: col("Description Short"),
    descriptionExtended: col("Description Extended"),
    bulletsShort: col("Bullets Short"),
    bullets: col("Bullets"),
    bulletsLong: col("Bullets Long"),
    specsRaw: col("Specs Raw"),
    supplierName: col("Supplier Name"),
    supplierLocation: col("Supplier Location"),
    shippingNameEn: col("Shipping Name EN"),
    shippingNameZh: col("Shipping Name ZH"),
    shippingClass: col("Shipping Class"),
  };

  const readColText = (row: ExcelJS.Row, column: number | null) => {
    if (!column) return null;
    return toNullableText(readCellText(row.getCell(column)));
  };

  const rows: ImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const nextRow: ImportRow = {
      rowNumber,
      spu: readColText(row, columns.spu),
      productId: readColText(row, columns.productId),
      variantId: readColText(row, columns.variantId),
      originalSku: readColText(row, columns.originalSku),
      sku: readColText(row, columns.sku),
      supplierLink: readColText(row, columns.supplierLink),
      purchasePriceCnyRaw: readColText(row, columns.purchasePriceCny),
      weightRaw: readColText(row, columns.weight),
      optionCombinedZh: readColText(row, columns.optionCombinedZh),
      option1Zh: readColText(row, columns.option1Zh),
      option2Zh: readColText(row, columns.option2Zh),
      option3Zh: readColText(row, columns.option3Zh),
      option4Zh: readColText(row, columns.option4Zh),
      shortTitleZh: readColText(row, columns.shortTitleZh),
      option1: readColText(row, columns.option1),
      option2: readColText(row, columns.option2),
      option3: readColText(row, columns.option3),
      option4: readColText(row, columns.option4),
      variationAmountSe: readColText(row, columns.variationAmountSe),
      variationColorSe: readColText(row, columns.variationColorSe),
      variationSizeSe: readColText(row, columns.variationSizeSe),
      variationOtherSe: readColText(row, columns.variationOtherSe),
      variantImage: readColText(row, columns.variantImage),
      b2bSeRaw: readColText(row, columns.b2bSe),
      b2bNoRaw: readColText(row, columns.b2bNo),
      b2bDkRaw: readColText(row, columns.b2bDk),
      b2bFiRaw: readColText(row, columns.b2bFi),
      shortTitle: readColText(row, columns.shortTitle),
      longTitle: readColText(row, columns.longTitle),
      subtitle: readColText(row, columns.subtitle),
      descriptionShort: readColText(row, columns.descriptionShort),
      descriptionExtended: readColText(row, columns.descriptionExtended),
      bulletsShort: readColText(row, columns.bulletsShort),
      bullets: readColText(row, columns.bullets),
      bulletsLong: readColText(row, columns.bulletsLong),
      specsRaw: readColText(row, columns.specsRaw),
      supplierName: readColText(row, columns.supplierName),
      supplierLocation: readColText(row, columns.supplierLocation),
      shippingNameEn: readColText(row, columns.shippingNameEn),
      shippingNameZh: readColText(row, columns.shippingNameZh),
      shippingClass: readColText(row, columns.shippingClass),
    };

    const isEmpty =
      !nextRow.spu &&
      !nextRow.productId &&
      !nextRow.variantId &&
      !nextRow.originalSku &&
      !nextRow.sku;
    if (!isEmpty) rows.push(nextRow);
  }

  const variantIds = Array.from(
    new Set(rows.map((row) => row.variantId).filter(Boolean))
  ) as string[];
  const originalSkus = Array.from(
    new Set(rows.map((row) => row.originalSku).filter(Boolean))
  ) as string[];

  const variantById = new Map<
    string,
    { id: string; product_id: string; sku: string | null; variant_image_url: string | null }
  >();
  const variantBySku = new Map<
    string,
    { id: string; product_id: string; sku: string | null; variant_image_url: string | null }
  >();

  for (const batch of chunk(variantIds, 400)) {
    const { data } = await adminClient
      .from("catalog_variants")
      .select("id, product_id, sku, variant_image_url")
      .in("id", batch);
    (data ?? []).forEach((row) => {
      if (!row.id || !row.product_id) return;
      const item = {
        id: String(row.id),
        product_id: String(row.product_id),
        sku: row.sku ? String(row.sku) : null,
        variant_image_url: row.variant_image_url
          ? String(row.variant_image_url)
          : null,
      };
      variantById.set(item.id, item);
      if (item.sku) variantBySku.set(item.sku, item);
    });
  }

  for (const batch of chunk(originalSkus, 400)) {
    const { data } = await adminClient
      .from("catalog_variants")
      .select("id, product_id, sku, variant_image_url")
      .in("sku", batch);
    (data ?? []).forEach((row) => {
      if (!row.id || !row.product_id) return;
      const item = {
        id: String(row.id),
        product_id: String(row.product_id),
        sku: row.sku ? String(row.sku) : null,
        variant_image_url: row.variant_image_url
          ? String(row.variant_image_url)
          : null,
      };
      variantById.set(item.id, item);
      if (item.sku) variantBySku.set(item.sku, item);
    });
  }

  const productIds = Array.from(
    new Set(
      rows
        .map((row) => row.productId)
        .filter(Boolean)
        .concat(
          Array.from(variantById.values())
            .map((variant) => variant.product_id)
            .filter(Boolean)
        )
    )
  ) as string[];
  const productById = new Map<
    string,
    { id: string; spu: string | null; image_folder: string | null }
  >();

  for (const batch of chunk(productIds, 300)) {
    const { data } = await adminClient
      .from("catalog_products")
      .select("id, spu, image_folder")
      .in("id", batch);
    (data ?? []).forEach((row) => {
      if (!row.id) return;
      productById.set(String(row.id), {
        id: String(row.id),
        spu: row.spu ? String(row.spu) : null,
        image_folder: row.image_folder ? String(row.image_folder) : null,
      });
    });
  }

  const { data: metaDefs } = await adminClient
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("namespace", PRODUCT_META_NAMESPACES)
    .in("key", [...PRODUCT_META_KEYS]);
  const definitionIdsByKey = new Map<ProductMetaKey, string[]>();
  const preferredDefinitionByKey = new Map<ProductMetaKey, string>();
  PRODUCT_META_KEYS.forEach((key) => definitionIdsByKey.set(key, []));
  (metaDefs ?? []).forEach((def) => {
    const key = String(def.key || "") as ProductMetaKey;
    if (!PRODUCT_META_KEYS.includes(key)) return;
    const id = String(def.id || "");
    if (!id) return;
    const list = definitionIdsByKey.get(key) ?? [];
    list.push(id);
    definitionIdsByKey.set(key, list);
    const currentPreferred = preferredDefinitionByKey.get(key);
    if (!currentPreferred) {
      preferredDefinitionByKey.set(key, id);
      return;
    }
    const namespace = String(def.namespace || "");
    if (namespace === "product_global") {
      preferredDefinitionByKey.set(key, id);
    }
  });

  let updatedRows = 0;
  let skippedRows = 0;
  let skuRenamed = 0;
  let variantImagesRenamed = 0;
  let productRowsUpdated = 0;
  const errors: string[] = [];
  const touchedSpus = new Set<string>();
  const productIntents = new Map<string, ProductIntent>();

  for (const row of rows) {
    const byVariantId = row.variantId ? variantById.get(row.variantId) : null;
    const byOriginalSku = row.originalSku ? variantBySku.get(row.originalSku) : null;
    const variant = byVariantId ?? byOriginalSku;

    if (!variant) {
      errors.push(`Row ${row.rowNumber}: variant not found.`);
      skippedRows += 1;
      continue;
    }
    const product = productById.get(variant.product_id);
    if (!product) {
      errors.push(`Row ${row.rowNumber}: product not found for variant ${variant.id}.`);
      skippedRows += 1;
      continue;
    }
    if (row.productId && row.productId !== variant.product_id) {
      errors.push(
        `Row ${row.rowNumber}: Product ID mismatch for variant ${variant.id}.`
      );
      skippedRows += 1;
      continue;
    }
    if (row.spu && product.spu && row.spu !== product.spu) {
      errors.push(`Row ${row.rowNumber}: SPU mismatch for variant ${variant.id}.`);
      skippedRows += 1;
      continue;
    }

    const nextSku = toNullableText(row.sku);
    if (!nextSku) {
      errors.push(`Row ${row.rowNumber}: SKU cannot be empty.`);
      skippedRows += 1;
      continue;
    }

    const purchasePriceParsed = parseNumber(row.purchasePriceCnyRaw);
    const weightParsed = parseNumber(row.weightRaw);
    const b2bSeParsed = parseNumber(row.b2bSeRaw);
    const b2bNoParsed = parseNumber(row.b2bNoRaw);
    const b2bDkParsed = parseNumber(row.b2bDkRaw);
    const b2bFiParsed = parseNumber(row.b2bFiRaw);
    const parseErrors = [
      purchasePriceParsed.error && `Purchase Price CNY (${purchasePriceParsed.error})`,
      weightParsed.error && `Weight KG (${weightParsed.error})`,
      b2bSeParsed.error && `B2B SE (${b2bSeParsed.error})`,
      b2bNoParsed.error && `B2B NO (${b2bNoParsed.error})`,
      b2bDkParsed.error && `B2B DK (${b2bDkParsed.error})`,
      b2bFiParsed.error && `B2B FI (${b2bFiParsed.error})`,
    ].filter(Boolean);
    if (parseErrors.length > 0) {
      errors.push(`Row ${row.rowNumber}: ${parseErrors.join("; ")}`);
      skippedRows += 1;
      continue;
    }

    const nowIso = new Date().toISOString();
    const oldSku = toNullableText(variant.sku);
    let nextVariantImage = toNullableText(row.variantImage);
    let didRenameImage = false;
    if (nextVariantImage && oldSku && oldSku !== nextSku) {
      try {
        const renamed = await maybeRenameImageForSku({
          imageFolder: product.image_folder,
          imageFilename: nextVariantImage,
          oldSku,
          newSku: nextSku,
        });
        if (renamed.filename) {
          if (renamed.renamed) {
            await syncCanonicalImageRename({
              adminClient,
              productId: product.id,
              fromFilename: path.basename(nextVariantImage),
              toFilename: path.basename(renamed.filename),
              userId,
              nowIso,
            });
          }
          nextVariantImage = renamed.filename;
          didRenameImage = renamed.renamed;
        }
      } catch (error) {
        errors.push(
          `Row ${row.rowNumber}: ${(error as Error).message || "Unable to rename variant image."}`
        );
        skippedRows += 1;
        continue;
      }
    }

    const variantPatch = {
      sku: nextSku,
      option1: row.option1,
      option2: row.option2,
      option3: row.option3,
      option4: row.option4,
      option_combined_zh: row.optionCombinedZh,
      option1_zh: row.option1Zh,
      option2_zh: row.option2Zh,
      option3_zh: row.option3Zh,
      option4_zh: row.option4Zh,
      short_title_zh: row.shortTitleZh,
      variation_amount_se: row.variationAmountSe,
      variation_color_se: row.variationColorSe,
      variation_size_se: row.variationSizeSe,
      variation_other_se: row.variationOtherSe,
      variant_image_url: nextVariantImage,
      purchase_price_cny: purchasePriceParsed.value,
      weight: weightParsed.value,
      b2b_dropship_price_se: b2bSeParsed.value,
      b2b_dropship_price_no: b2bNoParsed.value,
      b2b_dropship_price_dk: b2bDkParsed.value,
      b2b_dropship_price_fi: b2bFiParsed.value,
      supplier_name: row.supplierName,
      supplier_location: row.supplierLocation,
      shipping_name_en: row.shippingNameEn,
      shipping_name_zh: row.shippingNameZh,
      shipping_class: row.shippingClass,
      updated_at: nowIso,
    };

    const { error: variantUpdateError } = await adminClient
      .from("catalog_variants")
      .update(variantPatch)
      .eq("id", variant.id);
    if (variantUpdateError) {
      errors.push(`Row ${row.rowNumber}: ${variantUpdateError.message}`);
      skippedRows += 1;
      continue;
    }

    try {
      await upsertB2BPrice({
        adminClient,
        variantId: variant.id,
        market: "SE",
        value: b2bSeParsed.value,
        nowIso,
      });
      await upsertB2BPrice({
        adminClient,
        variantId: variant.id,
        market: "NO",
        value: b2bNoParsed.value,
        nowIso,
      });
      await upsertB2BPrice({
        adminClient,
        variantId: variant.id,
        market: "DK",
        value: b2bDkParsed.value,
        nowIso,
      });
      await upsertB2BPrice({
        adminClient,
        variantId: variant.id,
        market: "FI",
        value: b2bFiParsed.value,
        nowIso,
      });
    } catch (error) {
      errors.push(
        `Row ${row.rowNumber}: failed to update market prices (${(error as Error).message}).`
      );
    }

    updatedRows += 1;
    if (oldSku && oldSku !== nextSku) skuRenamed += 1;
    if (didRenameImage) variantImagesRenamed += 1;
    if (product.spu) touchedSpus.add(product.spu);

    if (oldSku) variantBySku.delete(oldSku);
    variant.sku = nextSku;
    variant.variant_image_url = nextVariantImage;
    variantBySku.set(nextSku, variant);
    variantById.set(variant.id, variant);

    productIntents.set(product.id, {
      supplierLink: row.supplierLink,
      subtitle: row.subtitle,
      spu: product.spu,
      metas: {
        short_title: row.shortTitle,
        long_title: row.longTitle,
        subtitle: row.subtitle,
        description_short: row.descriptionShort,
        description_extended: row.descriptionExtended,
        bullets_short: row.bulletsShort,
        bullets: row.bullets,
        bullets_long: row.bulletsLong,
        specs: row.specsRaw,
      },
    });
  }

  for (const [productId, intent] of productIntents.entries()) {
    const nowIso = new Date().toISOString();
    const { error: productError } = await adminClient
      .from("catalog_products")
      .update({
        supplier_1688_url: intent.supplierLink,
        subtitle: intent.subtitle,
        updated_at: nowIso,
      })
      .eq("id", productId);
    if (productError) {
      errors.push(`Product ${productId}: ${productError.message}`);
      continue;
    }

    let productMetaError = false;
    for (const key of PRODUCT_META_KEYS) {
      const definitionIds = definitionIdsByKey.get(key) ?? [];
      if (definitionIds.length === 0) continue;
      const preferredDefinitionId = preferredDefinitionByKey.get(key);
      if (!preferredDefinitionId) continue;

      const { error: deleteError } = await adminClient
        .from("metafield_values")
        .delete()
        .eq("target_type", "product")
        .eq("target_id", productId)
        .in("definition_id", definitionIds);
      if (deleteError) {
        errors.push(`Product ${productId}: unable to clear ${key} (${deleteError.message}).`);
        productMetaError = true;
        continue;
      }

      const valueText = intent.metas[key];
      if (!valueText) continue;

      const { error: insertError } = await adminClient
        .from("metafield_values")
        .insert({
          definition_id: preferredDefinitionId,
          target_type: "product",
          target_id: productId,
          scope_of_value: "catalog",
          shop_id: null,
          value_text: valueText,
          value_number: null,
          value_json: null,
          value: null,
        });
      if (insertError) {
        errors.push(`Product ${productId}: unable to save ${key} (${insertError.message}).`);
        productMetaError = true;
      }
    }

    if (!productMetaError) {
      productRowsUpdated += 1;
      if (intent.spu) touchedSpus.add(intent.spu);
    }
  }

  try {
    const spus = Array.from(touchedSpus).filter(Boolean);
    if (spus.length > 0) {
      const meiliResult = await runMeiliIndexSpus(spus);
      if (!meiliResult.ok) {
        errors.push(`Meili reindex warning: ${meiliResult.error}`);
      }
    }
  } catch (error) {
    errors.push(`Meili reindex warning: ${(error as Error).message}`);
  }

  return NextResponse.json({
    inputRows: rows.length,
    updatedRows,
    skippedRows,
    productRowsUpdated,
    skuRenamed,
    variantImagesRenamed,
    errors,
    storedPath,
  });
}
