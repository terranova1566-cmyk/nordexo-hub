export const ORDER_IMPORT_PENDING_HEADERS = [
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
] as const;

export const ORDER_IMPORT_SHIPPED_HEADERS = [
  ...ORDER_IMPORT_PENDING_HEADERS,
  "Date shipped",
  "Ignore3",
  "Ignore4",
  "Ignore5",
  "Ignore6",
  "Ignore7",
  "Ignore8",
  "Tracking number",
] as const;

// Backward compatibility for code paths still importing the previous symbol.
export const ORDER_IMPORT_HEADERS = ORDER_IMPORT_SHIPPED_HEADERS;
