import ExcelJS from "exceljs";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDealsProvider } from "@/lib/deals/provider";

type ExportItem = {
  product_id: string;
  listing_title?: string | null;
  title_h1?: string | null;
  google_taxonomy_path?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  seller_name?: string | null;
  sold_today?: number | null;
  sold_7d?: number | null;
  sold_all_time?: number | null;
  last_price?: number | null;
  shipping_cost?: number | null;
  last_original_price?: number | null;
  last_discount_percent?: number | null;
  last_you_save_kr?: number | null;
  status?: string | null;
  product_url?: string | null;
  supplier_url?: string | null;
  weight_grams?: number | null;
  weight_kg?: number | null;
  purchase_price?: number | null;
  estimated_rerun_price?: number | null;
  shipping_class?: string | null;
  displayed_price?: number | null;
  estimated_total_cost?: number | null;
  margin_percent?: number | null;
  margin_kr?: number | null;
  primary_image_url?: string | null;
  image_urls?: string[] | null;
};

const MAX_IMAGE_WIDTH_PX = 150;
const MAX_IMAGE_HEIGHT_PX = 75;
const ROW_HEIGHT_POINTS = 56.25; // 75 px at 96 dpi

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const asNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? Number(n) : null;
};

const pickImageUrl = (item: ExportItem) => {
  const primary = asString(item.primary_image_url);
  if (primary) return primary;
  if (Array.isArray(item.image_urls)) {
    for (const entry of item.image_urls) {
      const url = asString(entry);
      if (url) return url;
    }
  }
  return "";
};

const formatDateTime = (value: string | null | undefined) => {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
  return raw;
};

const sanitizeFilenamePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "digideal";

const formatTimestamp = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const renderImageCell = async (
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  imageUrl: string
) => {
  if (!imageUrl) return;
  try {
    const response = await fetch(imageUrl, { redirect: "follow" });
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    const src = Buffer.from(arrayBuffer);
    if (!src.length) return;

    const fitted = await sharp(src)
      .resize({
        width: MAX_IMAGE_WIDTH_PX,
        height: MAX_IMAGE_HEIGHT_PX,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: true,
      })
      .png({ quality: 92 })
      .toBuffer();

    const imageId = workbook.addImage({
      base64: `data:image/png;base64,${fitted.toString("base64")}`,
      extension: "png",
    });

    sheet.addImage(imageId, {
      tl: { col: 0, row: rowIndex - 1 },
      ext: { width: MAX_IMAGE_WIDTH_PX, height: MAX_IMAGE_HEIGHT_PX },
      editAs: "oneCell",
    });
  } catch {
    // Image embedding is best-effort only.
  }
};

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: unknown; name?: string; provider?: string } = {};
  try {
    const parsed = (await request.json()) as {
      items?: unknown;
      name?: string;
      provider?: string;
    } | null;
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    body = {};
  }
  const provider = resolveDealsProvider(
    body.provider ?? requestUrl.searchParams.get("provider")
  );

  const source = Array.isArray(body.items) ? body.items : [];
  const normalized: ExportItem[] = [];
  for (const entry of source) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const productId = asString(row.product_id);
    if (!productId) continue;
    normalized.push({
      product_id: productId,
      listing_title: asString(row.listing_title) || null,
      title_h1: asString(row.title_h1) || null,
      google_taxonomy_path: asString(row.google_taxonomy_path) || null,
      first_seen_at: asString(row.first_seen_at) || null,
      last_seen_at: asString(row.last_seen_at) || null,
      seller_name: asString(row.seller_name) || null,
      sold_today: asNumber(row.sold_today),
      sold_7d: asNumber(row.sold_7d),
      sold_all_time: asNumber(row.sold_all_time),
      last_price: asNumber(row.last_price),
      shipping_cost: asNumber(row.shipping_cost),
      last_original_price: asNumber(row.last_original_price),
      last_discount_percent: asNumber(row.last_discount_percent),
      last_you_save_kr: asNumber(row.last_you_save_kr),
      status: asString(row.status) || null,
      product_url: asString(row.product_url) || null,
      supplier_url: asString(row.supplier_url) || null,
      weight_grams: asNumber(row.weight_grams),
      weight_kg: asNumber(row.weight_kg),
      purchase_price: asNumber(row.purchase_price),
      estimated_rerun_price: asNumber(row.estimated_rerun_price),
      shipping_class: asString(row.shipping_class) || null,
      displayed_price: asNumber(row.displayed_price),
      estimated_total_cost: asNumber(row.estimated_total_cost),
      margin_percent: asNumber(row.margin_percent),
      margin_kr: asNumber(row.margin_kr),
      primary_image_url: asString(row.primary_image_url) || null,
      image_urls: Array.isArray(row.image_urls)
        ? row.image_urls.map((v) => asString(v)).filter(Boolean)
        : null,
    });
  }

  if (normalized.length === 0) {
    return NextResponse.json({ error: "No selected rows to export." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const exportSheetName =
    provider === "letsdeal"
      ? "LetsDeal Export"
      : provider === "offerilla"
        ? "Offerilla Export"
        : "DigiDeal Export";
  const sheet = workbook.addWorksheet(
    exportSheetName,
    {
    views: [{ state: "frozen", ySplit: 1 }],
    }
  );

  sheet.columns = [
    { header: "Image", key: "image", width: 24 },
    { header: "Title", key: "title", width: 44 },
    { header: "ID", key: "id", width: 16 },
    { header: "Google Category", key: "google_category", width: 40 },
    { header: "First Seen", key: "first_seen", width: 20 },
    { header: "Last Seen", key: "last_seen", width: 20 },
    { header: "Seller", key: "seller", width: 22 },
    { header: "Sales 1D", key: "sales_1d", width: 12 },
    { header: "Sales 7D", key: "sales_7d", width: 12 },
    { header: "Sales Total", key: "sales_total", width: 12 },
    { header: "Price", key: "price", width: 12 },
    { header: "Shipping", key: "shipping", width: 12 },
    { header: "Strike Price", key: "strike_price", width: 13 },
    { header: "Discount %", key: "discount", width: 12 },
    { header: "You Save", key: "you_save", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Product Link", key: "product_link", width: 46 },
    { header: "Product Data Link", key: "product_data_link", width: 46 },
    { header: "Supplier Link", key: "supplier_link", width: 46 },
    { header: "Supplier Weight (g)", key: "supplier_weight_g", width: 18 },
    { header: "Purchase Price (RMB)", key: "purchase_price", width: 20 },
    { header: "Calculated Rerun Price", key: "rerun_price", width: 22 },
    { header: "Shipping Class", key: "shipping_class", width: 16 },
    { header: "Displayed Price (SEK)", key: "displayed_price", width: 20 },
    { header: "Estimated Total Cost (SEK)", key: "estimated_total_cost", width: 24 },
    { header: "Expected Profit (SEK)", key: "expected_profit_kr", width: 20 },
    { header: "Expected Profit (%)", key: "expected_profit_percent", width: 20 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 24;

  const origin = requestUrl.origin;

  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const rowIndex = i + 2;
    const title = item.listing_title || item.title_h1 || item.product_id;
    const productDataLink = `${origin}/api/digideal/analysis?provider=${encodeURIComponent(
      provider
    )}&product_id=${encodeURIComponent(item.product_id)}`;

    sheet.addRow({
      image: "",
      title,
      id: item.product_id,
      google_category: item.google_taxonomy_path || "",
      first_seen: formatDateTime(item.first_seen_at),
      last_seen: formatDateTime(item.last_seen_at),
      seller: item.seller_name || "",
      sales_1d: item.sold_today ?? "",
      sales_7d: item.sold_7d ?? "",
      sales_total: item.sold_all_time ?? "",
      price: item.last_price ?? "",
      shipping: item.shipping_cost ?? "",
      strike_price: item.last_original_price ?? "",
      discount: item.last_discount_percent ?? "",
      you_save: item.last_you_save_kr ?? "",
      status: item.status || "",
      product_link: item.product_url || "",
      product_data_link: productDataLink,
      supplier_link: item.supplier_url || "",
      supplier_weight_g:
        item.weight_grams ??
        (item.weight_kg !== null && item.weight_kg !== undefined
          ? Math.round(item.weight_kg * 1000)
          : ""),
      purchase_price: item.purchase_price ?? "",
      rerun_price: item.estimated_rerun_price ?? "",
      shipping_class: item.shipping_class || "",
      displayed_price: item.displayed_price ?? "",
      estimated_total_cost: item.estimated_total_cost ?? "",
      expected_profit_kr: item.margin_kr ?? "",
      expected_profit_percent: item.margin_percent ?? "",
    });

    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    row.alignment = { vertical: "middle", wrapText: true };

    const productLinkCell = sheet.getCell(`Q${rowIndex}`);
    if (item.product_url) {
      productLinkCell.value = { text: item.product_url, hyperlink: item.product_url };
      productLinkCell.font = { color: { argb: "FF1F5FBF" }, underline: true };
    }

    const productDataCell = sheet.getCell(`R${rowIndex}`);
    productDataCell.value = { text: productDataLink, hyperlink: productDataLink };
    productDataCell.font = { color: { argb: "FF1F5FBF" }, underline: true };

    const supplierCell = sheet.getCell(`S${rowIndex}`);
    if (item.supplier_url) {
      supplierCell.value = { text: item.supplier_url, hyperlink: item.supplier_url };
      supplierCell.font = { color: { argb: "FF1F5FBF" }, underline: true };
    }

    await renderImageCell(workbook, sheet, rowIndex, pickImageUrl(item));
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  const fileLabel = sanitizeFilenamePart(
    asString(body.name) || `${provider}-deals-selected`
  );
  const filename = `${fileLabel}_${formatTimestamp()}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
