export type AmazonDomain = "com" | "co.uk" | "de" | "fr" | "it" | "es" | "ca" | "co.jp" | "com.au";

export const amazonBaseHostForDomain = (domain: AmazonDomain) => {
  const d = (domain || "com").toLowerCase() as AmazonDomain;
  return d === "com" ? "www.amazon.com" : `www.amazon.${d}`;
};

export const amazonBaseUrlForDomain = (domain: AmazonDomain) =>
  `https://${amazonBaseHostForDomain(domain)}`;

export const canonicalAmazonProductUrl = (domain: AmazonDomain, asin: string) => {
  const a = String(asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(a)) return null;
  return `${amazonBaseUrlForDomain(domain)}/dp/${a}`;
};

export const inferAmazonDomain = (rawUrl: string): AmazonDomain => {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("amazon.co.uk")) return "co.uk";
    if (host.endsWith("amazon.de")) return "de";
    if (host.endsWith("amazon.fr")) return "fr";
    if (host.endsWith("amazon.it")) return "it";
    if (host.endsWith("amazon.es")) return "es";
    if (host.endsWith("amazon.ca")) return "ca";
    if (host.endsWith("amazon.co.jp")) return "co.jp";
    if (host.endsWith("amazon.com.au")) return "com.au";
    return "com";
  } catch {
    return "com";
  }
};

export const extractAsinFromUrl = (rawUrl: string): string | null => {
  const text = String(rawUrl || "").trim();
  if (!text) return null;

  // Common patterns:
  // - /dp/B000000000
  // - /gp/product/B000000000
  // - /product/B000000000
  const match =
    text.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i) ||
    text.match(/\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i) ||
    text.match(/\/product\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match?.[1] ? match[1].toUpperCase() : null;
};

export const normalizeAmazonProductUrl = (rawUrl: string) => {
  const asin = extractAsinFromUrl(rawUrl);
  const domain = inferAmazonDomain(rawUrl);
  const canonical = asin ? canonicalAmazonProductUrl(domain, asin) : null;
  return { asin, domain, canonicalUrl: canonical };
};

export const canonicalizeAmazonProductUrl = (rawUrl: string) =>
  normalizeAmazonProductUrl(rawUrl).canonicalUrl || String(rawUrl || "").trim();

export const parseAmazonUrls = (raw: string): string[] => {
  return String(raw || "")
    .split(/[\n,]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
};
