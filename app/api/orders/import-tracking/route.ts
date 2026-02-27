import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";
import { createServerSupabase } from "@/lib/supabase/server";
import { ORDER_TRACKING_IMPORT_HEADERS } from "@/lib/orders/import-template";

export const runtime = "nodejs";

const REQUIRED_HEADERS = [...ORDER_TRACKING_IMPORT_HEADERS];
const UPLOAD_ROOT = "/srv/incoming-scripts/uploads/orders-tracking-imports";
const HISTORY_PATH =
  "/srv/incoming-scripts/uploads/orders-tracking-import-history.json";

type ParsedTrackingRow = {
  sales_channel_id: string;
  order_number: string;
  sent_date: string;
  tracking_number: string;
};

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

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

function buildDbErrorPayload(error: unknown, fallback: string) {
  const dbError = (error ?? {}) as DbError;
  const message = String(dbError.message ?? "").trim();
  const details = String(dbError.details ?? "").trim();
  const hint = String(dbError.hint ?? "").trim();
  const code = String(dbError.code ?? "").trim();

  return {
    error:
      message || details || hint || (code ? `Database error (${code}).` : fallback),
    code: code || null,
    details: details || null,
    hint: hint || null,
  };
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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePlatformId(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{2}-[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
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

function chunkList<T>(list: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    result.push(list.slice(index, index + size));
  }
  return result;
}

function buildTrackingUniquenessKey(
  salesChannelId: string,
  orderNumber: string,
  trackingNumber: string
) {
  return `${salesChannelId.trim().toLowerCase()}::${orderNumber
    .trim()
    .toLowerCase()}::${trackingNumber.trim().toLowerCase()}`;
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
  const canWriteTrackingSentDate = await hasTrackingSentDateColumn(adminClient);
  if (!canWriteTrackingSentDate) {
    return NextResponse.json(
      {
        error:
          "Tracking sent_date column is missing. Run migration `0053_orders_tracking_sent_date.sql` first.",
      },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = (formData.get("file") || formData.get("workbook")) as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing Excel file." }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });

  const rawName = file.name || "tracking-import.xlsx";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedName = `${entryId}-${safeName}`;
  const storedPath = path.join(UPLOAD_ROOT, storedName);

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
    const rawHeader = readCellText(cell);
    if (!rawHeader) return;
    headerMap.set(normalizeHeader(rawHeader), colNumber);
  });

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headerMap.has(normalizeHeader(header))
  );

  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required headers: ${missingHeaders.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const seenRowKeys = new Set<string>();
  const parsedRows: ParsedTrackingRow[] = [];
  let invalidRows = 0;
  let duplicateRows = 0;
  let sourceRows = 0;

  const platformColumn = headerMap.get(normalizeHeader("Platform ID")) ?? 0;
  const orderColumn = headerMap.get(normalizeHeader("Order number")) ?? 0;
  const shippingDateColumn = headerMap.get(normalizeHeader("Shipping date")) ?? 0;
  const trackingColumn = headerMap.get(normalizeHeader("Tracking number")) ?? 0;

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    if (!row || row.cellCount === 0) continue;

    const rawPlatformId = readCellText(row.getCell(platformColumn));
    const rawOrderNumber = readCellText(row.getCell(orderColumn));
    const rawShippingDate = readCellText(row.getCell(shippingDateColumn));
    const rawTrackingNumber = readCellText(row.getCell(trackingColumn));

    const orderNumber = rawOrderNumber.trim();
    const sentDate = normalizeDateForDb(rawShippingDate);
    const trackingNumber = rawTrackingNumber.trim();

    if (!rawPlatformId.trim() && !orderNumber && !rawShippingDate.trim() && !trackingNumber) {
      continue;
    }

    sourceRows += 1;

    const platformId = normalizePlatformId(rawPlatformId);
    if (!platformId || !orderNumber || !sentDate || !trackingNumber) {
      invalidRows += 1;
      continue;
    }

    const uniqueRowKey = buildTrackingUniquenessKey(
      platformId,
      orderNumber,
      trackingNumber
    );
    if (seenRowKeys.has(uniqueRowKey)) {
      duplicateRows += 1;
      continue;
    }

    seenRowKeys.add(uniqueRowKey);
    parsedRows.push({
      sales_channel_id: platformId,
      order_number: orderNumber,
      sent_date: sentDate,
      tracking_number: trackingNumber,
    });
  }

  if (parsedRows.length === 0) {
    return NextResponse.json(
      {
        error:
          sourceRows > 0
            ? "No valid tracking rows found. Check Platform ID format, Shipping date format, and required values."
            : "No rows found in file.",
      },
      { status: 400 }
    );
  }

  const orderIdByKey = new Map<string, string>();

  for (const chunk of chunkList(parsedRows, 200)) {
    const salesChannelIds = Array.from(
      new Set(chunk.map((row) => row.sales_channel_id).filter(Boolean))
    );
    const orderNumbers = Array.from(
      new Set(chunk.map((row) => row.order_number).filter(Boolean))
    );

    if (salesChannelIds.length === 0 || orderNumbers.length === 0) {
      continue;
    }

    const { data: orderRows, error: orderLookupError } = await adminClient
      .from("orders_global")
      .select("id,sales_channel_id,order_number")
      .in("sales_channel_id", salesChannelIds)
      .in("order_number", orderNumbers);

    if (orderLookupError) {
      return NextResponse.json(
        buildDbErrorPayload(orderLookupError, "Unable to match orders."),
        { status: 500 }
      );
    }

    (orderRows ?? []).forEach((order) => {
      if (!order?.id || !order?.sales_channel_id || !order?.order_number) {
        return;
      }
      const key = `${order.sales_channel_id}::${order.order_number}`;
      orderIdByKey.set(key, String(order.id));
    });
  }

  const matchedRows: Array<{
    sales_channel_id: string;
    order_number: string;
    sent_date: string;
    tracking_number: string;
    order_id: string;
  }> = [];
  let unmatchedCount = 0;

  parsedRows.forEach((row) => {
    const orderKey = `${row.sales_channel_id}::${row.order_number}`;
    const orderId = orderIdByKey.get(orderKey);
    if (!orderId) {
      unmatchedCount += 1;
      return;
    }

    matchedRows.push({
      sales_channel_id: row.sales_channel_id,
      order_number: row.order_number,
      sent_date: row.sent_date,
      tracking_number: row.tracking_number,
      order_id: orderId,
    });
  });

  const trackingRows: Array<{
    sales_channel_id: string;
    order_number: string;
    sent_date: string;
    tracking_number: string;
    order_id: string;
  }> = matchedRows.map((row) => ({
    sales_channel_id: row.sales_channel_id,
    order_number: row.order_number,
    sent_date: row.sent_date,
    tracking_number: row.tracking_number,
    order_id: row.order_id,
  }));

  const duplicatesSkipped = duplicateRows;

  if (trackingRows.length > 0) {
    const { error: trackingError } = await adminClient
      .from("order_tracking_numbers_global")
      .upsert(trackingRows, {
        onConflict: "sales_channel_id,order_number,tracking_number",
      });

    if (trackingError) {
      return NextResponse.json(
        buildDbErrorPayload(trackingError, "Unable to upsert tracking numbers."),
        { status: 500 }
      );
    }
  }

  const historyEntry = {
    id: entryId,
    file_name: rawName,
    stored_name: storedName,
    stored_path: storedPath,
    row_count: parsedRows.length,
    imported_count: trackingRows.length,
    duplicates_skipped: duplicatesSkipped,
    invalid_rows: invalidRows,
    unmatched_rows: unmatchedCount,
    created_at: new Date().toISOString(),
  };

  try {
    const existingRaw = await fs.readFile(HISTORY_PATH, "utf8");
    const existing = JSON.parse(existingRaw);
    const next = Array.isArray(existing) ? existing : [];
    next.push(historyEntry);
    await fs.writeFile(HISTORY_PATH, JSON.stringify(next, null, 2));
  } catch {
    await fs.writeFile(HISTORY_PATH, JSON.stringify([historyEntry], null, 2));
  }

  return NextResponse.json({
    ok: true,
    importedCount: trackingRows.length,
    validRows: parsedRows.length,
    duplicatesSkipped,
    invalidRows,
    unmatchedCount,
  });
}
