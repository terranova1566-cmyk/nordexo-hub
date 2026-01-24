import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { createServerSupabase } from "@/lib/supabase/server";
import { promises as fs } from "fs";
import path from "path";

const EXPECTED_HEADERS = [
  "Sales Channel ID",
  "Quantity",
  "Order number",
  "Customer Name",
  "Customer address",
  "Customer zip code",
  "Customer city",
  "Customer cell phone",
  "Sales Channel Readable name",
  "Customer email",
  "Marketplace order number",
  "Sales channel order number",
  "SKU",
  "Ignore",
  "Ignore2",
  "Transaction Date",
  "Sales value EUR",
  "Date shipped",
  "Ignore3",
  "Ignore4",
  "Ignore5",
  "Ignore6",
  "Ignore7",
  "Ignore8",
  "Tracking number",
];

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

  const missingHeaders = EXPECTED_HEADERS.filter((header) => !headerMap.has(header));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error: `Missing headers: ${missingHeaders.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const ordersMap = new Map<string, Record<string, unknown>>();
  const trackingMap = new Map<string, Set<string>>();
  const items: Record<string, unknown>[] = [];

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    if (!row || row.cellCount === 0) continue;

    const rowData: Record<string, string> = {};
    EXPECTED_HEADERS.forEach((header) => {
      const colIndex = headerMap.get(header) ?? 0;
      rowData[header] = readCellText(row.getCell(colIndex));
    });

    const salesChannelId = rowData["Sales Channel ID"];
    const orderNumber = rowData["Order number"];
    const sku = rowData["SKU"];

    if (!salesChannelId || !orderNumber || !sku) {
      continue;
    }

    const key = `${salesChannelId}::${orderNumber}`;

    const existing = ordersMap.get(key) ?? {
      sales_channel_id: salesChannelId,
      order_number: orderNumber,
    };

    const mergeField = (field: string, value: string) => {
      if (!value) return;
      if (!existing[field]) {
        existing[field] = value;
      }
    };

    mergeField("sales_channel_name", rowData["Sales Channel Readable name"]);
    mergeField("customer_name", rowData["Customer Name"]);
    mergeField("customer_address", rowData["Customer address"]);
    mergeField("customer_zip", rowData["Customer zip code"]);
    mergeField("customer_city", rowData["Customer city"]);
    mergeField("customer_phone", rowData["Customer cell phone"]);
    mergeField("customer_email", rowData["Customer email"]);
    mergeField("transaction_date", rowData["Transaction Date"]);
    mergeField("date_shipped", rowData["Date shipped"]);
    existing.raw_row = rowData;

    ordersMap.set(key, existing);

    const trackingNumber = rowData["Tracking number"].trim();
    if (trackingNumber) {
      if (!trackingMap.has(key)) {
        trackingMap.set(key, new Set());
      }
      trackingMap.get(key)?.add(trackingNumber);
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
      transaction_date: rowData["Transaction Date"],
      date_shipped: rowData["Date shipped"],
      raw_row: rowData,
    });
  }

  if (ordersMap.size === 0) {
    return NextResponse.json({ error: "No valid rows found." }, { status: 400 });
  }

  const orders = Array.from(ordersMap.values());
  const { error: orderError } = await adminClient
    .from("orders_global")
    .upsert(orders, { onConflict: "sales_channel_id,order_number" });

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const salesChannelIds = Array.from(
    new Set(orders.map((order) => String(order.sales_channel_id)))
  );
  const orderNumbers = Array.from(
    new Set(orders.map((order) => String(order.order_number)))
  );

  const { data: orderRows, error: orderRowsError } = await adminClient
    .from("orders_global")
    .select("id,sales_channel_id,order_number")
    .in("sales_channel_id", salesChannelIds)
    .in("order_number", orderNumbers);

  if (orderRowsError) {
    return NextResponse.json({ error: orderRowsError.message }, { status: 500 });
  }

  const orderIdMap = new Map<string, string>();
  (orderRows ?? []).forEach((row) => {
    const key = `${row.sales_channel_id}::${row.order_number}`;
    if (row.id) {
      orderIdMap.set(key, row.id as string);
    }
  });

  const itemsWithIds = items
    .map((item) => {
      const key = `${item.sales_channel_id}::${item.order_number}`;
      const orderId = orderIdMap.get(key);
      if (!orderId) return null;
      return { ...item, order_id: orderId };
    })
    .filter(Boolean) as Record<string, unknown>[];

  const chunk = <T,>(list: T[], size: number) => {
    const result: T[][] = [];
    for (let i = 0; i < list.length; i += size) {
      result.push(list.slice(i, i + size));
    }
    return result;
  };

  for (const batch of chunk(itemsWithIds, 500)) {
    const { error: itemsError } = await adminClient
      .from("order_items_global")
      .insert(batch);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  const trackingRows: Record<string, unknown>[] = [];
  trackingMap.forEach((values, key) => {
    const orderId = orderIdMap.get(key);
    if (!orderId) return;
    const [sales_channel_id, order_number] = key.split("::");
    values.forEach((tracking) => {
      trackingRows.push({
        sales_channel_id,
        order_number,
        tracking_number: tracking,
        order_id: orderId,
      });
    });
  });

  if (trackingRows.length > 0) {
    const { error: trackingError } = await adminClient
      .from("order_tracking_numbers_global")
      .upsert(trackingRows, {
        onConflict: "sales_channel_id,order_number,tracking_number",
      });

    if (trackingError) {
      return NextResponse.json({ error: trackingError.message }, { status: 500 });
    }
  }

  const historyPath = "/srv/incoming-scripts/uploads/orders-import-history.json";
  const historyEntry = {
    id: entryId,
    file_name: rawName,
    stored_name: storedName,
    stored_path: storedPath,
    row_count: items.length,
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
    ordersCount: orders.length,
    itemsCount: itemsWithIds.length,
    trackingCount: trackingRows.length,
  });
}
