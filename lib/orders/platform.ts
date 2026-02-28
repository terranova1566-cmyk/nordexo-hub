type OrderPlatformInput = {
  salesChannelName?: unknown;
  salesChannelId?: unknown;
};

const normalizeWhitespace = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const collapseRepeatedPhrase = (value: string) => {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return "";
  const repeated = trimmed.match(/^(.+?)\s+\1$/i);
  if (repeated?.[1]) {
    return normalizeWhitespace(repeated[1]);
  }
  return trimmed;
};

export function normalizeOrderPlatformName(input: OrderPlatformInput): string {
  const rawName = normalizeWhitespace(input.salesChannelName);
  const rawId = normalizeWhitespace(input.salesChannelId);
  const fingerprint = `${rawName} ${rawId}`.toLowerCase();

  if (/lets\s*deal/.test(fingerprint)) return "LetsDeal";
  if (/offerilla/.test(fingerprint)) return "Offerilla";
  if (/digideal/.test(fingerprint)) return "Digideal";
  if (/sparklar/.test(fingerprint)) return "Sparklar";

  return collapseRepeatedPhrase(rawName || rawId);
}
