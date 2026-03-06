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

type OrdersSortOption =
  | "transaction_asc"
  | "transaction_desc"
  | "shipped_asc"
  | "shipped_desc";
type OrdersWarningFilterOption = "delayed" | "on_time";
type OrdersNotificationFilterOption = "have" | "none";

const ORDER_SORT_OPTIONS = new Set<OrdersSortOption>([
  "transaction_asc",
  "transaction_desc",
  "shipped_asc",
  "shipped_desc",
]);
const ORDER_WARNING_FILTER_OPTIONS = new Set<OrdersWarningFilterOption>([
  "delayed",
  "on_time",
]);
const ORDER_NOTIFICATION_FILTER_OPTIONS =
  new Set<OrdersNotificationFilterOption>(["have", "none"]);

const DEFAULT_ORDERS_SORT_OPTION: OrdersSortOption = "transaction_desc";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
const PARTNER_INFORMED_TEMPLATE_NAMES = new Set([
  "en - tracking and order info to partner",
  "en_order_partner_tracking",
]);
const PARTNER_INFORMED_TEMPLATE_IDS = new Set([
  "en_order_partner_tracking",
]);
const PARTNER_INFORMED_RECEIVER_KEYS = new Set([
  "letsdeal_se",
  "letsdeal_no",
  "letsdeal_sc",
  "letsdeal_nordexo",
]);
const PARTNER_INFORMED_RECEIVER_NAMES = new Set([
  "letsdeal se",
  "letsdeal no",
  "letsdeal at sc",
  "letsdeal at nordexo (nodexo)",
]);
const PARTNER_INFORMED_RECEIVER_EMAILS = new Set([
  "order@letsdeal.se",
]);

function parseOrdersSortOption(value: unknown): OrdersSortOption {
  const token = String(value ?? "")
    .trim()
    .toLowerCase() as OrdersSortOption;
  return ORDER_SORT_OPTIONS.has(token)
    ? token
    : DEFAULT_ORDERS_SORT_OPTION;
}

function normalizeFilterText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseCountryFilter(value: unknown) {
  const token = String(value ?? "").trim();
  if (!token || token.toLowerCase() === "all") return null;
  return normalizeCountryCode(token);
}

function parseSalesChannelFilters(values: unknown[]) {
  const tokens = values
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => normalizeFilterText(value))
    .filter((value) => Boolean(value) && value !== "all");
  return Array.from(new Set(tokens)).sort((left, right) =>
    left.localeCompare(right)
  );
}

function escapeIlikeToken(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

function buildSalesChannelOrClauses(filters: string[]) {
  const clauses = new Set<string>();

  filters.forEach((filter) => {
    const token = normalizeFilterText(filter);
    if (!token) return;
    const safeToken = escapeIlikeToken(token);

    if (token === "letsdeal") {
      clauses.add("sales_channel_id.ilike.LD-%");
      return;
    }

    if (token === "offerilla") {
      clauses.add("sales_channel_id.ilike.OF-%");
      return;
    }

    if (token === "digideal") {
      clauses.add("sales_channel_id.ilike.DI-%");
      return;
    }

    if (token === "sparklar") {
      clauses.add("sales_channel_id.ilike.SH-%");
      clauses.add("sales_channel_id.ilike.SK-%");
      clauses.add("sales_channel_name.ilike.Sparklar%");
      return;
    }

    if (!safeToken) return;
    clauses.add(`sales_channel_name.ilike.${safeToken}%`);
    clauses.add(`sales_channel_id.ilike.${safeToken}%`);
  });

  return Array.from(clauses);
}

function isStatementTimeoutError(value: unknown) {
  return /statement timeout/i.test(String(value ?? ""));
}

function parseOrdersWarningFilter(value: unknown): OrdersWarningFilterOption | null {
  const tokenRaw = String(value ?? "").trim().toLowerCase();
  if (!tokenRaw || tokenRaw === "all") return null;
  const token = tokenRaw as OrdersWarningFilterOption;
  return ORDER_WARNING_FILTER_OPTIONS.has(token) ? token : null;
}

function parseOrdersNotificationFilter(
  value: unknown
): OrdersNotificationFilterOption | null {
  const tokenRaw = String(value ?? "").trim().toLowerCase();
  if (!tokenRaw || tokenRaw === "all") return null;
  const token = tokenRaw as OrdersNotificationFilterOption;
  return ORDER_NOTIFICATION_FILTER_OPTIONS.has(token) ? token : null;
}

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

async function hasOrdersDateShippedColumn(adminClient: AdminClient) {
  const { data, error } = await adminClient
    .from("_introspect_columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "orders_global")
    .eq("column_name", "date_shipped")
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
  templateId: boolean;
  recipientEmail: boolean;
  variables: boolean;
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
    .in("column_name", [
      "order_id",
      "send_date",
      "notification_name",
      "template_id",
      "recipient_email",
      "variables",
    ]);

  if (error) {
    return {
      orderId: false,
      sendDate: false,
      notificationName: false,
      templateId: false,
      recipientEmail: false,
      variables: false,
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
    templateId: columnNames.has("template_id"),
    recipientEmail: columnNames.has("recipient_email"),
    variables: columnNames.has("variables"),
  };
}

function resolveDelayWarningDays() {
  const raw = Number(process.env.ORDER_DELAY_WARNING_DAYS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_ORDER_DELAY_WARNING_DAYS;
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  max: number | null = null
) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  if (max !== null && parsed > max) {
    return max;
  }
  return parsed;
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

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseJsonObject(value: unknown) {
  const direct = pickObject(value);
  if (direct) return direct;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return pickObject(parsed);
  } catch {
    return null;
  }
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

function sortOrderRows(
  rows: Array<Record<string, unknown>>,
  sortOption: OrdersSortOption
) {
  const sortByShippedDate =
    sortOption === "shipped_asc" || sortOption === "shipped_desc";
  const isAscending =
    sortOption === "transaction_asc" || sortOption === "shipped_asc";

  return [...rows].sort((left, right) => {
    const leftRawDate = String(
      (sortByShippedDate ? left.date_shipped : left.transaction_date) ?? ""
    ).trim();
    const rightRawDate = String(
      (sortByShippedDate ? right.date_shipped : right.transaction_date) ?? ""
    ).trim();
    const leftTime = Date.parse(leftRawDate);
    const rightTime = Date.parse(rightRawDate);
    const hasLeftTime = Number.isFinite(leftTime);
    const hasRightTime = Number.isFinite(rightTime);

    if (!hasLeftTime && hasRightTime) return 1;
    if (hasLeftTime && !hasRightTime) return -1;
    if (hasLeftTime && hasRightTime && leftTime !== rightTime) {
      return isAscending ? leftTime - rightTime : rightTime - leftTime;
    }

    const leftOrderNumber = String(left.order_number ?? "");
    const rightOrderNumber = String(right.order_number ?? "");
    const byOrderNumber = leftOrderNumber.localeCompare(rightOrderNumber);
    if (byOrderNumber !== 0) return byOrderNumber;

    const leftId = String(left.id ?? "");
    const rightId = String(right.id ?? "");
    return leftId.localeCompare(rightId);
  });
}

type OrdersDatasetFilters = {
  status: string | null;
  countryCode: string | null;
  salesChannel: string[];
  warning: OrdersWarningFilterOption | null;
  notification: OrdersNotificationFilterOption | null;
};

function matchesOrdersDatasetFilters(
  row: Record<string, unknown>,
  filters: OrdersDatasetFilters
) {
  if (filters.status) {
    const normalizedStatus = normalizeOrderStatus(row.status);
    if (normalizedStatus !== filters.status) {
      return false;
    }
  }

  if (filters.countryCode) {
    const countryCode =
      normalizeCountryCode(row.customer_country_code) ||
      normalizeCountryCode(String(row.sales_channel_id ?? "").slice(-2));
    if (countryCode !== filters.countryCode) {
      return false;
    }
  }

  if (filters.salesChannel.length > 0) {
    const normalizedPlatformName = normalizeFilterText(
      normalizeOrderPlatformName({
        salesChannelName: row.sales_channel_name,
        salesChannelId: row.sales_channel_id,
      })
    );
    if (!filters.salesChannel.includes(normalizedPlatformName)) {
      return false;
    }
  }

  if (filters.warning === "delayed" && !Boolean(row.is_delayed)) {
    return false;
  }
  if (filters.warning === "on_time" && Boolean(row.is_delayed)) {
    return false;
  }

  if (filters.notification) {
    const hasNotification = Boolean(
      String(row.latest_notification_name ?? "").trim() ||
        String(row.latest_notification_sent_at ?? "").trim()
    );
    if (filters.notification === "have" && !hasNotification) {
      return false;
    }
    if (filters.notification === "none" && hasNotification) {
      return false;
    }
  }

  return true;
}

async function findOrderIdsBySkuSpuOrTracking(
  adminClient: AdminClient,
  query: string
) {
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

  const { data: trackingRows, error: trackingError } = await adminClient
    .from("order_tracking_numbers_global")
    .select("order_id")
    .ilike("tracking_number", like)
    .not("order_id", "is", null);

  if (trackingError) {
    throw new Error(
      trackingError.message || "Unable to search orders by tracking number."
    );
  }

  (trackingRows ?? []).forEach((row) => {
    const orderId = normalizeBigintId((row as { order_id?: unknown }).order_id);
    if (orderId) orderIdSet.add(orderId);
  });

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
  const statusFilterRaw = String(searchParams.get("status") ?? "")
    .trim()
    .toLowerCase();
  const statusFilter =
    statusFilterRaw && statusFilterRaw !== "all"
      ? normalizeOrderStatus(statusFilterRaw)
      : null;
  const countryFilter = parseCountryFilter(searchParams.get("country"));
  const salesChannelFilters = parseSalesChannelFilters(
    searchParams.getAll("sales_channel")
  );
  const salesChannelOrClauses = buildSalesChannelOrClauses(salesChannelFilters);
  const warningFilter = parseOrdersWarningFilter(searchParams.get("warning"));
  const notificationFilter = parseOrdersNotificationFilter(
    searchParams.get("notification")
  );
  const canFilterNotificationInDb = Boolean(notificationFilter) && (
    notificationColumns.latestNotificationSentAt ||
    notificationColumns.latestNotificationName
  );
  const requiresPostNotificationFilter =
    Boolean(notificationFilter) && !canFilterNotificationInDb;
  const datasetFilters: OrdersDatasetFilters = {
    status: statusFilter ?? null,
    countryCode: countryFilter,
    salesChannel: salesChannelFilters,
    warning: warningFilter,
    notification: requiresPostNotificationFilter ? notificationFilter : null,
  };
  const hasDatasetLevelFilters = Boolean(
    countryFilter || warningFilter || requiresPostNotificationFilter
  );
  const hasStatusFilter =
    includeStatus &&
    Boolean(statusFilter) &&
    ORDER_STATUS_VALUES.includes(statusFilter as (typeof ORDER_STATUS_VALUES)[number]);
  const requiresPostStatusFilter = Boolean(statusFilter) && !hasStatusFilter;
  const hasPostProcessingFilters = Boolean(
    hasDatasetLevelFilters || requiresPostStatusFilter
  );
  const sortOption = parseOrdersSortOption(searchParams.get("date_sort"));
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE
  );
  const pageSize = parsePositiveInteger(
    searchParams.get("page_size"),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;
  const sortByShippedDate =
    sortOption === "shipped_asc" || sortOption === "shipped_desc";
  const sortColumn = sortByShippedDate ? "date_shipped" : "transaction_date";
  const sortAscending =
    sortOption === "transaction_asc" || sortOption === "shipped_asc";
  const orderFieldSearch = query
    ? `order_number.ilike.%${query}%,customer_name.ilike.%${query}%,customer_email.ilike.%${query}%,customer_address.ilike.%${query}%`
    : null;
  let itemMatchedOrderIds: string[] = [];
  if (query) {
    try {
      itemMatchedOrderIds = await findOrderIdsBySkuSpuOrTracking(
        adminClient,
        query
      );
    } catch (searchError) {
      return NextResponse.json(
        {
          error:
            searchError instanceof Error
              ? searchError.message
              : "Unable to search orders by SKU/SPU/tracking number.",
        },
        { status: 500 }
      );
    }
  }

  const applyFilters = <
    T extends {
      gte: (column: string, value: string) => T;
      lte: (column: string, value: string) => T;
      like: (column: string, pattern: string) => T;
      eq: (column: string, value: string) => T;
      is: (column: string, value: null) => T;
      not: (column: string, operator: string, value: unknown) => T;
      neq: (column: string, value: string) => T;
      or: (filters: string) => T;
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
    if (shippedFrom || shippedTo) {
      next = next
        .not("date_shipped", "is", null)
        .neq("date_shipped", "")
        .like("date_shipped", "____-__-__");
    }
    if (shippedFrom) {
      next = next.gte("date_shipped", shippedFrom);
    }
    if (shippedTo) {
      next = next.lte("date_shipped", shippedTo);
    }
    if (hasStatusFilter && statusFilter) {
      next = next.eq("status", statusFilter);
    }
    if (salesChannelOrClauses.length > 0) {
      next = next.or(salesChannelOrClauses.join(","));
    }
    if (notificationFilter && canFilterNotificationInDb) {
      if (notificationColumns.latestNotificationSentAt) {
        if (notificationFilter === "have") {
          next = next.not("latest_notification_sent_at", "is", null);
        } else {
          next = next.is("latest_notification_sent_at", null);
        }
      } else if (notificationColumns.latestNotificationName) {
        if (notificationFilter === "have") {
          next = next.not("latest_notification_name", "is", null);
          next = next.neq("latest_notification_name", "");
        } else {
          next = next.is("latest_notification_name", null);
        }
      }
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
    const merged = new Map<string, Record<string, unknown>>();
    if (orderFieldSearch) {
      let offset = 0;
      while (true) {
        const { data: directRowsChunk, error: directRowsError } = await applyFilters(
          adminClient
            .from("orders_global")
            .select(selectColumns)
            .or(orderFieldSearch)
            .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
            .order("order_number", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + MAX_PAGE_SIZE - 1)
        );
        if (directRowsError) {
          error = directRowsError;
          break;
        }
        const rowsChunk =
          (directRowsChunk ?? []) as unknown as Array<Record<string, unknown>>;
        rowsChunk.forEach((row) => {
          const id = String((row as { id?: unknown }).id ?? "").trim();
          if (!id) return;
          merged.set(id, row);
        });
        if (rowsChunk.length < MAX_PAGE_SIZE) {
          break;
        }
        offset += MAX_PAGE_SIZE;
      }
    }

    if (!error && itemMatchedOrderIds.length > 0) {
      for (const orderIdChunk of chunkArray(itemMatchedOrderIds, 500)) {
        const { data: itemRows, error: itemRowsError } = await applyFilters(
          adminClient
            .from("orders_global")
            .select(selectColumns)
            .in("id", orderIdChunk)
            .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
            .order("order_number", { ascending: true })
            .order("id", { ascending: true })
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
      const sortedRows = sortOrderRows(Array.from(merged.values()), sortOption);
      count = sortedRows.length;
      data = hasPostProcessingFilters
        ? sortedRows
        : sortedRows.slice(rangeFrom, rangeTo + 1);
    }
  } else if (hasPostProcessingFilters) {
    const collectedRows: Array<Record<string, unknown>> = [];
    let offset = 0;
    while (true) {
      const { data: rowsChunk, error: rowsError } = await applyFilters(
        adminClient
          .from("orders_global")
          .select(selectColumns)
          .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
          .order("order_number", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + MAX_PAGE_SIZE - 1)
      );
      if (rowsError) {
        error = rowsError;
        break;
      }
      const normalizedChunk = (rowsChunk ?? []) as unknown as Array<
        Record<string, unknown>
      >;
      collectedRows.push(...normalizedChunk);
      if (normalizedChunk.length < MAX_PAGE_SIZE) {
        break;
      }
      offset += MAX_PAGE_SIZE;
    }
    if (!error) {
      data = collectedRows;
      count = collectedRows.length;
    }
  } else {
    const runRowsQuery = async (from: number, to: number) =>
      applyFilters(
        adminClient
          .from("orders_global")
          .select(selectColumns)
          .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
          .order("order_number", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      );

    const runCountQuery = async () => {
      let next = adminClient
        .from("orders_global")
        .select("id", { count: "planned", head: true });

      if (transactionFrom) {
        next = next.gte("transaction_date", transactionFrom);
      }
      if (transactionTo) {
        next = next.lte("transaction_date", transactionTo);
      }
      if (shippedFrom || shippedTo) {
        next = next
          .not("date_shipped", "is", null)
          .neq("date_shipped", "")
          .like("date_shipped", "____-__-__");
      }
      if (shippedFrom) {
        next = next.gte("date_shipped", shippedFrom);
      }
      if (shippedTo) {
        next = next.lte("date_shipped", shippedTo);
      }
      if (hasStatusFilter && statusFilter) {
        next = next.eq("status", statusFilter);
      }
      if (salesChannelOrClauses.length > 0) {
        next = next.or(salesChannelOrClauses.join(","));
      }
      if (notificationFilter && canFilterNotificationInDb) {
        if (notificationColumns.latestNotificationSentAt) {
          if (notificationFilter === "have") {
            next = next.not("latest_notification_sent_at", "is", null);
          } else {
            next = next.is("latest_notification_sent_at", null);
          }
        } else if (notificationColumns.latestNotificationName) {
          if (notificationFilter === "have") {
            next = next.not("latest_notification_name", "is", null);
            next = next.neq("latest_notification_name", "");
          } else {
            next = next.is("latest_notification_name", null);
          }
        }
      }
      return next;
    };

    const rowsResult = await runRowsQuery(rangeFrom, rangeTo);
    const countResult = await runCountQuery();
    const rows = rowsResult.data;
    const rowsError = rowsResult.error;
    const rowsCount = countResult.count;
    const rowsCountError = countResult.error;

    data = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    error = rowsError || rowsCountError;
    count = rowsCount;

    if (
      !rowsError &&
      rowsCountError &&
      isStatementTimeoutError(rowsCountError.message)
    ) {
      error = null;
      count = null;
    }

    if (error && isStatementTimeoutError(error.message) && pageSize > 250) {
      const chunkedRows: Array<Record<string, unknown>> = [];
      let chunkError: { message: string } | null = null;
      for (let start = rangeFrom; start <= rangeTo; start += 250) {
        const end = Math.min(rangeTo, start + 249);
        const { data: chunkRows, error: chunkRowsError } = await runRowsQuery(
          start,
          end
        );
        if (chunkRowsError) {
          chunkError = chunkRowsError;
          break;
        }
        chunkedRows.push(
          ...((chunkRows ?? []) as unknown as Array<Record<string, unknown>>)
        );
      }

      if (!chunkError) {
        data = chunkedRows;
        error = null;
      }
    }

    if (!error && (typeof count !== "number" || !Number.isFinite(count))) {
      count = rangeFrom + data.length + (data.length >= pageSize ? 1 : 0);
    }
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

  const filteredItemsWithNotification = hasPostProcessingFilters
    ? itemsWithNotificationFallback.filter((item) =>
        matchesOrdersDatasetFilters(item as Record<string, unknown>, datasetFilters)
      )
    : itemsWithNotificationFallback;

  const orderValueById = new Map<string, number>();
  const orderIdsForValues = Array.from(
    new Set(
      filteredItemsWithNotification
        .map((item) => normalizeBigintId((item as Record<string, unknown>).id))
        .filter((entry): entry is string => Boolean(entry))
    )
  );

  if (orderIdsForValues.length > 0) {
    for (const orderIdChunk of chunkArray(orderIdsForValues, 500)) {
      const { data: itemRows, error: itemRowsError } = await adminClient
        .from("order_items_global")
        .select("order_id,sales_value_eur")
        .in("order_id", orderIdChunk);

      if (itemRowsError) {
        return NextResponse.json(
          { error: itemRowsError.message },
          { status: 500 }
        );
      }

      ((itemRows ?? []) as Array<{ order_id?: unknown; sales_value_eur?: unknown }>).forEach(
        (entry) => {
          const orderId = normalizeBigintId(entry.order_id);
          if (!orderId) return;
          const amount = Number(entry.sales_value_eur ?? 0);
          if (!Number.isFinite(amount)) return;
          orderValueById.set(orderId, (orderValueById.get(orderId) ?? 0) + amount);
        }
      );
    }
  }

  const itemsWithOrderValue = filteredItemsWithNotification.map((item) => {
    const row = item as Record<string, unknown>;
    const orderId = normalizeBigintId(row.id);
    const orderTotalValue = orderId ? orderValueById.get(orderId) ?? null : null;
    return {
      ...row,
      order_total_value: orderTotalValue,
    };
  });

  const pagedItems = hasPostProcessingFilters
    ? itemsWithOrderValue.slice(rangeFrom, rangeTo + 1)
    : itemsWithOrderValue;
  const normalizedCount =
    hasPostProcessingFilters
      ? itemsWithOrderValue.length
      : typeof count === "number" && Number.isFinite(count)
        ? count
        : 0;
  const pageCount =
    normalizedCount > 0 ? Math.ceil(normalizedCount / pageSize) : 0;
  const hasVisibleRange = normalizedCount > 0 && rangeFrom < normalizedCount;
  const from = hasVisibleRange ? rangeFrom + 1 : 0;
  const to = hasVisibleRange ? Math.min(rangeTo + 1, normalizedCount) : 0;

  const partnerInformedOrderIds = new Set<string>();
  const pagedOrderIds = Array.from(
    new Set(
      pagedItems
        .map((item) => normalizeBigintId((item as Record<string, unknown>).id))
        .filter((entry): entry is string => Boolean(entry))
    )
  );

  if (sendpulseHistoryColumns.orderId && pagedOrderIds.length > 0) {
    const partnerTemplateIds = new Set<string>();
    try {
      const { data: partnerTemplates } = await adminClient
        .from("partner_email_templates")
        .select("template_id,name");
      ((partnerTemplates ?? []) as Array<{ template_id?: unknown; name?: unknown }>).forEach((row) => {
        const templateId = String(row.template_id ?? "").trim();
        const templateNameToken = normalizeToken(row.name);
        if (
          (templateId && PARTNER_INFORMED_TEMPLATE_IDS.has(templateId)) ||
          (templateNameToken && PARTNER_INFORMED_TEMPLATE_NAMES.has(templateNameToken))
        ) {
          if (templateId) partnerTemplateIds.add(templateId);
        }
      });
    } catch {
      // Non-blocking: keep partner informed as false if template metadata lookup fails.
    }

    const sendpulseHistorySelectColumns = [
      "order_id",
      "status",
      "created_at",
      sendpulseHistoryColumns.sendDate ? "send_date" : null,
      sendpulseHistoryColumns.notificationName ? "notification_name" : null,
      sendpulseHistoryColumns.templateId ? "template_id" : null,
      sendpulseHistoryColumns.recipientEmail ? "recipient_email" : null,
      sendpulseHistoryColumns.variables ? "variables" : null,
    ]
      .filter(Boolean)
      .join(",");

    for (const orderIdChunk of chunkArray(pagedOrderIds, 500)) {
      const { data: historyRows, error: historyError } = await adminClient
        .from("sendpulse_email_logs")
        .select(sendpulseHistorySelectColumns)
        .in("order_id", orderIdChunk)
        .order("created_at", { ascending: false });

      if (historyError) {
        break;
      }

      ((historyRows ?? []) as unknown as Array<Record<string, unknown>>).forEach((entry) => {
        const orderId = normalizeBigintId(entry.order_id);
        if (!orderId || partnerInformedOrderIds.has(orderId)) return;

        const statusToken = normalizeToken(entry.status);
        if (statusToken && statusToken !== "sent" && statusToken !== "success") {
          return;
        }

        const notificationNameToken = normalizeToken(entry.notification_name);
        const templateId = String(entry.template_id ?? "").trim();
        const templateIdToken = normalizeToken(templateId);
        const isMatchingTemplate =
          (templateId && partnerTemplateIds.has(templateId)) ||
          (templateIdToken && PARTNER_INFORMED_TEMPLATE_IDS.has(templateIdToken)) ||
          (notificationNameToken &&
            PARTNER_INFORMED_TEMPLATE_NAMES.has(notificationNameToken));
        if (!isMatchingTemplate) return;

        const recipientEmailToken = normalizeToken(entry.recipient_email);
        const variables = parseJsonObject(entry.variables);
        const receiverKeyToken = normalizeToken(variables?.partner_receiver_key);
        const receiverNameToken = normalizeToken(variables?.partner_receiver_name);
        const isMatchingReceiver =
          PARTNER_INFORMED_RECEIVER_EMAILS.has(recipientEmailToken) ||
          PARTNER_INFORMED_RECEIVER_KEYS.has(receiverKeyToken) ||
          PARTNER_INFORMED_RECEIVER_NAMES.has(receiverNameToken);
        if (!isMatchingReceiver) return;

        partnerInformedOrderIds.add(orderId);
      });
    }
  }

  const pagedItemsWithPartnerInformed = pagedItems.map((item) => {
    const row = item as Record<string, unknown>;
    const orderId = normalizeBigintId(row.id);
    return {
      ...row,
      partner_informed: orderId ? partnerInformedOrderIds.has(orderId) : false,
    };
  });

  return NextResponse.json({
    items: pagedItemsWithPartnerInformed,
    count: normalizedCount,
    page,
    pageSize,
    pageCount,
    from,
    to,
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
  const includeDateShipped = await hasOrdersDateShippedColumn(adminClient);
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
  const nextPatch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "pending" && includeDateShipped) {
    nextPatch.date_shipped = null;
  }
  let data: Array<{ id: unknown }> | null = null;
  let error: { message: string } | null = null;
  if (includeDateShipped) {
    const { data: nextData, error: nextError } = await adminClient
      .from("orders_global")
      .update(nextPatch)
      .in("id", orderIds)
      .select("id,status,date_shipped");
    data = (nextData ?? []) as Array<{ id: unknown }>;
    error = nextError;
  } else {
    const { data: nextData, error: nextError } = await adminClient
      .from("orders_global")
      .update(nextPatch)
      .in("id", orderIds)
      .select("id,status");
    data = (nextData ?? []) as Array<{ id: unknown }>;
    error = nextError;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updatedRows = Array.isArray(data) ? data : [];

  return NextResponse.json({
    updated: updatedRows.length,
    ids: updatedRows.map((row) => String(row.id)),
    status: nextStatus,
    dateShippedCleared: nextStatus === "pending" && includeDateShipped,
  });
}
