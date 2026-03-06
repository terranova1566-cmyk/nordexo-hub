export const DIGIDEAL_DELIVERY_LIST_PREFIX = "digideal_delivery::";
export const LETSDEAL_DELIVERY_LIST_PREFIX = "letsdeal_delivery::";

export type DeliveryPartner = "digideal" | "letsdeal";

export const DELIVERY_PARTNER_LABEL: Record<DeliveryPartner, string> = {
  digideal: "DigiDeal",
  letsdeal: "LetsDeal",
};

const DELIVERY_PREFIX_BY_PARTNER: Record<DeliveryPartner, string> = {
  digideal: DIGIDEAL_DELIVERY_LIST_PREFIX,
  letsdeal: LETSDEAL_DELIVERY_LIST_PREFIX,
};

const detectDeliveryPartner = (value: string | null | undefined) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  const compact = normalized.replace(/[\s._-]+/g, "");
  if (compact.includes("letsdeal")) return "letsdeal" as const;
  if (compact.includes("digideal")) return "digideal" as const;
  return null;
};

export const normalizeDeliveryPartner = (value: string | null | undefined) => {
  return detectDeliveryPartner(value);
};

export const resolveDeliveryPartnerFromListName = (
  value: string | null | undefined
): DeliveryPartner | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.startsWith(DIGIDEAL_DELIVERY_LIST_PREFIX)) return "digideal";
  if (text.startsWith(LETSDEAL_DELIVERY_LIST_PREFIX)) return "letsdeal";
  const detected = detectDeliveryPartner(text);
  if (detected) return detected;

  // Backward compatibility for older DigiDeal delivery list names.
  const lowered = text.toLowerCase();
  if (lowered.startsWith("delivery") || lowered.startsWith("leverans")) {
    return "digideal";
  }
  return null;
};

export const deliveryPartnerLabel = (value: string | null | undefined) => {
  const partner = normalizeDeliveryPartner(value) ?? resolveDeliveryPartnerFromListName(value);
  if (!partner) return DELIVERY_PARTNER_LABEL.digideal;
  return DELIVERY_PARTNER_LABEL[partner];
};

export const isDeliveryListName = (value: string | null | undefined) =>
  resolveDeliveryPartnerFromListName(value) !== null;

export const isDeliveryListNameForPartner = (
  value: string | null | undefined,
  partner: DeliveryPartner
) => {
  const prefix = DELIVERY_PREFIX_BY_PARTNER[partner];
  return String(value ?? "").startsWith(prefix);
};

export const toStoredDeliveryListName = (
  displayName: string,
  partner: DeliveryPartner
) => `${DELIVERY_PREFIX_BY_PARTNER[partner]}${displayName.trim()}`;

export const toDisplayDeliveryListName = (storedName: string | null | undefined) => {
  const value = String(storedName ?? "").trim();
  if (!value) return "";
  const partner = resolveDeliveryPartnerFromListName(value);
  if (!partner) return value;
  return value.slice(DELIVERY_PREFIX_BY_PARTNER[partner].length).trim();
};

export const isDigiDealDeliveryListName = (value: string | null | undefined) =>
  isDeliveryListNameForPartner(value, "digideal");

export const toStoredDigiDealDeliveryListName = (displayName: string) =>
  toStoredDeliveryListName(displayName, "digideal");

export const toDisplayDigiDealDeliveryListName = (storedName: string | null | undefined) => {
  return toDisplayDeliveryListName(storedName);
};
