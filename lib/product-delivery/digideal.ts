export const DIGIDEAL_DELIVERY_LIST_PREFIX = "digideal_delivery::";

export const isDigiDealDeliveryListName = (value: string | null | undefined) =>
  String(value ?? "").startsWith(DIGIDEAL_DELIVERY_LIST_PREFIX);

export const toStoredDigiDealDeliveryListName = (displayName: string) =>
  `${DIGIDEAL_DELIVERY_LIST_PREFIX}${displayName.trim()}`;

export const toDisplayDigiDealDeliveryListName = (storedName: string | null | undefined) => {
  const value = String(storedName ?? "").trim();
  if (!value) return "";
  if (!value.startsWith(DIGIDEAL_DELIVERY_LIST_PREFIX)) return value;
  return value.slice(DIGIDEAL_DELIVERY_LIST_PREFIX.length).trim();
};
