const LEGACY_SHOPIFY_SALES_CHANNEL_ID_MAP: Record<string, string> = {
  "SH-TI": "TI-SE",
  "SH-WL": "WL-SE",
  "SH-SP": "SK-SE",
};

const normalizeToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export function normalizeIncomingSalesChannelId(value: unknown) {
  const normalized = normalizeToken(value);
  if (!normalized) return "";
  return LEGACY_SHOPIFY_SALES_CHANNEL_ID_MAP[normalized] ?? normalized;
}

export function getLegacyShopifySalesChannelIdMappings() {
  return { ...LEGACY_SHOPIFY_SALES_CHANNEL_ID_MAP };
}

