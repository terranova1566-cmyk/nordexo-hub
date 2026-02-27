import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeOrderPlatformName } from "@/lib/orders/platform";
import {
  DEFAULT_ORDER_DELAY_WARNING_DAYS,
  inferOrderStatusWithoutStatusColumn,
  normalizeOrderStatus,
  ORDER_STATUS_VALUES,
  resolveOrderDelayWarning,
} from "@/lib/orders/status";

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

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

async function hasOrdersStatusColumn(adminClient: AdminClient) {
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

type OrdersNotificationColumnFlags = {
  latestNotificationName: boolean;
  latestNotificationSentAt: boolean;
};

type OrdersCountryColumnFlags = {
  customerCountryCode: boolean;
  customerCountry: boolean;
};

type SendpulseHistoryColumnFlags = {
  orderId: boolean;
  sendDate: boolean;
  notificationName: boolean;
};

async function getOrdersNotificationColumnFlags(
  adminClient: AdminClient
): Promise<OrdersNotificationColumnFlags> {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "orders_global")
    .in("column_name", [
      "latest_notification_name",
      "latest_notification_sent_at",
    ]);

  if (error) {
    return {
      latestNotificationName: false,
      latestNotificationSentAt: false,
    };
  }

  const columnNames = new Set(
    ((data ?? []) as Array<{ column_name?: unknown }>)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
  );

  return {
    latestNotificationName: columnNames.has("latest_notification_name"),
    latestNotificationSentAt: columnNames.has("latest_notification_sent_at"),
  };
}

async function getOrdersCountryColumnFlags(
  adminClient: AdminClient
): Promise<OrdersCountryColumnFlags> {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "orders_global")
    .in("column_name", ["customer_country_code", "customer_country"]);

  if (error) {
    return {
      customerCountryCode: false,
      customerCountry: false,
    };
  }

  const columnNames = new Set(
    ((data ?? []) as Array<{ column_name?: unknown }>)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
  );

  return {
    customerCountryCode: columnNames.has("customer_country_code"),
    customerCountry: columnNames.has("customer_country"),
  };
}

async function getSendpulseHistoryColumnFlags(
  adminClient: AdminClient
): Promise<SendpulseHistoryColumnFlags> {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "sendpulse_email_logs")
    .in("column_name", ["order_id", "send_date", "notification_name"]);

  if (error) {
    return {
      orderId: false,
      sendDate: false,
      notificationName: false,
    };
  }

  const columnNames = new Set(
    ((data ?? []) as Array<{ column_name?: unknown }>)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
  );

  return {
    orderId: columnNames.has("order_id"),
    sendDate: columnNames.has("send_date"),
    notificationName: columnNames.has("notification_name"),
  };
}

function resolveDelayWarningDays() {
  const raw = Number(process.env.ORDER_DELAY_WARNING_DAYS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_ORDER_DELAY_WARNING_DAYS;
}

function chunkArray<T>(items: T[], size: number) {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeBigintId(value: unknown) {
  const token = String(value ?? "").trim();
  return /^\d+$/.test(token) ? token : null;
}

function normalizeCountryCode(value: unknown) {
  const token = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return token.length === 2 ? token : null;
}

const COUNTRY_NAME_TO_CODE = new Map<string, string>([
  ["SWEDEN", "SE"],
  ["SVERIGE", "SE"],
  ["NORWAY", "NO"],
  ["NORGE", "NO"],
  ["FINLAND", "FI"],
  ["SUOMI", "FI"],
  ["DENMARK", "DK"],
  ["DANMARK", "DK"],
]);

function mapCountryNameToCode(value: unknown) {
  const token = String(value ?? "").trim().toUpperCase();
  if (!token) return null;
  return COUNTRY_NAME_TO_CODE.get(token) ?? null;
}

function pickObject(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickCountryFromRawRow(rawRow: unknown) {
  const root = pickObject(rawRow);
  if (!root) return { countryCode: null as string | null, countryName: null as string | null };

  const orderRoot = pickObject(root.order) ?? root;
  const shippingAddress = pickObject(orderRoot.shipping_address);
  const billingAddress = pickObject(orderRoot.billing_address);
  const customer = pickObject(orderRoot.customer);
  const defaultAddress = pickObject(customer?.default_address);

  const countryName =
    String(
      shippingAddress?.country ??
        billingAddress?.country ??
        defaultAddress?.country ??
        ""
    ).trim() || null;

  const countryCode =
    normalizeCountryCode(shippingAddress?.country_code) ||
    normalizeCountryCode(billingAddress?.country_code) ||
    normalizeCountryCode(defaultAddress?.country_code) ||
    mapCountryNameToCode(countryName) ||
    null;

  return { countryCode, countryName };
}

function sortOrderRows(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((left, right) => {
    const leftDate = String(left.transaction_date ?? "");
    const rightDate = String(right.transaction_date ?? "");
    if (leftDate < rightDate) return 1;
    if (leftDate > rightDate) return -1;

    const leftOrderNumber = String(left.order_number ?? "");
    const rightOrderNumber = String(right.order_number ?? "");
    const byOrderNumber = leftOrderNumber.localeCompare(rightOrderNumber);
    if (byOrderNumber !== 0) return byOrderNumber;

    const leftId = String(left.id ?? "");
    const rightId = String(right.id ?? "");
    return leftId.localeCompare(rightId);
  });
}

async function findOrderIdsBySkuOrSpu(adminClient: AdminClient, query: string) {
  const like = `%${query}%`;
  const orderIdSet = new Set<string>();

  const { data: skuItemRows, error: skuItemError } = await adminClient
    .from("order_items_global")
    .select("order_id")
    .ilike("sku", like)
    .not("order_id", "is", null);

  if (skuItemError) {
    throw new Error(skuItemError.message || "Unable to search orders by SKU.");
  }

  (skuItemRows ?? []).forEach((row) => {
    const orderId = normalizeBigintId((row as { order_id?: unknown }).order_id);
    if (orderId) orderIdSet.add(orderId);
  });

  const { data: products, error: productsError } = await adminClient
    .from("catalog_products")
    .select("id")
    .ilike("spu", like);

  if (productsError) {
    throw new Error(productsError.message || "Unable to search orders by SPU.");
  }

  const productIds = Array.from(
    new Set(
      (products ?? [])
        .map((row) => String((row as { id?: unknown }).id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (productIds.length > 0) {
    const { data: variants, error: variantsError } = await adminClient
      .from("catalog_variants")
      .select("sku")
      .in("product_id", productIds)
      .not("sku", "is", null);

    if (variantsError) {
      throw new Error(variantsError.message || "Unable to search variants for SPU.");
    }

    const skus = Array.from(
      new Set(
        (variants ?? [])
          .map((row) => String((row as { sku?: unknown }).sku ?? "").trim())
          .filter(Boolean)
      )
    );

    for (const skuChunk of chunkArray(skus, 500)) {
      if (skuChunk.length === 0) continue;
      const { data: spuItemRows, error: spuItemError } = await adminClient
        .from("order_items_global")
        .select("order_id")
        .in("sku", skuChunk)
        .not("order_id", "is", null);

      if (spuItemError) {
        throw new Error(spuItemError.message || "Unable to match orders for SPU.");
      }

      (spuItemRows ?? []).forEach((row) => {
        const orderId = normalizeBigintId((row as { order_id?: unknown }).order_id);
        if (orderId) orderIdSet.add(orderId);
      });
    }
  }

  return Array.from(orderIdSet);
}

const requireAdmin = async (): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; adminClient: AdminClient }
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

  return { ok: true, adminClient: adminClient as AdminClient };
};

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient as AdminClient;
  const includeStatus = await hasOrdersStatusColumn(adminClient);
  const notificationColumns =
    await getOrdersNotificationColumnFlags(adminClient);
  const countryColumns = await getOrdersCountryColumnFlags(adminClient);
  const sendpulseHistoryColumns = await getSendpulseHistoryColumnFlags(
    adminClient
  );
  const delayWarningDays = resolveDelayWarningDays();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const transactionFrom = searchParams.get("transaction_from")?.trim();
  const transactionTo = searchParams.get("transaction_to")?.trim();
  const shippedFrom = searchParams.get("shipped_from")?.trim();
  const shippedTo = searchParams.get("shipped_to")?.trim();
  const orderFieldSearch = query
    ? `order_number.ilike.%${query}%,customer_name.ilike.%${query}%,customer_email.ilike.%${query}%,customer_address.ilike.%${query}%`
    : null;
  let itemMatchedOrderIds: string[] = [];
  if (query) {
    try {
      itemMatchedOrderIds = await findOrderIdsBySkuOrSpu(adminClient, query);
    } catch (searchError) {
      return NextResponse.json(
        {
          error:
            searchError instanceof Error
              ? searchError.message
              : "Unable to search orders by SKU/SPU.",
        },
        { status: 500 }
      );
    }
  }

  const applyFilters = <
    T extends {
      gte: (column: string, value: string) => T;
      lte: (column: string, value: string) => T;
    },
  >(
    queryBuilder: T
  ) => {
    let next = queryBuilder;
    if (transactionFrom) {
      next = next.gte("transaction_date", transactionFrom);
    }
    if (transactionTo) {
      next = next.lte("transaction_date", transactionTo);
    }
    if (shippedFrom) {
      next = next.gte("date_shipped", shippedFrom);
    }
    if (shippedTo) {
      next = next.lte("date_shipped", shippedTo);
    }
    return next;
  };

  const notificationSelectColumns = [
    notificationColumns.latestNotificationName
      ? "latest_notification_name"
      : null,
    notificationColumns.latestNotificationSentAt
      ? "latest_notification_sent_at"
      : null,
  ]
    .filter(Boolean)
    .join(",");

  const countrySelectColumns = [
    countryColumns.customerCountryCode ? "customer_country_code" : null,
    countryColumns.customerCountry ? "customer_country" : null,
  ]
    .filter(Boolean)
    .join(",");

  const baseSelectColumns = includeStatus
    ? "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_email,customer_address,customer_city,customer_zip,transaction_date,date_shipped,status,raw_row,created_at"
    : "id,sales_channel_id,order_number,sales_channel_name,customer_name,customer_email,customer_address,customer_city,customer_zip,transaction_date,date_shipped,raw_row,created_at";

  const selectColumns = [baseSelectColumns, notificationSelectColumns, countrySelectColumns]
    .filter(Boolean)
    .join(",");

  let data: Array<Record<string, unknown>> = [];
  let error: { message: string } | null = null;
  let count: number | null = null;
  if (query) {
    const { data: directRows, error: directRowsError } = await applyFilters(
      (orderFieldSearch
        ? adminClient
            .from("orders_global")
            .select(selectColumns)
            .or(orderFieldSearch)
        : adminClient.from("orders_global").select(selectColumns)
      )
        .order("transaction_date", { ascending: false })
        .order("order_number", { ascending: true })
    );
    error = directRowsError;
    if (!error) {
      const merged = new Map<string, Record<string, unknown>>();
      (directRows ?? []).forEach((row) => {
        const id = String((row as { id?: unknown }).id ?? "").trim();
        if (!id) return;
        merged.set(id, row as unknown as Record<string, unknown>);
      });

      if (itemMatchedOrderIds.length > 0) {
        for (const orderIdChunk of chunkArray(itemMatchedOrderIds, 500)) {
          const { data: itemRows, error: itemRowsError } = await applyFilters(
            adminClient
              .from("orders_global")
              .select(selectColumns)
              .in("id", orderIdChunk)
              .order("transaction_date", { ascending: false })
              .order("order_number", { ascending: true })
          );
          if (itemRowsError) {
            error = itemRowsError;
            break;
          }
          (itemRows ?? []).forEach((row) => {
            const id = String((row as { id?: unknown }).id ?? "").trim();
            if (!id) return;
            merged.set(id, row as unknown as Record<string, unknown>);
          });
        }
      }

      if (!error) {
        data = sortOrderRows(Array.from(merged.values()));
        count = data.length;
      }
    }
  } else {
    const { data: rows, error: rowsError, count: rowsCount } = await applyFilters(
      adminClient
        .from("orders_global")
        .select(selectColumns, { count: "exact" })
        .order("transaction_date", { ascending: false })
        .order("order_number", { ascending: true })
    );
    data = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    error = rowsError;
    count = rowsCount;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row) => {
    const safeRow = row as Record<string, unknown> & {
      id?: unknown;
      transaction_date?: string | null;
      status?: unknown;
      date_shipped?: unknown;
      raw_row?: unknown;
      sales_channel_id?: unknown;
      sales_channel_name?: unknown;
      customer_country_code?: unknown;
      customer_country?: unknown;
    };
    const rawCountry = pickCountryFromRawRow(safeRow.raw_row);
    const customerCountryCode =
      normalizeCountryCode(safeRow.customer_country_code) || rawCountry.countryCode;
    const customerCountry =
      String(safeRow.customer_country ?? "").trim() || rawCountry.countryName;
    const normalizedId = String(safeRow.id ?? "").trim();
    const status = includeStatus
      ? normalizeOrderStatus(safeRow.status)
      : inferOrderStatusWithoutStatusColumn(safeRow);
    const warning = resolveOrderDelayWarning(
      safeRow.transaction_date ?? null,
      status,
      delayWarningDays
    );
    const rest = { ...safeRow };
    delete rest.raw_row;
    const normalizedPlatformName = normalizeOrderPlatformName({
      salesChannelName: safeRow.sales_channel_name,
      salesChannelId: safeRow.sales_channel_id,
    });
    return {
      ...rest,
      id: normalizedId,
      sales_channel_name: normalizedPlatformName || (safeRow.sales_channel_name ?? null),
      customer_country_code: customerCountryCode,
      customer_country: customerCountry || null,
      status,
      is_delayed: warning.isDelayed,
      delay_days: warning.delayDays,
    };
  });

  let itemsWithNotificationFallback = items;

  if (sendpulseHistoryColumns.orderId) {
    const unresolvedOrderIds = Array.from(
      new Set(
        items
          .map((item) => {
            const row = item as Record<string, unknown>;
            const id = normalizeBigintId(row.id);
            if (!id) return null;
            const latestName = String(row.latest_notification_name ?? "").trim();
            const latestSentAt = String(row.latest_notification_sent_at ?? "").trim();
            if (latestName || latestSentAt) return null;
            return id;
          })
          .filter((entry): entry is string => Boolean(entry))
      )
    );

    if (unresolvedOrderIds.length > 0) {
      const notificationByOrderId = new Map<
        string,
        { name: string | null; sentAt: string | null }
      >();
      const sendpulseHistorySelectColumns = [
        "order_id",
        "status",
        "subject",
        "created_at",
        sendpulseHistoryColumns.sendDate ? "send_date" : null,
        sendpulseHistoryColumns.notificationName ? "notification_name" : null,
      ]
        .filter(Boolean)
        .join(",");

      for (const orderIdChunk of chunkArray(unresolvedOrderIds, 500)) {
        const { data: historyRows, error: historyError } = await adminClient
          .from("sendpulse_email_logs")
          .select(sendpulseHistorySelectColumns)
          .in("order_id", orderIdChunk)
          .order("created_at", { ascending: false });

        if (historyError) {
          return NextResponse.json(
            { error: historyError.message },
            { status: 500 }
          );
        }

        ((historyRows ?? []) as unknown as Array<Record<string, unknown>>).forEach((entry) => {
          const orderId = normalizeBigintId(entry.order_id);
          if (!orderId) return;
          const statusToken = String(entry.status ?? "").trim().toLowerCase();
          if (statusToken && statusToken !== "sent" && statusToken !== "success") {
            return;
          }
          const sentAt = String(entry.send_date ?? entry.created_at ?? "").trim() || null;
          if (!sentAt) return;
          const nextName =
            String(entry.notification_name ?? "").trim() ||
            String(entry.subject ?? "").trim() ||
            "Notification sent";

          const current = notificationByOrderId.get(orderId);
          const currentStamp = String(current?.sentAt ?? "");
          if (current && currentStamp >= sentAt) return;
          notificationByOrderId.set(orderId, {
            name: nextName || null,
            sentAt,
          });
        });
      }

      if (notificationByOrderId.size > 0) {
        itemsWithNotificationFallback = items.map((item) => {
          const row = item as Record<string, unknown>;
          const orderId = normalizeBigintId(row.id);
          if (!orderId) return item;
          const latestName = String(row.latest_notification_name ?? "").trim();
          const latestSentAt = String(row.latest_notification_sent_at ?? "").trim();
          if (latestName || latestSentAt) return item;
          const fallback = notificationByOrderId.get(orderId);
          if (!fallback) return item;
          return {
            ...row,
            latest_notification_name: fallback.name,
            latest_notification_sent_at: fallback.sentAt,
          };
        }) as typeof items;
      }
    }
  }

  return NextResponse.json({
    items: itemsWithNotificationFallback,
    count,
    delayWarningDays,
  });
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient as AdminClient;
  let payload: { ids?: string[] } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const ids = Array.isArray(payload?.ids) ? payload?.ids : [];
  const orderIds = Array.from(
    new Set(ids.map((id) => String(id).trim()).filter(Boolean))
  );

  if (orderIds.length === 0) {
    return NextResponse.json(
      { error: "Missing order ids." },
      { status: 400 }
    );
  }

  const { error: itemsError } = await adminClient
    .from("order_items_global")
    .delete()
    .in("order_id", orderIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { error: trackingError } = await adminClient
    .from("order_tracking_numbers_global")
    .delete()
    .in("order_id", orderIds);

  if (trackingError) {
    return NextResponse.json({ error: trackingError.message }, { status: 500 });
  }

  const { error: ordersError } = await adminClient
    .from("orders_global")
    .delete()
    .in("id", orderIds);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: orderIds.length });
}

export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  const adminClient = adminCheck.adminClient as AdminClient;
  const includeStatus = await hasOrdersStatusColumn(adminClient);
  if (!includeStatus) {
    return NextResponse.json(
      {
        error:
          "Orders status column is missing. Run migration `0061_orders_global_status.sql` first.",
      },
      { status: 400 }
    );
  }

  let payload: { ids?: string[]; status?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const ids = Array.isArray(payload?.ids) ? payload.ids : [];
  const orderIds = Array.from(
    new Set(ids.map((id) => String(id).trim()).filter(Boolean))
  );

  const nextStatusRaw = String(payload?.status ?? "").trim();
  const allowedStatuses = new Set<string>(ORDER_STATUS_VALUES);

  if (orderIds.length === 0) {
    return NextResponse.json(
      { error: "Missing order ids." },
      { status: 400 }
    );
  }

  if (!nextStatusRaw || !allowedStatuses.has(nextStatusRaw)) {
    return NextResponse.json(
      {
        error: `Invalid status. Allowed values: ${ORDER_STATUS_VALUES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const nextStatus = normalizeOrderStatus(nextStatusRaw);
  const { data, error } = await adminClient
    .from("orders_global")
    .update({ status: nextStatus })
    .in("id", orderIds)
    .select("id,status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    updated: data?.length ?? 0,
    ids: (data ?? []).map((row) => String(row.id)),
    status: nextStatus,
  });
}
