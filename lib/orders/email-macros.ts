import { normalizeOrderPlatformName } from "@/lib/orders/platform";

type OrderEmailMacroInput = {
  id?: unknown;
  order_number?: unknown;
  preferred_order_id?: unknown;
  transaction_date?: unknown;
  date_shipped?: unknown;
  tracking_number?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  sales_channel_id?: unknown;
  sales_channel_name?: unknown;
  sales_channel_order_number?: unknown;
  marketplace_order_number?: unknown;
  status?: unknown;
  order_content_list?: unknown;
};

type OrderReferenceItemInput = {
  sales_channel_order_number?: unknown;
  marketplace_order_number?: unknown;
};

const dateYmdPattern = /^\d{4}-\d{2}-\d{2}$/;

const normalizeText = (value: unknown) => String(value ?? "").trim();
const marketplaceDividerPattern = /\s-\s/;

const normalizeMarketplaceOrderNumber = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const dividerMatch = normalized.match(marketplaceDividerPattern);
  if (!dividerMatch || dividerMatch.index === undefined) return normalized;
  const leftPart = normalized.slice(0, dividerMatch.index).trim();
  return leftPart || normalized;
};

const normalizeDateText = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (dateYmdPattern.test(raw)) return raw;
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s].*$/);
  if (isoPrefix) return isoPrefix[1];
  return raw;
};

export function resolvePreferredOrderIdFromItems(items: OrderReferenceItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) return "";
  let marketplaceOrder = "";
  let salesChannelOrder = "";

  for (const item of items) {
    if (!marketplaceOrder) {
      marketplaceOrder = normalizeMarketplaceOrderNumber(
        item.marketplace_order_number
      );
    }
    if (!salesChannelOrder) {
      salesChannelOrder = normalizeText(item.sales_channel_order_number);
    }
    if (marketplaceOrder && salesChannelOrder) break;
  }

  return marketplaceOrder || salesChannelOrder || "";
}

export function buildOrderEmailMacroVariables(input: OrderEmailMacroInput) {
  const salesChannelName = normalizeText(input.sales_channel_name);
  const salesChannelId = normalizeText(input.sales_channel_id);
  const normalizedPlatformName = normalizeOrderPlatformName({
    salesChannelName,
    salesChannelId,
  });
  const platformName = normalizedPlatformName || salesChannelName || salesChannelId;
  const platformId = salesChannelId;

  const transactionDate = normalizeDateText(input.transaction_date);
  const dateShipped = normalizeDateText(input.date_shipped);
  const trackingNumber = normalizeText(input.tracking_number);
  const originalOrderNumber = normalizeText(input.order_number);
  const preferredOrderId = normalizeText(input.preferred_order_id);
  const salesChannelOrderNumber = normalizeText(input.sales_channel_order_number);
  const marketplaceOrderNumber = normalizeMarketplaceOrderNumber(
    input.marketplace_order_number
  );
  const resolvedOrderNumber =
    preferredOrderId ||
    marketplaceOrderNumber ||
    salesChannelOrderNumber ||
    originalOrderNumber;
  const ordersNumber = resolvedOrderNumber;
  const ordersCustomerName = normalizeText(input.customer_name);
  const ordersCustomerEmail = normalizeText(input.customer_email);
  const ordersStatus = normalizeText(input.status);
  const orderContentList = String(input.order_content_list ?? "");

  return {
    // Preferred naming for order workflows.
    orders_number: ordersNumber,
    orders_date: transactionDate,
    orders_transaction_date: transactionDate,
    orders_ship_date: dateShipped,
    orders_date_shipped: dateShipped,
    orders_tracking_number: trackingNumber,
    orders_customer_name: ordersCustomerName,
    orders_customer_email: ordersCustomerEmail,
    orders_status: ordersStatus,
    orders_platform_id: platformId,
    orders_platform_name: platformName,
    orders_sales_channel_id: platformId,
    orders_sales_channel_name: platformName,
    order_content_list: orderContentList,
    platform_id: platformId,
    platform_name: platformName,
    platform_seller_name: platformName,
    tracking_number: trackingNumber,

    // Legacy aliases retained for backward compatibility.
    orders_id: ordersNumber,
    order_id: ordersNumber,
    order_number: ordersNumber,
    transaction_date: transactionDate,
    date_shipped: dateShipped,
    ship_date: dateShipped,
    customer_name: ordersCustomerName,
    customer_email: ordersCustomerEmail,
    sales_channel_id: salesChannelId,
    sales_channel_name: platformName,
    platform: platformName,
    seller: platformName,
    seller_name: platformName,
    order_status: ordersStatus,
  };
}
