export type OrderContentListItemInput = {
  quantity?: unknown;
  product_title?: unknown;
  title?: unknown;
  sku?: unknown;
  raw_row?: unknown;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const rawRowTitleKeys = [
  "Product title",
  "Product Title",
  "product_title",
  "productTitle",
  "Title",
  "title",
  "Product name",
  "Product Name",
  "product_name",
  "productName",
  "Item name",
  "Item Name",
  "item_name",
  "itemName",
  "Ignore",
  "Ignore2",
];

const resolveRawRowTitle = (rawRow: unknown) => {
  if (!rawRow || typeof rawRow !== "object") return "";
  const row = rawRow as Record<string, unknown>;
  for (const key of rawRowTitleKeys) {
    const value = normalizeText(row[key]);
    if (!value) continue;
    return value;
  }
  return "";
};

const resolveTitle = (item: OrderContentListItemInput) => {
  const directTitle = normalizeText(item.product_title || item.title);
  if (directTitle) return directTitle;
  const rawRowTitle = resolveRawRowTitle(item.raw_row);
  if (rawRowTitle) return rawRowTitle;
  const sku = normalizeText(item.sku);
  if (sku) return sku;
  return "Item";
};

const resolveQuantity = (value: unknown) => {
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return Number.isInteger(asNumber) ? String(asNumber) : String(asNumber);
  }
  const text = normalizeText(value);
  if (text) return text;
  return "1";
};

export function formatOrderContentList(items: OrderContentListItemInput[]): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) =>
      `${escapeHtml(resolveQuantity(item.quantity))} x ${escapeHtml(
        resolveTitle(item)
      )}`
    )
    .join("<br />");
}
