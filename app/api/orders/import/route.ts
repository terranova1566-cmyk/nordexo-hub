import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  ORDER_IMPORT_PENDING_HEADERS,
  ORDER_IMPORT_SHIPPED_HEADERS,
} from "@/lib/orders/import-template";
import {
  ORDER_STATUS,
  pickHigherPriorityOrderStatus,
} from "@/lib/orders/status";
import { normalizeOrderPlatformName } from "@/lib/orders/platform";
import { normalizeIncomingSalesChannelId } from "@/lib/orders/sales-channel-id";
import { promises as fs } from "fs";
import path from "path";

const PENDING_HEADERS = [...ORDER_IMPORT_PENDING_HEADERS];
const SHIPPED_HEADERS = [...ORDER_IMPORT_SHIPPED_HEADERS];

type ImportMode = "pending" | "shipped";

type ParsedOrderItem = {
  sales_channel_id: string;
  order_number: string;
  sku: string;
  quantity: number | null;
  sales_value_eur: number | null;
  marketplace_order_number: string;
  sales_channel_order_number: string;
  transaction_date: string | null;
  date_shipped: string | null;
  raw_row: Record<string, string>;
  tracking_number: string;
};

const SHOPIFY_SALES_CHANNEL_IDS = new Set(["TI-SE", "WL-SE", "SK-SE"]);

function isShopifySalesChannelId(value: unknown) {
  const token = String(value ?? "").trim().toUpperCase();
  return SHOPIFY_SALES_CHANNEL_IDS.has(token);
}

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeNumber(value: string) {
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
}

function readCellText(cell: ExcelJS.Cell) {
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
}

function buildItemUniquenessKey(orderId: unknown, sku: unknown) {
  const orderPart = String(orderId ?? "").trim().toLowerCase();
  const skuPart = String(sku ?? "").trim().toLowerCase();
  return `${orderPart}::${skuPart}`;
}

function chunkList<T>(list: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    result.push(list.slice(i, i + size));
  }
  return result;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmdUTC(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
}

function excelSerialToYmd(value: number) {
  const safe = Math.floor(value);
  if (!Number.isFinite(safe) || safe <= 0) return null;
  // Excel date serial base (1900 date system): 1899-12-30
  const baseUtcMs = Date.UTC(1899, 11, 30);
  const utcMs = baseUtcMs + safe * 24 * 60 * 60 * 1000;
  return formatYmdUTC(new Date(utcMs));
}

function normalizeDateForDb(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const isoSlash = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlash) return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;

  const isoTimestamp = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s].*$/);
  if (isoTimestamp) return isoTimestamp[1];

  const serialLike = raw.match(/^-?\d+(?:[.,]\d+)?$/);
  if (serialLike) {
    const numeric = Number(raw.replace(",", "."));
    if (Number.isFinite(numeric) && numeric >= 1 && numeric < 100000) {
      return excelSerialToYmd(numeric);
    }
  }

  return null;
}

function pickTrackingSentDate(
  current: string | null | undefined,
  incoming: string | null
) {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  return incoming > current ? incoming : current;
}

async function hasTrackingSentDateColumn(
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>
) {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "order_tracking_numbers_global")
    .eq("column_name", "sent_date")
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function hasOrdersStatusColumn(
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>
) {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "orders_global")
    .eq("column_name", "status")
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

function detectImportMode(headerMap: Map<string, number>) {
  const hasAll = (headers: string[]) => headers.every((header) => headerMap.has(header));
  if (hasAll(SHIPPED_HEADERS)) {
    return {
      mode: "shipped" as ImportMode,
      headers: SHIPPED_HEADERS,
    };
  }
  if (hasAll(PENDING_HEADERS)) {
    return {
      mode: "pending" as ImportMode,
      headers: PENDING_HEADERS,
    };
  }
  return {
    mode: null,
    headers: [] as string[],
    missingPending: PENDING_HEADERS.filter((header) => !headerMap.has(header)),
    missingShipped: SHIPPED_HEADERS.filter((header) => !headerMap.has(header)),
  };
}

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function buildDbErrorPayload(error: unknown, fallback: string) {
  const dbError = (error ?? {}) as DbError;
  const message = String(dbError.message ?? "").trim();
  const details = String(dbError.details ?? "").trim();
  const hint = String(dbError.hint ?? "").trim();
  const code = String(dbError.code ?? "").trim();
  const resolvedMessage =
    message ||
    details ||
    hint ||
    (code ? `Database error (${code}).` : fallback);

  return {
    error: resolvedMessage,
    code: code || null,
    details: details || null,
    hint: hint || null,
  };
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = (formData.get("file") || formData.get("workbook")) as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing Excel file." }, { status: 400 });
  }

  const uploadRoot = "/srv/incoming-scripts/uploads/orders-imports";
  await fs.mkdir(uploadRoot, { recursive: true });
  const rawName = file.name || "orders-import.xlsx";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedName = `${entryId}-${safeName}`;
  const storedPath = path.join(uploadRoot, storedName);
  const buffer = await file.arrayBuffer();
  await fs.writeFile(storedPath, Buffer.from(buffer));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "No worksheet found." }, { status: 400 });
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const header = readCellText(cell);
    if (header) {
      headerMap.set(header, colNumber);
    }
  });

  const importModeMatch = detectImportMode(headerMap);
  if (!importModeMatch.mode) {
    const missingPending = importModeMatch.missingPending ?? [];
    const missingShipped = importModeMatch.missingShipped ?? [];
    return NextResponse.json(
      {
        error: `Unsupported template. Missing pending headers: ${missingPending.join(
          ", "
        )}. Missing shipped headers: ${missingShipped.join(", ")}.`,
      },
      { status: 400 }
    );
  }
  const importMode = importModeMatch.mode;
  const expectedHeaders = importModeMatch.headers;
  const importedOrderStatus =
    importMode === "pending" ? ORDER_STATUS.PENDING : ORDER_STATUS.SHIPPED;

  const ordersMap = new Map<string, Record<string, unknown>>();
  const trackingMap = new Map<string, Map<string, string | null>>();
  const items: ParsedOrderItem[] = [];

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    if (!row || row.cellCount === 0) continue;

    const rowData: Record<string, string> = {};
    expectedHeaders.forEach((header) => {
      const colIndex = headerMap.get(header) ?? 0;
      rowData[header] = readCellText(row.getCell(colIndex));
    });

    const salesChannelId = normalizeIncomingSalesChannelId(
      rowData["Sales Channel ID"]
    );
    const orderNumber = rowData["Order number"];
    const sku = rowData["SKU"];

    if (!salesChannelId || !orderNumber || !sku) {
      continue;
    }

    const isShopifyOrder = isShopifySalesChannelId(salesChannelId);
    const rowOrderStatus = isShopifyOrder
      ? ORDER_STATUS.PENDING
      : importedOrderStatus;
    const key = `${salesChannelId}::${orderNumber}`;

    const existing = ordersMap.get(key) ?? {
      sales_channel_id: salesChannelId,
      order_number: orderNumber,
      status: rowOrderStatus,
    };
    const normalizedSalesChannelName = normalizeOrderPlatformName({
      salesChannelName: rowData["Sales Channel Readable name"],
      salesChannelId,
    });

    const mergeField = (field: string, value: string) => {
      if (!value) return;
      if (!existing[field]) {
        existing[field] = value;
      }
    };

    mergeField(
      "sales_channel_name",
      normalizedSalesChannelName || rowData["Sales Channel Readable name"]
    );
    mergeField("customer_name", rowData["Customer Name"]);
    mergeField("customer_address", rowData["Customer address"]);
    mergeField("customer_zip", rowData["Customer zip code"]);
    mergeField("customer_city", rowData["Customer city"]);
    mergeField("customer_phone", rowData["Customer cell phone"]);
    mergeField("customer_email", rowData["Customer email"]);
    const transactionDate = normalizeDateForDb(rowData["Transaction Date"]);
    const dateShipped =
      importMode === "shipped" && !isShopifyOrder
        ? normalizeDateForDb(rowData["Date shipped"] ?? "")
        : null;

    mergeField("transaction_date", transactionDate ?? "");
    if (importMode === "shipped") {
      mergeField("date_shipped", dateShipped ?? "");
    }
    existing.status = pickHigherPriorityOrderStatus(existing.status, rowOrderStatus);
    existing.raw_row = rowData;

    ordersMap.set(key, existing);

    const trackingNumber =
      importMode === "shipped"
        ? String(rowData["Tracking number"] ?? "").trim()
        : "";
    if (trackingNumber) {
      if (!trackingMap.has(key)) {
        trackingMap.set(key, new Map());
      }
      const trackingByNumber = trackingMap.get(key);
      if (trackingByNumber) {
        const currentSentDate = trackingByNumber.get(trackingNumber) ?? null;
        trackingByNumber.set(
          trackingNumber,
          pickTrackingSentDate(currentSentDate, dateShipped)
        );
      }
    }

    const quantity = normalizeNumber(rowData["Quantity"]);
    const salesValue = normalizeNumber(rowData["Sales value EUR"]);

    items.push({
      sales_channel_id: salesChannelId,
      order_number: orderNumber,
      sku,
      quantity,
      sales_value_eur: salesValue,
      marketplace_order_number: rowData["Marketplace order number"],
      sales_channel_order_number: rowData["Sales channel order number"],
      transaction_date: transactionDate,
      date_shipped: dateShipped,
      raw_row: rowData,
      tracking_number: trackingNumber,
    });
  }

  if (ordersMap.size === 0) {
    return NextResponse.json({ error: "No valid rows found." }, { status: 400 });
  }

  const orders = Array.from(ordersMap.values());
  const canWriteOrderStatus = await hasOrdersStatusColumn(adminClient);
  const existingOrderStateByKey = new Map<
    string,
    { date_shipped: string | null; status: string | null }
  >();
  type ExistingOrderStateRow = {
    sales_channel_id: string | null;
    order_number: string | null;
    date_shipped: string | null;
    status?: string | null;
  };

  for (const orderChunk of chunkList(orders, 200)) {
    const orderNumbers = Array.from(
      new Set(orderChunk.map((order) => String(order.order_number ?? "").trim()))
    ).filter(Boolean);
    const salesChannelIds = Array.from(
      new Set(orderChunk.map((order) => String(order.sales_channel_id ?? "").trim()))
    ).filter(Boolean);

    if (orderNumbers.length === 0 || salesChannelIds.length === 0) {
      continue;
    }

    let existingRows: ExistingOrderStateRow[] = [];
    let existingOrdersError: DbError | null = null;
    if (canWriteOrderStatus) {
      const { data, error } = await adminClient
        .from("orders_global")
        .select("sales_channel_id,order_number,date_shipped,status")
        .in("sales_channel_id", salesChannelIds)
        .in("order_number", orderNumbers);
      existingRows = (data ?? []) as ExistingOrderStateRow[];
      existingOrdersError = error;
    } else {
      const { data, error } = await adminClient
        .from("orders_global")
        .select("sales_channel_id,order_number,date_shipped")
        .in("sales_channel_id", salesChannelIds)
        .in("order_number", orderNumbers);
      existingRows = (data ?? []) as ExistingOrderStateRow[];
      existingOrdersError = error;
    }

    if (existingOrdersError) {
      return NextResponse.json(
        buildDbErrorPayload(
          existingOrdersError,
          "Unable to read existing orders for status merge."
        ),
        { status: 500 }
      );
    }

    existingRows.forEach((row) => {
      const key = `${row.sales_channel_id}::${row.order_number}`;
      existingOrderStateByKey.set(key, {
        date_shipped: row.date_shipped ? String(row.date_shipped) : null,
        status:
          canWriteOrderStatus && "status" in row && row.status
            ? String(row.status)
            : null,
      });
    });
  }

  orders.forEach((order) => {
    const isShopifyOrder = isShopifySalesChannelId(order.sales_channel_id);
    if (isShopifyOrder) {
      order.date_shipped = null;
      if (canWriteOrderStatus) {
        order.status = ORDER_STATUS.PENDING;
      } else {
        delete order.status;
      }
      return;
    }

    const key = `${order.sales_channel_id}::${order.order_number}`;
    const existingState = existingOrderStateByKey.get(key);
    const existingDateShipped = String(existingState?.date_shipped ?? "").trim();
    const incomingDateShipped = String(order.date_shipped ?? "").trim();
    if (!incomingDateShipped && existingDateShipped) {
      order.date_shipped = existingDateShipped;
    }
    if (canWriteOrderStatus) {
      order.status = pickHigherPriorityOrderStatus(
        existingState?.status,
        order.status ?? importedOrderStatus
      );
    } else {
      delete order.status;
    }
  });

  const orderIdMap = new Map<string, string>();
  for (const orderChunk of chunkList(orders, 500)) {
    const { data: upsertedOrderRows, error: orderError } = await adminClient
      .from("orders_global")
      .upsert(orderChunk, { onConflict: "sales_channel_id,order_number" })
      .select("id,sales_channel_id,order_number");

    if (orderError) {
      return NextResponse.json(
        buildDbErrorPayload(orderError, "Unable to upsert orders."),
        { status: 500 }
      );
    }

    (upsertedOrderRows ?? []).forEach((row) => {
      const key = `${row.sales_channel_id}::${row.order_number}`;
      if (row.id) {
        orderIdMap.set(key, row.id as string);
      }
    });
  }

  if (orderIdMap.size < orders.length) {
    for (const orderChunk of chunkList(orders, 200)) {
      const orderNumbers = Array.from(
        new Set(orderChunk.map((order) => String(order.order_number ?? "").trim()))
      ).filter(Boolean);
      const salesChannelIds = Array.from(
        new Set(
          orderChunk.map((order) => String(order.sales_channel_id ?? "").trim())
        )
      ).filter(Boolean);

      if (orderNumbers.length === 0 || salesChannelIds.length === 0) {
        continue;
      }

      const { data: fallbackRows, error: fallbackError } = await adminClient
        .from("orders_global")
        .select("id,sales_channel_id,order_number")
        .in("sales_channel_id", salesChannelIds)
        .in("order_number", orderNumbers);

      if (fallbackError) {
        return NextResponse.json(
          buildDbErrorPayload(fallbackError, "Unable to fetch imported orders."),
          { status: 500 }
        );
      }

      (fallbackRows ?? []).forEach((row) => {
        const key = `${row.sales_channel_id}::${row.order_number}`;
        if (row.id) {
          orderIdMap.set(key, row.id as string);
        }
      });
    }
  }

  const itemsWithIds = items
    .map((item) => {
      const key = `${item.sales_channel_id}::${item.order_number}`;
      const orderId = orderIdMap.get(key);
      if (!orderId) return null;
      return { ...item, order_id: orderId };
    })
    .filter(Boolean) as (ParsedOrderItem & { order_id: string })[];

  const orderIdsForItems = Array.from(
    new Set(itemsWithIds.map((item) => item.order_id).filter(Boolean))
  );
  const existingItemKeys = new Set<string>();
  if (orderIdsForItems.length > 0) {
    for (const orderChunk of chunkList(orderIdsForItems, 200)) {
      const { data: existingItems, error: existingItemsError } = await adminClient
        .from("order_items_global")
        .select("order_id,sku")
        .in("order_id", orderChunk);

      if (existingItemsError) {
        return NextResponse.json(
          buildDbErrorPayload(
            existingItemsError,
            "Unable to read existing items for dedupe."
          ),
          { status: 500 }
        );
      }

      (existingItems ?? []).forEach((row) => {
        if (!row.order_id || !row.sku) return;
        existingItemKeys.add(buildItemUniquenessKey(row.order_id, row.sku));
      });
    }
  }

  const incomingItemKeys = new Set<string>();
  const itemsToInsert = itemsWithIds.filter((item) => {
    const key = buildItemUniquenessKey(item.order_id, item.sku);
    if (existingItemKeys.has(key)) return false;
    if (incomingItemKeys.has(key)) return false;
    incomingItemKeys.add(key);
    return true;
  });

  for (const batch of chunkList(itemsToInsert, 500)) {
    const payload = batch.map((item) => ({
      order_id: item.order_id,
      sales_channel_id: item.sales_channel_id,
      order_number: item.order_number,
      sku: item.sku,
      quantity: item.quantity,
      sales_value_eur: item.sales_value_eur,
      marketplace_order_number: item.marketplace_order_number,
      sales_channel_order_number: item.sales_channel_order_number,
      transaction_date: item.transaction_date,
      date_shipped: item.date_shipped,
      raw_row: item.raw_row,
    }));
    const { error: itemsError } = await adminClient
      .from("order_items_global")
      .insert(payload);
    if (itemsError) {
      return NextResponse.json(
        buildDbErrorPayload(itemsError, "Unable to insert imported items."),
        { status: 500 }
      );
    }
  }

  const trackingRows: Array<{
    sales_channel_id: string;
    order_number: string;
    tracking_number: string;
    order_id: string;
  }> = [];
  const trackingRowsWithSentDate: Array<{
    sales_channel_id: string;
    order_number: string;
    tracking_number: string;
    order_id: string;
    sent_date: string;
  }> = [];
  trackingMap.forEach((values, key) => {
    const orderId = orderIdMap.get(key);
    if (!orderId) return;
    const [sales_channel_id, order_number] = key.split("::");
    values.forEach((sentDate, tracking) => {
      const baseRow = {
        sales_channel_id,
        order_number,
        tracking_number: tracking,
        order_id: orderId,
      };
      trackingRows.push(baseRow);
      if (sentDate) {
        trackingRowsWithSentDate.push({
          ...baseRow,
          sent_date: sentDate,
        });
      }
    });
  });

  if (trackingRows.length > 0) {
    const { error: trackingError } = await adminClient
      .from("order_tracking_numbers_global")
      .upsert(trackingRows, {
        onConflict: "sales_channel_id,order_number,tracking_number",
      });

    if (trackingError) {
      return NextResponse.json(
        buildDbErrorPayload(
          trackingError,
          "Unable to upsert tracking numbers."
        ),
        { status: 500 }
      );
    }
  }

  if (trackingRowsWithSentDate.length > 0) {
    const canWriteTrackingSentDate = await hasTrackingSentDateColumn(adminClient);
    if (canWriteTrackingSentDate) {
      const { error: trackingDateError } = await adminClient
        .from("order_tracking_numbers_global")
        .upsert(trackingRowsWithSentDate, {
          onConflict: "sales_channel_id,order_number,tracking_number",
        });

      if (trackingDateError) {
        return NextResponse.json(
          buildDbErrorPayload(
            trackingDateError,
            "Unable to upsert tracking sent dates."
          ),
          { status: 500 }
        );
      }
    }
  }

  const historyPath = "/srv/incoming-scripts/uploads/orders-import-history.json";
  const historyEntry = {
    id: entryId,
    file_name: rawName,
    stored_name: storedName,
    stored_path: storedPath,
    row_count: items.length,
    import_mode: importMode,
    created_at: new Date().toISOString(),
  };

  try {
    const existingRaw = await fs.readFile(historyPath, "utf8");
    const existing = JSON.parse(existingRaw);
    const next = Array.isArray(existing) ? existing : [];
    next.push(historyEntry);
    await fs.writeFile(historyPath, JSON.stringify(next, null, 2));
  } catch {
    await fs.writeFile(historyPath, JSON.stringify([historyEntry], null, 2));
  }

  return NextResponse.json({
    ok: true,
    importMode,
    ordersCount: orders.length,
    itemsCount: itemsToInsert.length,
    duplicateItemsSkipped: itemsWithIds.length - itemsToInsert.length,
    trackingCount: trackingRows.length,
  });
}
