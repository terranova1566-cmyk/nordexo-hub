import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { spawn } from "child_process";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { buildPublicUrl } from "@/lib/public-files";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "export_template_digideal.xlsx"
);
const EXPORT_DIR = path.join(process.cwd(), "exports", "digideal");
const DIGIDEAL_STANDARD_ZIP_PREFIX = "digideal-standard-images";

const PRODUCT_META_KEYS = [
  "description_short",
  "description_extended",
  "short_title",
  "long_title",
  "subtitle",
  "subtitle_sv",
  "bullets_short",
  "bullets",
  "bullets_long",
  "specs",
];
const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
const B2B_MARKETS = ["SE", "NO", "DK", "FI"] as const;
const ALL_DATA_HEADERS = [
  "SPU",
  "SKU",
  "Original SKU",
  "Product ID",
  "Variant ID",
  "Name SE",
  "Variant Name",
  "Amount SE",
  "Color SE",
  "Size SE",
  "Other SE",
  "Combined Text",
  "Long Title SE",
  "Subtitle SE",
  "Bullets (Partner)",
  "Description (Partner)",
  "Specs (Partner)",
  "B2B Price",
  "MOQ",
  "Images ZIP",
  "Supplier Link",
  "Purchase Price CNY",
  "Weight KG",
  "Option1 ZH",
  "Option2 ZH",
  "Option3 ZH",
  "Option4 ZH",
  "Option Combined ZH",
  "Short Title ZH",
  "Option1",
  "Option2",
  "Option3",
  "Option4",
  "Variant Image",
  "B2B SE",
  "B2B NO",
  "B2B DK",
  "B2B FI",
  "Description Short",
  "Description Extended",
  "Bullets Short",
  "Bullets",
  "Bullets Long",
  "Specs Raw",
  "Short Title",
  "Long Title",
  "Subtitle",
  "Supplier Name",
  "Supplier Location",
  "Shipping Name EN",
  "Shipping Name ZH",
  "Shipping Class",
] as const;

type B2BMarket = (typeof B2B_MARKETS)[number];
type ExportDataset = "partner" | "all";
type StandardImageZipJobEntry = {
  spu: string;
  imageFolder: string | null;
  token: string;
  relativePath: string;
  originalName: string;
  createdBy: string | null;
};
type OptionBucket = {
  amount: string;
  color: string;
  size: string;
  other: string;
};
type ExportCell = string | number;

const normalizeHtml = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitList = (value?: string | null) =>
  value
    ? value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const formatBulletList = (items: string[]) =>
  items.length ? items.map((item) => `- ${item}`).join("\n") : "";

const formatAmount = (value?: string | null) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/pack/i.test(trimmed)) return trimmed;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}-packs`;
  return trimmed;
};

const sanitizeFilePart = (value: string) => {
  const sanitized = value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "export";
};

const formatTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const normalizeDataset = (value: unknown): ExportDataset => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "all" || normalized === "full") return "all";
  return "partner";
};

const normalizeSpu = (value: unknown) => String(value ?? "").trim().toUpperCase();

const sanitizeSpuSegment = (spu: string) => {
  const sanitized = normalizeSpu(spu)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
};

const buildStandardImageZipToken = (spu: string) =>
  `${DIGIDEAL_STANDARD_ZIP_PREFIX}-${sanitizeSpuSegment(spu)}-v1`;

const buildStandardImageZipRelativePath = (spu: string) =>
  path.posix.join(
    "partner-images",
    "digideal",
    sanitizeSpuSegment(spu),
    "standard-images.zip"
  );

const queueStandardImageZipRefresh = (entries: StandardImageZipJobEntry[]) => {
  if (entries.length === 0) return;
  void (async () => {
    try {
      const payloadPath = path.join(
        "/tmp",
        `digideal-standard-zips-${Date.now()}-${randomUUID().slice(0, 8)}.json`
      );
      await fs.writeFile(payloadPath, JSON.stringify({ entries }), "utf8");

      const scriptPath = path.join(
        process.cwd(),
        "scripts",
        "refresh-digideal-standard-image-zips.mjs"
      );

      const child = spawn(process.execPath, [scriptPath, "--payload", payloadPath], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
    } catch {
      // keep export flow resilient
    }
  })();
};

const buildPartnerWorkbook = async (rows: ExportCell[][]) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.worksheets[0];
  const templateRow = sheet.getRow(2);

  if (rows.length === 0) {
    if (sheet.rowCount > 1) {
      sheet.spliceRows(2, sheet.rowCount - 1);
    }
    return workbook.xlsx.writeBuffer();
  }

  templateRow.values = rows[0];
  for (let i = 1; i < rows.length; i += 1) {
    const inserted = sheet.insertRow(2 + i, rows[i]);
    inserted.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const styleCell = templateRow.getCell(colNumber);
      cell.style = { ...styleCell.style };
      cell.numFmt = styleCell.numFmt;
    });
  }

  const expectedRows = 1 + rows.length;
  if (sheet.rowCount > expectedRows) {
    sheet.spliceRows(expectedRows + 1, sheet.rowCount - expectedRows);
  }

  return workbook.xlsx.writeBuffer();
};

const buildAllDataWorkbook = async (rows: ExportCell[][]) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("All Data");
  sheet.addRow([...ALL_DATA_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = ALL_DATA_HEADERS.map(() => ({ width: 20 }));
  return workbook.xlsx.writeBuffer();
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userSettings } = await supabase
    .from("partner_user_settings")
    .select("active_markets, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const activeMarkets = (
    userSettings?.active_markets && userSettings.active_markets.length > 0
      ? userSettings.active_markets
      : ["SE"]
  ).map((market: string) => market.toUpperCase());
  const isAdmin = Boolean(userSettings?.is_admin);

  let requestedName = "";
  let listId: string | null = null;
  let requestedMarket = "SE";
  let dataset: ExportDataset = "partner";
  try {
    const body = await request.json();
    if (body?.name) {
      requestedName = String(body.name).trim();
    }
    if (body?.listId) {
      listId = String(body.listId).trim() || null;
    }
    if (body?.market) {
      requestedMarket = String(body.market).trim().toUpperCase() || "SE";
    }
    if (body?.dataset !== undefined) {
      dataset = normalizeDataset(body.dataset);
    }
  } catch {
    requestedName = "";
    listId = null;
    dataset = "partner";
  }

  if (!isAdmin && dataset === "all") {
    dataset = "partner";
  }

  const allowedMarkets = new Set(B2B_MARKETS);
  if (!allowedMarkets.has(requestedMarket as B2BMarket)) {
    return NextResponse.json({ error: "Unsupported market." }, { status: 400 });
  }
  if (!activeMarkets.includes(requestedMarket)) {
    return NextResponse.json(
      { error: `${requestedMarket} market is not enabled for this user.` },
      { status: 403 }
    );
  }
  const requestedMarketTyped = requestedMarket as B2BMarket;

  const emailPrefix = user.email?.split("@")[0] ?? "export";
  const defaultName = `${emailPrefix} products ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const exportName = requestedName || defaultName;

  let listName: string | null = null;
  let productIds: string[] = [];

  if (listId) {
    const { data: listRow, error: listError } = await supabase
      .from("product_manager_wishlists")
      .select("id, name")
      .eq("id", listId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!listRow) {
      return NextResponse.json({ error: "List not found." }, { status: 404 });
    }

    listName = listRow.name ?? null;

    const { data: listItems, error: listItemsError } = await supabase
      .from("product_manager_wishlist_items")
      .select("product_id")
      .eq("wishlist_id", listId);

    if (listItemsError) {
      return NextResponse.json({ error: listItemsError.message }, { status: 500 });
    }

    productIds = (listItems ?? [])
      .map((row) => row.product_id)
      .filter(Boolean) as string[];
  } else {
    const { data: savedRows, error: savedError } = await supabase
      .from("partner_saved_products")
      .select("product_id")
      .eq("user_id", user.id);

    if (savedError) {
      return NextResponse.json({ error: savedError.message }, { status: 500 });
    }

    productIds = (savedRows ?? []).map((row) => row.product_id);
  }

  productIds = Array.from(new Set(productIds));
  if (productIds.length === 0) {
    const buffer =
      dataset === "all"
        ? await buildAllDataWorkbook([])
        : await buildPartnerWorkbook([]);
    const emptyFileName =
      dataset === "all" ? "digideal_export_all.xlsx" : "digideal_export.xlsx";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${emptyFileName}"`,
      },
    });
  }

  let productQuery = supabase
    .from("catalog_products")
    .select(
      "id, spu, title, subtitle, description_html, supplier_1688_url, image_folder, option1_name, option2_name, option3_name, option4_name, nordic_partner_enabled"
    )
    .in("id", productIds);

  if (!isAdmin) {
    productQuery = productQuery.eq("nordic_partner_enabled", true);
  }

  const { data: products, error: productError } = await productQuery;

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const standardZipBySpu = new Map<string, string>();
  const standardZipJobs: StandardImageZipJobEntry[] = [];

  (products ?? []).forEach((product) => {
    const normalizedSpu = normalizeSpu(product.spu);
    if (!normalizedSpu || standardZipBySpu.has(normalizedSpu)) return;
    const token = buildStandardImageZipToken(normalizedSpu);
    const relativePath = buildStandardImageZipRelativePath(normalizedSpu);
    standardZipBySpu.set(normalizedSpu, buildPublicUrl(token));
    standardZipJobs.push({
      spu: normalizedSpu,
      imageFolder: product.image_folder ?? null,
      token,
      relativePath,
      originalName: `${normalizedSpu}-standard-images.zip`,
      createdBy: user.id ?? null,
    });
  });

  queueStandardImageZipRefresh(standardZipJobs);

  const { data: variants, error: variantError } = await supabase
    .from("catalog_variants")
    .select(
      "id, product_id, sku, option1, option2, option3, option4, option_combined_zh, option1_zh, option2_zh, option3_zh, option4_zh, short_title_zh, variation_color_se, variation_size_se, variation_other_se, variation_amount_se, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi, purchase_price_cny, weight, variant_image_url, supplier_name, supplier_location, shipping_name_en, shipping_name_zh, shipping_class"
    )
    .in("product_id", productIds)
    .order("sku", { ascending: true });

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const variantIds = variants?.map((variant) => variant.id).filter(Boolean) ?? [];
  const variantPriceRows = new Map<string, Map<string, Map<string, number | null>>>();

  if (variantIds.length > 0) {
    const { data: priceRows } = await supabase
      .from("catalog_variant_prices")
      .select("catalog_variant_id, market, price, price_type")
      .in("catalog_variant_id", variantIds)
      .in("market", [...B2B_MARKETS])
      .in("price_type", ["b2b_fixed", "b2b_calc", "b2b_dropship"])
      .is("deleted_at", null);

    priceRows?.forEach((row) => {
      const variantId = row.catalog_variant_id;
      if (!variantId) return;
      const type = String(row.price_type || "b2b_dropship");
      const entry = variantPriceRows.get(variantId) ?? new Map();
      const typeEntry = entry.get(type) ?? new Map<string, number | null>();
      const market = row.market?.toUpperCase();
      if (market && allowedMarkets.has(market as B2BMarket)) {
        let priceValue: number | null = null;
        if (row.price !== null && row.price !== undefined) {
          const numeric = Number(row.price);
          if (Number.isFinite(numeric)) {
            priceValue = numeric;
          }
        }
        typeEntry.set(market, priceValue);
      }
      entry.set(type, typeEntry);
      variantPriceRows.set(variantId, entry);
    });
  }

  const resolveMarketPrice = (
    variantId: string,
    market: B2BMarket,
    fallback: number | null | undefined
  ) => {
    const entry = variantPriceRows.get(variantId);
    if (!entry) return fallback ?? null;
    const readPrice = (type: string) => entry.get(type)?.get(market);
    const fixed = readPrice("b2b_fixed") ?? readPrice("b2b_dropship");
    if (fixed !== undefined && fixed !== null) return fixed;
    const calc = readPrice("b2b_calc");
    if (calc !== undefined && calc !== null) return calc;
    return fallback ?? null;
  };

  const { data: metaDefs } = await supabase
    .from("metafield_definitions")
    .select("id, key, namespace")
    .eq("resource", "catalog_product")
    .in("key", PRODUCT_META_KEYS)
    .in("namespace", PRODUCT_META_NAMESPACES);

  const metaDefMap = new Map(metaDefs?.map((def) => [def.id, def]) ?? []);
  const metaDefIds = Array.from(metaDefMap.keys());
  const metaValuesByProduct = new Map<string, Map<string, Map<string, string>>>();

  if (metaDefIds.length > 0) {
    const { data: metaValues } = await supabase
      .from("metafield_values")
      .select(
        "definition_id, value_text, value, value_number, value_json, target_id"
      )
      .eq("target_type", "product")
      .in("definition_id", metaDefIds)
      .in("target_id", productIds);

    metaValues?.forEach((row) => {
      const def = metaDefMap.get(row.definition_id);
      if (!def) return;
      let text: string | null = null;
      if (row.value_text) {
        text = row.value_text;
      } else if (row.value_number !== null && row.value_number !== undefined) {
        text = String(row.value_number);
      } else if (Array.isArray(row.value_json)) {
        text = row.value_json.map(String).join("\n");
      } else if (row.value_json !== null && row.value_json !== undefined) {
        text = JSON.stringify(row.value_json);
      } else if (typeof row.value === "string") {
        text = row.value;
      } else if (row.value != null) {
        text = JSON.stringify(row.value);
      }

      if (!text) return;
      const key = def.key;
      const namespace = def.namespace ?? "";
      const byKey =
        metaValuesByProduct.get(row.target_id) ?? new Map<string, Map<string, string>>();
      const byNamespace = byKey.get(key) ?? new Map<string, string>();
      byNamespace.set(namespace, text);
      byKey.set(key, byNamespace);
      metaValuesByProduct.set(row.target_id, byKey);
    });
  }

  const pickMetaValue = (productId: string, key: string) => {
    const byKey = metaValuesByProduct.get(productId);
    if (!byKey) return null;
    const byNamespace = byKey.get(key);
    if (!byNamespace) return null;
    for (const namespace of PRODUCT_META_NAMESPACES) {
      const value = byNamespace.get(namespace);
      if (value) return value;
    }
    return null;
  };

  const variantsByProduct = new Map<string, typeof variants>();
  (variants ?? []).forEach((variant) => {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  });

  const partnerRows: ExportCell[][] = [];
  const allRows: ExportCell[][] = [];

  (products ?? []).forEach((product) => {
    const normalizedSpu = normalizeSpu(product.spu);
    const imageZipUrl = normalizedSpu ? (standardZipBySpu.get(normalizedSpu) ?? "") : "";
    const productVariants = variantsByProduct.get(product.id) ?? [];
    const descriptionShortRaw = pickMetaValue(product.id, "description_short") ?? "";
    const descriptionExtendedRaw =
      pickMetaValue(product.id, "description_extended") ?? "";
    const shortTitleRaw = pickMetaValue(product.id, "short_title") ?? "";
    const longTitleRaw = pickMetaValue(product.id, "long_title") ?? "";
    const subtitleRaw =
      pickMetaValue(product.id, "subtitle") ??
      pickMetaValue(product.id, "subtitle_sv") ??
      product.subtitle ??
      "";
    const bulletsShortRaw = pickMetaValue(product.id, "bullets_short") ?? "";
    const bulletsRaw = pickMetaValue(product.id, "bullets") ?? "";
    const bulletsLongRaw = pickMetaValue(product.id, "bullets_long") ?? "";
    const specsRaw = pickMetaValue(product.id, "specs") ?? "";
    const bulletsPartnerRaw = bulletsRaw || bulletsLongRaw || bulletsShortRaw;

    const longDescription = normalizeHtml(product.description_html ?? "");
    const mainDescription = longDescription || descriptionShortRaw || "";
    const descriptionCell =
      mainDescription && descriptionExtendedRaw
        ? `${mainDescription}\n\n${descriptionExtendedRaw}`
        : mainDescription || descriptionExtendedRaw || "";

    const bulletList = formatBulletList(splitList(bulletsPartnerRaw));
    const specsList = formatBulletList(splitList(specsRaw));

    const nameSe = shortTitleRaw || product.title || product.spu || "";
    const longTitleSe = longTitleRaw || product.title || product.spu || "";

    const variantsToExport =
      productVariants.length > 0
        ? productVariants
        : [
            {
              id: "",
              sku: product.spu,
              option1: null,
              option2: null,
              option3: null,
              option4: null,
              option_combined_zh: null,
              option1_zh: null,
              option2_zh: null,
              option3_zh: null,
              option4_zh: null,
              short_title_zh: null,
              variation_color_se: null,
              variation_size_se: null,
              variation_other_se: null,
              variation_amount_se: null,
              b2b_dropship_price_se: null,
              b2b_dropship_price_no: null,
              b2b_dropship_price_dk: null,
              b2b_dropship_price_fi: null,
              purchase_price_cny: null,
              weight: null,
              variant_image_url: null,
              supplier_name: null,
              supplier_location: null,
              shipping_name_en: null,
              shipping_name_zh: null,
              shipping_class: null,
            },
          ];

    variantsToExport.forEach((variant) => {
      const bucket: OptionBucket = {
        amount: variant.variation_amount_se ?? "",
        color: variant.variation_color_se ?? "",
        size: variant.variation_size_se ?? "",
        other: variant.variation_other_se ?? "",
      };
      const amountFormatted = formatAmount(bucket.amount);
      const variantParts = [
        bucket.color,
        bucket.size,
        bucket.other,
        amountFormatted,
      ].filter(Boolean);
      const variantName = variantParts.join("; ");
      const combinedText = variantName ? `${nameSe} - ${variantName}` : nameSe;
      const fallbackByMarket = {
        SE: variant.b2b_dropship_price_se,
        NO: variant.b2b_dropship_price_no,
        DK: variant.b2b_dropship_price_dk,
        FI: variant.b2b_dropship_price_fi,
      };
      const b2bPrice = variant.id
        ? resolveMarketPrice(
            variant.id,
            requestedMarketTyped,
            fallbackByMarket[requestedMarketTyped]
          )
        : fallbackByMarket[requestedMarketTyped];
      const b2bSe = variant.id
        ? resolveMarketPrice(variant.id, "SE", fallbackByMarket.SE)
        : fallbackByMarket.SE;
      const b2bNo = variant.id
        ? resolveMarketPrice(variant.id, "NO", fallbackByMarket.NO)
        : fallbackByMarket.NO;
      const b2bDk = variant.id
        ? resolveMarketPrice(variant.id, "DK", fallbackByMarket.DK)
        : fallbackByMarket.DK;
      const b2bFi = variant.id
        ? resolveMarketPrice(variant.id, "FI", fallbackByMarket.FI)
        : fallbackByMarket.FI;
      const currentSku = variant.sku ?? product.spu ?? "";

      partnerRows.push([
        product.spu ?? "",
        currentSku,
        nameSe,
        variantName,
        amountFormatted,
        bucket.color,
        bucket.size,
        bucket.other,
        combinedText,
        longTitleSe,
        subtitleRaw,
        bulletList,
        descriptionCell,
        specsList,
        b2bPrice ?? "",
        1000,
        imageZipUrl,
      ]);

      allRows.push([
        product.spu ?? "",
        currentSku,
        currentSku,
        product.id,
        variant.id ?? "",
        nameSe,
        variantName,
        amountFormatted,
        bucket.color,
        bucket.size,
        bucket.other,
        combinedText,
        longTitleSe,
        subtitleRaw,
        bulletList,
        descriptionCell,
        specsList,
        b2bPrice ?? "",
        1000,
        imageZipUrl,
        product.supplier_1688_url ?? "",
        variant.purchase_price_cny ?? "",
        variant.weight ?? "",
        variant.option1_zh ?? "",
        variant.option2_zh ?? "",
        variant.option3_zh ?? "",
        variant.option4_zh ?? "",
        variant.option_combined_zh ?? "",
        variant.short_title_zh ?? "",
        variant.option1 ?? "",
        variant.option2 ?? "",
        variant.option3 ?? "",
        variant.option4 ?? "",
        variant.variant_image_url ?? "",
        b2bSe ?? "",
        b2bNo ?? "",
        b2bDk ?? "",
        b2bFi ?? "",
        descriptionShortRaw,
        descriptionExtendedRaw,
        bulletsShortRaw,
        bulletsRaw,
        bulletsLongRaw,
        specsRaw,
        shortTitleRaw,
        longTitleRaw,
        subtitleRaw,
        variant.supplier_name ?? "",
        variant.supplier_location ?? "",
        variant.shipping_name_en ?? "",
        variant.shipping_name_zh ?? "",
        variant.shipping_class ?? "",
      ]);
    });
  });

  const rowsToWrite = dataset === "all" ? allRows : partnerRows;
  const buffer =
    dataset === "all"
      ? await buildAllDataWorkbook(rowsToWrite)
      : await buildPartnerWorkbook(rowsToWrite);

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const timestamp = formatTimestamp();
  const filename = `digideal_${dataset}_${sanitizeFilePart(
    exportName
  )}_${timestamp}_${randomUUID().slice(0, 8)}.xlsx`;
  const storedPath = path.join("digideal", filename);
  const filePath = path.join(EXPORT_DIR, filename);
  await fs.writeFile(filePath, Buffer.from(buffer));

  const { data: exportRow } = await supabase
    .from("partner_exports")
    .insert({
      status: "generated",
      file_path: storedPath,
      meta: {
        template: dataset === "all" ? "digideal_all" : "digideal",
        dataset,
        export_name: exportName,
        market: requestedMarketTyped,
        product_count: productIds.length,
        row_count: rowsToWrite.length,
        spu_count: productIds.length,
        sku_count: rowsToWrite.length,
        list_id: listId,
        list_name: listName,
      },
    })
    .select("id")
    .maybeSingle();

  if (exportRow?.id) {
    const exportItems = productIds.map((productId) => ({
      export_id: exportRow.id,
      product_id: productId,
    }));
    await supabase.from("partner_export_items").insert(exportItems);
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
