import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "export_template_digideal.xlsx"
);
const EXPORT_DIR = path.join(process.cwd(), "exports", "digideal");
const IMAGE_ZIP_BASE = "http://resources.gadgetbay.com/images/zip";

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

type OptionBucket = {
  amount: string;
  color: string;
  size: string;
  other: string;
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
  } catch {
    requestedName = "";
    listId = null;
  }

  const allowedMarkets = new Set(["SE", "NO", "DK", "FI"]);
  if (!allowedMarkets.has(requestedMarket)) {
    return NextResponse.json({ error: "Unsupported market." }, { status: 400 });
  }
  if (!activeMarkets.includes(requestedMarket)) {
    return NextResponse.json(
      { error: `${requestedMarket} market is not enabled for this user.` },
      { status: 403 }
    );
  }

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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > 1) {
      sheet.spliceRows(2, sheet.rowCount - 1);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="digideal_export.xlsx"',
      },
    });
  }

  let productQuery = supabase
    .from("catalog_products")
    .select(
      "id, spu, title, subtitle, description_html, option1_name, option2_name, option3_name, nordic_partner_enabled"
    )
    .in("id", productIds);

  if (!isAdmin) {
    productQuery = productQuery.eq("nordic_partner_enabled", true);
  }

  const { data: products, error: productError } = await productQuery;

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const { data: variants, error: variantError } = await supabase
    .from("catalog_variants")
    .select(
      "id, product_id, sku, option1, option2, option3, variation_color_se, variation_size_se, variation_other_se, variation_amount_se, b2b_dropship_price_se, b2b_dropship_price_no, b2b_dropship_price_dk, b2b_dropship_price_fi"
    )
    .in("product_id", productIds)
    .order("sku", { ascending: true });

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const variantIds = variants?.map((variant) => variant.id).filter(Boolean) ?? [];
  const variantPriceRows = new Map<
    string,
    Map<string, Map<string, number | null>>
  >();

  if (variantIds.length > 0) {
    const { data: priceRows } = await supabase
      .from("catalog_variant_prices")
      .select("catalog_variant_id, market, currency, price, price_type")
      .in("catalog_variant_id", variantIds)
      .eq("market", requestedMarket)
      .in("price_type", ["b2b_fixed", "b2b_calc", "b2b_dropship"])
      .is("deleted_at", null);

    priceRows?.forEach((row) => {
      const variantId = row.catalog_variant_id;
      if (!variantId) return;
      const type = String(row.price_type || "b2b_dropship");
      const entry = variantPriceRows.get(variantId) ?? new Map();
      const typeEntry = entry.get(type) ?? new Map<string, number | null>();
      const market = row.market?.toUpperCase();
      if (market) {
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
    fallback: number | null | undefined
  ) => {
    const entry = variantPriceRows.get(variantId);
    if (!entry) return fallback ?? null;
    const readPrice = (type: string) => entry.get(type)?.get(requestedMarket);
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

  const rows: Array<Array<string | number>> = [];

  (products ?? []).forEach((product) => {
    const productVariants = variantsByProduct.get(product.id) ?? [];
    const descriptionShort = pickMetaValue(product.id, "description_short");
    const descriptionExtended = pickMetaValue(product.id, "description_extended");
    const shortTitle = pickMetaValue(product.id, "short_title");
    const longTitle = pickMetaValue(product.id, "long_title");
    const subtitle =
      pickMetaValue(product.id, "subtitle") ??
      pickMetaValue(product.id, "subtitle_sv") ??
      product.subtitle ??
      "";
    const bullets =
      pickMetaValue(product.id, "bullets") ??
      pickMetaValue(product.id, "bullets_long") ??
      pickMetaValue(product.id, "bullets_short") ??
      "";
    const specs = pickMetaValue(product.id, "specs") ?? "";

    const longDescription = normalizeHtml(product.description_html ?? "");
    const mainDescription = longDescription || descriptionShort || "";
    const descriptionCell =
      mainDescription && descriptionExtended
        ? `${mainDescription}\n\n${descriptionExtended}`
        : mainDescription || descriptionExtended || "";

    const bulletList = formatBulletList(splitList(bullets));
    const specsList = formatBulletList(splitList(specs));

    const nameSe = shortTitle ?? product.title ?? product.spu;
    const longTitleSe = longTitle ?? product.title ?? product.spu;

    const variantsToExport =
      productVariants.length > 0
        ? productVariants
        : [
            {
              sku: product.spu,
              option1: null,
              option2: null,
              option3: null,
              variation_color_se: null,
              variation_size_se: null,
              variation_other_se: null,
              variation_amount_se: null,
              b2b_dropship_price_se: null,
              b2b_dropship_price_no: null,
              b2b_dropship_price_dk: null,
              b2b_dropship_price_fi: null,
              id: "",
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
      const fallbackPrice =
        requestedMarket === "SE"
          ? variant.b2b_dropship_price_se
          : requestedMarket === "NO"
            ? variant.b2b_dropship_price_no
            : requestedMarket === "DK"
              ? variant.b2b_dropship_price_dk
              : variant.b2b_dropship_price_fi;
      const b2bPrice = variant.id
        ? resolveMarketPrice(variant.id, fallbackPrice)
        : fallbackPrice;

      rows.push([
        product.spu,
        variant.sku ?? product.spu,
        nameSe,
        variantName,
        amountFormatted,
        bucket.color,
        bucket.size,
        bucket.other,
        combinedText,
        longTitleSe,
        subtitle,
        bulletList,
        descriptionCell,
        specsList,
        b2bPrice ?? "",
        1000,
        `${IMAGE_ZIP_BASE}/${product.spu}.zip`,
      ]);
    });
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.worksheets[0];
  const templateRow = sheet.getRow(2);

  if (rows.length === 0) {
    if (sheet.rowCount > 1) {
      sheet.spliceRows(2, sheet.rowCount - 1);
    }
  } else {
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
  }

  const buffer = await workbook.xlsx.writeBuffer();
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const timestamp = formatTimestamp();
  const filename = `digideal_${sanitizeFilePart(
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
        template: "digideal",
        export_name: exportName,
        market: requestedMarket,
        product_count: productIds.length,
        row_count: rows.length,
        spu_count: productIds.length,
        sku_count: rows.length,
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
