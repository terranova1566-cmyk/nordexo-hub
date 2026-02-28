import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadImageUrls, resolveImageUrl } from "@/lib/server-images";
import { normalizeOrderPlatformName } from "@/lib/orders/platform";
import {
  inferOrderStatusWithoutStatusColumn,
  normalizeOrderStatus,
} from "@/lib/orders/status";

const PRODUCT_META_NAMESPACES = ["product_global", "product.global"];
const IMAGE_EXTENSION_FALLBACKS = [".jpg", ".jpeg", ".png", ".webp"] as const;

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

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

function normalizeDateForDb(value: unknown) {
  const raw = String(value ?? "").trim();
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

function chooseDate(current: string | null | undefined, incoming: string | null) {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  return incoming > current ? incoming : current;
}

function resolveDbErrorMessage(error: unknown, fallback: string) {
  const dbError = (error ?? {}) as DbError;
  const message = String(dbError.message ?? "").trim();
  const details = String(dbError.details ?? "").trim();
  const hint = String(dbError.hint ?? "").trim();
  const code = String(dbError.code ?? "").trim();
  const generic =
    typeof error === "string"
      ? error.trim()
      : error instanceof Error
        ? String(error.message ?? "").trim()
        : "";

  return (
    message ||
    details ||
    hint ||
    generic ||
    (code ? `Database error (${code}).` : fallback)
  );
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function parseTrackingNumbersFromText(value: unknown) {
  const raw = String(value ?? "");
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
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

type SendpulseHistoryColumnFlags = {
  orderId: boolean;
  sendDate: boolean;
  recipientEmail: boolean;
  notificationName: boolean;
};

async function getSendpulseHistoryColumnFlags(
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>
): Promise<SendpulseHistoryColumnFlags> {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "sendpulse_email_logs")
    .in("column_name", [
      "order_id",
      "send_date",
      "recipient_email",
      "notification_name",
    ]);

  if (error) {
    return {
      orderId: false,
      sendDate: false,
      recipientEmail: false,
      notificationName: false,
    };
  }

  const names = new Set(
    ((data ?? []) as Array<{ column_name?: unknown }>)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
  );

  return {
    orderId: names.has("order_id"),
    sendDate: names.has("send_date"),
    recipientEmail: names.has("recipient_email"),
    notificationName: names.has("notification_name"),
  };
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

const filenameStem = (filename: string | null | undefined) =>
  String(filename ?? "")
    .replace(/\.[^/.]+$/u, "")
    .trim();

const resolveImageWithFallbackExt = async (
  imageFolder: string | null | undefined,
  filename: string | null | undefined,
  size: "thumb" | "original" = "thumb"
) => {
  if (!imageFolder || !filename) return null;

  const exact = await resolveImageUrl(imageFolder, filename, { size });
  if (exact) return exact;

  const stem = filenameStem(filename);
  if (!stem) return null;

  for (const ext of IMAGE_EXTENSION_FALLBACKS) {
    const candidate = `${stem}${ext}`;
    if (candidate === filename) continue;
    const resolved = await resolveImageUrl(imageFolder, candidate, { size });
    if (resolved) return resolved;
  }

  return null;
};

const extractTextValue = (row: Record<string, unknown>) => {
  if (row.value_text) return String(row.value_text);
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number);
  }
  if (typeof row.value === "string") return row.value;
  if (row.value_json !== null && row.value_json !== undefined) {
    return JSON.stringify(row.value_json);
  }
  if (row.value != null) return JSON.stringify(row.value);
  return null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  const includeOrderStatus = await hasOrdersStatusColumn(adminClient);
  const sendpulseHistoryColumns = await getSendpulseHistoryColumnFlags(
    adminClient
  );
  let order: Record<string, unknown> | null = null;
  let orderError: DbError | null = null;
  if (includeOrderStatus) {
    const { data, error } = await adminClient
      .from("orders_global")
      .select(
        "sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped,status,raw_row"
      )
      .eq("id", id)
      .maybeSingle();
    order = (data ?? null) as Record<string, unknown> | null;
    orderError = error;
  } else {
    const { data, error } = await adminClient
      .from("orders_global")
      .select(
        "sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped,raw_row"
      )
      .eq("id", id)
      .maybeSingle();
    order = (data ?? null) as Record<string, unknown> | null;
    orderError = error;
  }

  if (orderError) {
    return NextResponse.json(
      { error: resolveDbErrorMessage(orderError, "Unable to load order.") },
      { status: 500 }
    );
  }

  const { data: items, error: itemsError } = await adminClient
    .from("order_items_global")
    .select(
      "id,sku,quantity,sales_value_eur,transaction_date,date_shipped,marketplace_order_number,sales_channel_order_number,raw_row"
    )
    .eq("order_id", id)
    .order("sku", { ascending: true });

  if (itemsError) {
    return NextResponse.json(
      { error: resolveDbErrorMessage(itemsError, "Unable to load order items.") },
      { status: 500 }
    );
  }

  const includeTrackingSentDate = await hasTrackingSentDateColumn(adminClient);
  let trackingRows: Array<{
    tracking_number: string | null;
    sent_date?: string | null;
    created_at?: string | null;
  }> = [];
  if (includeTrackingSentDate) {
    const { data, error } = await adminClient
      .from("order_tracking_numbers_global")
      .select("tracking_number,sent_date,created_at")
      .eq("order_id", id);
    if (error) {
      return NextResponse.json(
        {
          error: resolveDbErrorMessage(
            error,
            "Unable to load tracking numbers."
          ),
        },
        { status: 500 }
      );
    }
    trackingRows = (data ?? []) as Array<{
      tracking_number: string | null;
      sent_date?: string | null;
      created_at?: string | null;
    }>;
  } else {
    const { data, error } = await adminClient
      .from("order_tracking_numbers_global")
      .select("tracking_number,created_at")
      .eq("order_id", id);
    if (error) {
      return NextResponse.json(
        {
          error: resolveDbErrorMessage(
            error,
            "Unable to load tracking numbers."
          ),
        },
        { status: 500 }
      );
    }
    trackingRows = (data ?? []) as Array<{
      tracking_number: string | null;
      created_at?: string | null;
    }>;
  }

  const itemTrackingDateMap = new Map<string, string>();
  (items ?? []).forEach((item) => {
    const rawRow =
      typeof item.raw_row === "object" && item.raw_row !== null
        ? (item.raw_row as Record<string, unknown>)
        : null;
    const trackingNumber = String(rawRow?.["Tracking number"] ?? "").trim();
    if (!trackingNumber) return;
    const shippedDate =
      normalizeDateForDb(rawRow?.["Date shipped"]) ??
      normalizeDateForDb(item.date_shipped);
    if (!shippedDate) return;
    const current = itemTrackingDateMap.get(trackingNumber) ?? null;
    itemTrackingDateMap.set(trackingNumber, chooseDate(current, shippedDate) ?? "");
  });

  const trackingMap = new Map<string, string | null>();
  (trackingRows ?? []).forEach((row) => {
    const trackingNumber = String(row.tracking_number ?? "").trim();
    if (!trackingNumber) return;
    const sentDateFromDb = normalizeDateForDb((row as { sent_date?: unknown }).sent_date);
    const sentDateFromItems = itemTrackingDateMap.get(trackingNumber) ?? null;
    const sentDateFromCreatedAt = normalizeDateForDb(row.created_at);
    trackingMap.set(
      trackingNumber,
      chooseDate(
        chooseDate(sentDateFromDb, sentDateFromItems),
        sentDateFromCreatedAt
      )
    );
  });

  itemTrackingDateMap.forEach((sentDate, trackingNumber) => {
    if (!trackingMap.has(trackingNumber)) {
      trackingMap.set(trackingNumber, sentDate || null);
    }
  });

  const trackingNumbers = Array.from(trackingMap.entries())
    .map(([tracking_number, sent_date]) => ({
      tracking_number,
      sent_date,
    }))
    .sort((a, b) => {
      if (a.sent_date && b.sent_date) {
        if (a.sent_date < b.sent_date) return -1;
        if (a.sent_date > b.sent_date) return 1;
      } else if (a.sent_date) {
        return -1;
      } else if (b.sent_date) {
        return 1;
      }
      return a.tracking_number.localeCompare(b.tracking_number);
    });

  let emailHistory: Array<{
    id: string;
    created_at: string | null;
    send_date: string | null;
    sender_email: string | null;
    recipient_email: string | null;
    subject: string | null;
    status: string | null;
    notification_name: string | null;
  }> = [];

  if (sendpulseHistoryColumns.orderId) {
    const historySelectColumns = [
      "id",
      "created_at",
      sendpulseHistoryColumns.sendDate ? "send_date" : null,
      "sender_email",
      sendpulseHistoryColumns.recipientEmail ? "recipient_email" : null,
      "subject",
      "status",
      sendpulseHistoryColumns.notificationName ? "notification_name" : null,
    ]
      .filter(Boolean)
      .join(",");
    const { data: historyRows, error: historyError } = await adminClient
      .from("sendpulse_email_logs")
      .select(historySelectColumns)
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (historyError) {
      return NextResponse.json(
        {
          error: resolveDbErrorMessage(
            historyError,
            "Unable to load order email history."
          ),
        },
        { status: 500 }
      );
    }

    emailHistory = ((historyRows ?? []) as unknown as Array<Record<string, unknown>>)
      .map((entry) => {
        const getText = (value: unknown) => {
          const token = String(value ?? "").trim();
          return token || null;
        };
        const idValue = getText(entry.id);
        if (!idValue) return null;
        return {
          id: idValue,
          created_at: getText(entry.created_at),
          send_date: getText(entry.send_date),
          sender_email: getText(entry.sender_email),
          recipient_email: getText(entry.recipient_email),
          subject: getText(entry.subject),
          status: getText(entry.status),
          notification_name: getText(entry.notification_name),
        };
      })
      .filter(
        (
          entry
        ): entry is {
          id: string;
          created_at: string | null;
          send_date: string | null;
          sender_email: string | null;
          recipient_email: string | null;
          subject: string | null;
          status: string | null;
          notification_name: string | null;
        } => Boolean(entry)
      )
      .sort((left, right) => {
        const leftStamp = String(left.send_date ?? left.created_at ?? "");
        const rightStamp = String(right.send_date ?? right.created_at ?? "");
        if (leftStamp < rightStamp) return 1;
        if (leftStamp > rightStamp) return -1;
        return left.id.localeCompare(right.id);
      });
  }

  const skus = Array.from(
    new Set((items ?? []).map((item) => item.sku).filter(Boolean))
  ) as string[];

  const skuToProduct = new Map<
    string,
    { title: string | null; spu: string | null; image_url: string | null }
  >();

  if (skus.length > 0) {
    const { data: variants } = await adminClient
      .from("catalog_variants")
      .select("sku, product_id, variant_image_url")
      .in("sku", skus);

    const productIds = Array.from(
      new Set((variants ?? []).map((variant) => variant.product_id).filter(Boolean))
    ) as string[];

    if (productIds.length > 0) {
      const shortTitleByProduct = new Map<string, string>();
      const { data: metaDefs } = await adminClient
        .from("metafield_definitions")
        .select("id, namespace, key")
        .eq("resource", "catalog_product")
        .eq("key", "short_title")
        .in("namespace", PRODUCT_META_NAMESPACES);

      const defMap = new Map(metaDefs?.map((def) => [def.id, def]) ?? []);
      const defIds = Array.from(defMap.keys());

      if (defIds.length > 0) {
        const { data: metaValues } = await adminClient
          .from("metafield_values")
          .select("definition_id, target_id, value_text, value, value_number, value_json")
          .eq("target_type", "product")
          .in("definition_id", defIds)
          .in("target_id", productIds);

        const byProduct = new Map<string, Map<string, string>>();
        metaValues?.forEach((row) => {
          const def = defMap.get(row.definition_id);
          if (!def || !row.target_id) return;
          const text = extractTextValue(row);
          if (!text) return;
          const productId = String(row.target_id);
          const byNamespace = byProduct.get(productId) ?? new Map<string, string>();
          byNamespace.set(def.namespace ?? "", text);
          byProduct.set(productId, byNamespace);
        });

        byProduct.forEach((namespaces, productId) => {
          for (const namespace of PRODUCT_META_NAMESPACES) {
            const value = namespaces.get(namespace);
            if (value) {
              shortTitleByProduct.set(productId, value);
              break;
            }
          }
        });
      }

      const { data: products } = await adminClient
        .from("catalog_products")
        .select("id,title,legacy_title_sv,spu,image_folder")
        .in("id", productIds);

      const productMap = new Map<
        string,
        {
          title: string | null;
          spu: string | null;
          image_folder: string | null;
          fallback_image_url: string | null;
        }
      >();

      await Promise.all(
        (products ?? []).map(async (product) => {
          if (!product.id) return;
          const productId = String(product.id);
          const shortTitle = shortTitleByProduct.get(productId) ?? null;
          const imageFolder =
            typeof product.image_folder === "string" && product.image_folder.trim()
              ? product.image_folder.trim()
              : null;
          let fallbackImageUrl: string | null = null;
          if (imageFolder) {
            const thumbs = await loadImageUrls(imageFolder, { size: "thumb" });
            fallbackImageUrl = thumbs[0] ?? null;
          }

          productMap.set(productId, {
            title: shortTitle || product.legacy_title_sv || product.title || null,
            spu: product.spu ?? null,
            image_folder: imageFolder,
            fallback_image_url: fallbackImageUrl,
          });
        })
      );

      await Promise.all(
        (variants ?? []).map(async (variant) => {
          if (!variant.sku || !variant.product_id) return;
          const product = productMap.get(String(variant.product_id));
          if (!product) return;

          const variantImageUrl = await resolveImageWithFallbackExt(
            product.image_folder,
            String(variant.variant_image_url ?? "").trim() || null,
            "thumb"
          );

          skuToProduct.set(variant.sku, {
            title: product.title,
            spu: product.spu,
            image_url: variantImageUrl || product.fallback_image_url,
          });
        })
      );
    }
  }

  const enrichedItems = (items ?? []).map((item) => {
    const itemWithoutRawRow = { ...(item as typeof item & {
      raw_row?: unknown;
    }) };
    delete itemWithoutRawRow.raw_row;
    const product = item.sku ? skuToProduct.get(item.sku) : null;
    return {
      ...itemWithoutRawRow,
      product_title: product?.title ?? null,
      product_spu: product?.spu ?? null,
      item_image_url: product?.image_url ?? null,
    };
  });

  const normalizedOrder = order
    ? (() => {
        const base = order as Record<string, unknown> & {
          status?: unknown;
          date_shipped?: unknown;
          raw_row?: unknown;
        };
        const rawRow =
          typeof base.raw_row === "object" && base.raw_row !== null
            ? (base.raw_row as Record<string, unknown>)
            : {};
        const resolvedStatus = includeOrderStatus
          ? normalizeOrderStatus(base.status)
          : inferOrderStatusWithoutStatusColumn(base);
        const normalizedPlatformName = normalizeOrderPlatformName({
          salesChannelName: base.sales_channel_name,
          salesChannelId: base.sales_channel_id,
        });
        const manualEmailHistory = normalizeText(rawRow.manual_email_history) || null;
        const customerNote =
          normalizeText(rawRow.manual_order_notes) ||
          normalizeText(rawRow.customer_note) ||
          null;
        const rest = { ...base };
        delete rest.raw_row;
        return {
          ...rest,
          sales_channel_name: normalizedPlatformName || (base.sales_channel_name ?? null),
          status: resolvedStatus,
          manual_email_history: manualEmailHistory,
          customer_note: customerNote,
        };
      })()
    : null;

  return NextResponse.json({
    order: normalizedOrder,
    items: enrichedItems,
    tracking_numbers: trackingNumbers,
    email_history: emailHistory,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const includeOrderStatus = await hasOrdersStatusColumn(adminClient);
  const orderSelectColumns = includeOrderStatus
    ? "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped,status,raw_row"
    : "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_address,customer_zip,customer_city,customer_phone,customer_email,transaction_date,date_shipped,raw_row";
  const { data: existingOrder, error: existingOrderError } = await adminClient
    .from("orders_global")
    .select(orderSelectColumns)
    .eq("id", id)
    .maybeSingle();

  if (existingOrderError) {
    return NextResponse.json(
      {
        error: resolveDbErrorMessage(
          existingOrderError,
          "Unable to load order for update."
        ),
      },
      { status: 500 }
    );
  }
  const existingOrderRecord = (existingOrder ?? null) as
    | Record<string, unknown>
    | null;

  if (!existingOrderRecord) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
  const hasShippingUpdate = has("shipping") || has("date_shipped");
  const hasTrackingUpdate = has("tracking_number") || has("tracking_numbers");
  const hasEmailHistoryUpdate = has("email_history");
  const hasNotesUpdate = has("notes");

  const updates: Record<string, unknown> = {};

  if (has("customer_name")) {
    updates.customer_name = normalizeText(payload.customer_name) || null;
  }
  if (has("customer_address")) {
    updates.customer_address = normalizeText(payload.customer_address) || null;
  }
  if (has("customer_zip")) {
    updates.customer_zip = normalizeText(payload.customer_zip) || null;
  }
  if (has("customer_city")) {
    updates.customer_city = normalizeText(payload.customer_city) || null;
  }
  if (has("customer_phone")) {
    updates.customer_phone = normalizeText(payload.customer_phone) || null;
  }
  if (has("customer_email")) {
    updates.customer_email = normalizeText(payload.customer_email) || null;
  }
  if (hasShippingUpdate) {
    const shippingRaw =
      payload.shipping ?? payload.date_shipped ?? payload.dateShipped ?? "";
    const shippingText = normalizeText(shippingRaw);
    const normalizedShippingDate = shippingText
      ? normalizeDateForDb(shippingText)
      : null;
    if (shippingText && !normalizedShippingDate) {
      return NextResponse.json(
        {
          error:
            "Shipping date must be a valid date (YYYY-MM-DD, YYYY/MM/DD, ISO date, or Excel serial).",
        },
        { status: 400 }
      );
    }
    updates.date_shipped = normalizedShippingDate;
  }

  if (hasEmailHistoryUpdate || hasNotesUpdate) {
    const existingRawRow =
      typeof existingOrderRecord.raw_row === "object" &&
      existingOrderRecord.raw_row !== null
        ? { ...(existingOrderRecord.raw_row as Record<string, unknown>) }
        : {};
    const nextRawRow = { ...existingRawRow };

    if (hasEmailHistoryUpdate) {
      const manualEmailHistory = normalizeText(payload.email_history);
      if (manualEmailHistory) {
        nextRawRow.manual_email_history = manualEmailHistory;
      } else {
        delete nextRawRow.manual_email_history;
      }
    }
    if (hasNotesUpdate) {
      const manualOrderNotes = normalizeText(payload.notes);
      if (manualOrderNotes) {
        nextRawRow.manual_order_notes = manualOrderNotes;
      } else {
        delete nextRawRow.manual_order_notes;
        delete nextRawRow.customer_note;
      }
    }

    updates.raw_row = nextRawRow;
  }

  if (
    Object.keys(updates).length === 0 &&
    !hasTrackingUpdate &&
    !hasEmailHistoryUpdate &&
    !hasNotesUpdate
  ) {
    return NextResponse.json(
      { error: "No editable fields provided." },
      { status: 400 }
    );
  }

  let updatedOrder = existingOrderRecord;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await adminClient
      .from("orders_global")
      .update(updates)
      .eq("id", id)
      .select(orderSelectColumns)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: resolveDbErrorMessage(error, "Unable to update order.") },
        { status: 500 }
      );
    }
    if (data) {
      updatedOrder = data as unknown as Record<string, unknown>;
    }
  }

  let trackingNumbers: Array<{
    tracking_number: string;
    sent_date: string | null;
  }> | null = null;
  if (hasTrackingUpdate) {
    const trackingText =
      payload.tracking_number ?? payload.tracking_numbers ?? "";
    const parsedTrackingNumbers = parseTrackingNumbersFromText(trackingText);
    const { error: deleteTrackingError } = await adminClient
      .from("order_tracking_numbers_global")
      .delete()
      .eq("order_id", id);

    if (deleteTrackingError) {
      return NextResponse.json(
        {
          error: resolveDbErrorMessage(
            deleteTrackingError,
            "Unable to update tracking numbers."
          ),
        },
        { status: 500 }
      );
    }

    const salesChannelId = normalizeText(updatedOrder.sales_channel_id);
    const orderNumber = normalizeText(updatedOrder.order_number);
    const orderShipDate =
      normalizeDateForDb(updatedOrder.date_shipped) ??
      normalizeDateForDb(existingOrderRecord.date_shipped);
    const canWriteTrackingSentDate = await hasTrackingSentDateColumn(adminClient);

    if (parsedTrackingNumbers.length > 0) {
      if (!salesChannelId || !orderNumber) {
        return NextResponse.json(
          {
            error:
              "Unable to save tracking numbers because sales channel ID or order number is missing.",
          },
          { status: 400 }
        );
      }

      const baseRows = parsedTrackingNumbers.map((trackingNumber) => ({
        sales_channel_id: salesChannelId,
        order_number: orderNumber,
        tracking_number: trackingNumber,
        order_id: id,
      }));

      const rowsToInsert = canWriteTrackingSentDate
        ? baseRows.map((row) => ({
            ...row,
            sent_date: orderShipDate,
          }))
        : baseRows;

      const { error: insertTrackingError } = await adminClient
        .from("order_tracking_numbers_global")
        .upsert(rowsToInsert, {
          onConflict: "sales_channel_id,order_number,tracking_number",
        });

      if (insertTrackingError) {
        return NextResponse.json(
          {
            error: resolveDbErrorMessage(
              insertTrackingError,
              "Unable to save tracking numbers."
            ),
          },
          { status: 500 }
        );
      }
    }

    trackingNumbers = parsedTrackingNumbers.map((trackingNumber) => ({
      tracking_number: trackingNumber,
      sent_date: normalizeDateForDb(updatedOrder.date_shipped),
    }));
  }

  const normalizedPlatformName = normalizeOrderPlatformName({
    salesChannelName: updatedOrder.sales_channel_name,
    salesChannelId: updatedOrder.sales_channel_id,
  });
  const updatedRawRow =
    typeof updatedOrder.raw_row === "object" && updatedOrder.raw_row !== null
      ? (updatedOrder.raw_row as Record<string, unknown>)
      : {};
  const normalizedStatus = includeOrderStatus
    ? normalizeOrderStatus(updatedOrder.status)
    : inferOrderStatusWithoutStatusColumn(updatedOrder);

  const normalizedOrder = {
    ...updatedOrder,
    sales_channel_name: normalizedPlatformName || (updatedOrder.sales_channel_name ?? null),
    status: normalizedStatus,
    manual_email_history: normalizeText(updatedRawRow.manual_email_history) || null,
    customer_note:
      normalizeText(updatedRawRow.manual_order_notes) ||
      normalizeText(updatedRawRow.customer_note) ||
      null,
  };
  delete (normalizedOrder as { raw_row?: unknown }).raw_row;

  return NextResponse.json({
    order: normalizedOrder,
    tracking_numbers: trackingNumbers,
  });
}
