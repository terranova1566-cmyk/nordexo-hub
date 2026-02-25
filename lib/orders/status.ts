export const ORDER_STATUS = {
  PENDING: "pending",
  PURCHASED: "purchased",
  BEING_PACKED_AND_SHIPPED: "being_packed_and_shipped",
  SHIPPED: "shipped",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_VALUES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.PURCHASED,
  ORDER_STATUS.BEING_PACKED_AND_SHIPPED,
  ORDER_STATUS.SHIPPED,
] as const;

export const DEFAULT_ORDER_DELAY_WARNING_DAYS = 7;

const ORDER_STATUS_PRIORITY: Record<OrderStatus, number> = {
  [ORDER_STATUS.PENDING]: 1,
  [ORDER_STATUS.PURCHASED]: 2,
  [ORDER_STATUS.BEING_PACKED_AND_SHIPPED]: 3,
  [ORDER_STATUS.SHIPPED]: 4,
};

const ORDER_STATUS_ALIASES: Record<string, OrderStatus> = {
  pending: ORDER_STATUS.PENDING,
  purchased: ORDER_STATUS.PURCHASED,
  beingpackedandshipped: ORDER_STATUS.BEING_PACKED_AND_SHIPPED,
  packingandshipping: ORDER_STATUS.BEING_PACKED_AND_SHIPPED,
  shipped: ORDER_STATUS.SHIPPED,
};

function parseDateToUtcMs(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return Date.UTC(year, month - 1, day);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  );
}

function normalizeOrderStatusToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");
}

export function normalizeOrderStatus(
  value: unknown,
  fallback: OrderStatus = ORDER_STATUS.SHIPPED
): OrderStatus {
  const token = normalizeOrderStatusToken(value);
  return ORDER_STATUS_ALIASES[token] ?? fallback;
}

export function pickHigherPriorityOrderStatus(
  current: unknown,
  incoming: unknown,
  fallback: OrderStatus = ORDER_STATUS.SHIPPED
) {
  const currentStatus = normalizeOrderStatus(current, fallback);
  const incomingStatus = normalizeOrderStatus(incoming, fallback);
  return ORDER_STATUS_PRIORITY[currentStatus] >= ORDER_STATUS_PRIORITY[incomingStatus]
    ? currentStatus
    : incomingStatus;
}

export function isOpenOrderStatus(status: unknown) {
  return normalizeOrderStatus(status) !== ORDER_STATUS.SHIPPED;
}

export function resolveOrderDelayWarning(
  transactionDate: string | null | undefined,
  status: unknown,
  warningDays = DEFAULT_ORDER_DELAY_WARNING_DAYS,
  now = new Date()
) {
  const normalizedStatus = normalizeOrderStatus(status);
  if (!isOpenOrderStatus(normalizedStatus)) {
    return { isDelayed: false, delayDays: null };
  }

  const transactionUtcMs = parseDateToUtcMs(transactionDate);
  if (!transactionUtcMs) {
    return { isDelayed: false, delayDays: null };
  }

  const nowUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.floor((nowUtcMs - transactionUtcMs) / (24 * 60 * 60 * 1000));
  const delayDays = Math.max(diffDays, 0);
  return {
    isDelayed: delayDays > warningDays,
    delayDays,
  };
}

export function inferOrderStatusWithoutStatusColumn(input: {
  date_shipped?: unknown;
  raw_row?: unknown;
}) {
  const shippedDate = String(input.date_shipped ?? "").trim();
  if (shippedDate) {
    return ORDER_STATUS.SHIPPED;
  }

  const rawRow =
    typeof input.raw_row === "object" && input.raw_row !== null
      ? (input.raw_row as Record<string, unknown>)
      : null;
  if (!rawRow) {
    return ORDER_STATUS.SHIPPED;
  }

  const normalizedKeys = new Set(
    Object.keys(rawRow).map((key) => key.trim().toLowerCase())
  );

  // Legacy shipped template always carries these headers, even when values are blank.
  if (normalizedKeys.has("date shipped") || normalizedKeys.has("tracking number")) {
    return ORDER_STATUS.SHIPPED;
  }

  return ORDER_STATUS.PENDING;
}
