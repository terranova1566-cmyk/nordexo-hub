import * as HtmlParser from "next/dist/compiled/node-html-parser";
import type { AmazonProductCard, AmazonProvider } from "@/lib/amazon/types";

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parsePriceAmount = (value: string): number | null => {
  const cleaned = value
    .replace(/[^\d.,-]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    normalized = cleaned.replace(/,/g, ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const currencyFromPriceText = (text: string) => {
  const t = String(text || "");
  const hasCode = (code: string) =>
    new RegExp(`\\b${code}\\b|${code}(?=\\s*[-+]?\\d)`, "i").test(t);

  if (hasCode("SEK")) return "SEK";
  if (hasCode("EUR")) return "EUR";
  if (hasCode("USD")) return "USD";
  if (hasCode("GBP")) return "GBP";
  if (hasCode("NOK")) return "NOK";
  if (hasCode("DKK")) return "DKK";
  if (/\$/.test(text)) return "USD";
  if (/£/.test(text)) return "GBP";
  if (/€/.test(text)) return "EUR";
  return null;
};

const baseHostForDomain = (domain: string) => {
  const d = (domain || "com").toLowerCase();
  if (d === "com") return "https://www.amazon.com";
  return `https://www.amazon.${d}`;
};

const absolutizeHref = (domain: string, href: string) => {
  const h = href.trim();
  if (!h) return "";
  if (/^https?:\/\//i.test(h)) return h;
  const base = baseHostForDomain(domain);
  if (h.startsWith("/")) return `${base}${h}`;
  return `${base}/${h}`;
};

const pickProductLink = (el: any) => {
  const links = el?.querySelectorAll?.("a") ?? [];
  for (const a of links) {
    const href = asString(a.getAttribute?.("href"));
    if (!href) continue;
    if (/\/dp\/[A-Z0-9]{10}/i.test(href)) return { a, href };
    if (/\/gp\/product\/[A-Z0-9]{10}/i.test(href)) return { a, href };
  }
  // Fallback: first link.
  const first = links[0];
  const href = first ? asString(first.getAttribute?.("href")) : "";
  return href ? { a: first, href } : null;
};

const pickTitle = (el: any, linkEl: any) => {
  const linkSpan = linkEl?.querySelector?.("span");
  const t1 = asString(linkSpan?.text);
  if (t1) return t1;

  const h2 = el?.querySelector?.("h2");
  const t2 = asString(h2?.text);
  if (t2) return t2;

  const img = el?.querySelector?.("img");
  const alt = asString(img?.getAttribute?.("alt"));
  if (alt) return alt;

  const t3 = asString(linkEl?.text);
  return t3 || "";
};

const pickImageUrl = (el: any, linkEl: any) => {
  const img =
    linkEl?.querySelector?.("img") ?? el?.querySelector?.("img") ?? null;
  if (!img) return "";
  const direct =
    asString(img.getAttribute?.("src")) ||
    asString(img.getAttribute?.("data-src")) ||
    asString(img.getAttribute?.("data-lazy-src"));
  if (direct && !direct.startsWith("data:")) return direct;

  const dyn = asString(img.getAttribute?.("data-a-dynamic-image"));
  if (dyn) {
    try {
      const parsed = JSON.parse(dyn) as Record<string, unknown>;
      const firstUrl = Object.keys(parsed)[0];
      if (firstUrl) return firstUrl;
    } catch {
      // ignore
    }
  }
  return "";
};

const pickPrice = (el: any) => {
  const priceEl = el?.querySelector?.(".a-offscreen") ?? null;
  const priceText = asString(priceEl?.text);
  if (!priceText) return { amount: null as number | null, currency: null as string | null };
  return {
    amount: parsePriceAmount(priceText),
    currency: currencyFromPriceText(priceText),
  };
};

const normalizeAsin = (value: string) => {
  const asin = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
};

type ExtractOptions = {
  domain: string;
  sourceUrl: string | null;
  sourceType: AmazonProductCard["sourceType"];
  sourceAsin: string | null;
  maxItems: number;
  provider?: AmazonProvider;
};

export const extractAmazonProductCardsFromHtml = (
  html: string,
  opts: ExtractOptions
) => {
  const root = HtmlParser.parse(String(html || ""));
  const maxItems = Math.max(1, Math.trunc(opts.maxItems || 1));
  const provider: AmazonProvider = opts.provider ?? "oxylabs";

  const candidates: any[] = [];

  // Search results.
  candidates.push(
    ...(root.querySelectorAll?.(
      'div[data-component-type="s-search-result"][data-asin]'
    ) ?? [])
  );

  // Carousels ("Customers also bought", etc).
  if (candidates.length === 0) {
    candidates.push(
      ...(root.querySelectorAll?.("li.a-carousel-card[data-asin]") ?? []),
      ...(root.querySelectorAll?.("div.a-carousel-card[data-asin]") ?? [])
    );
  }

  // Last resort: anything with a data-asin attribute.
  if (candidates.length === 0) {
    candidates.push(...(root.querySelectorAll?.("[data-asin]") ?? []));
  }

  const seen = new Set<string>();
  const out: AmazonProductCard[] = [];

  for (const el of candidates) {
    if (out.length >= maxItems) break;
    const asin = normalizeAsin(asString(el.getAttribute?.("data-asin")));
    if (!asin) continue;

    const link = pickProductLink(el);
    const extractedUrl = link?.href ? absolutizeHref(opts.domain, link.href) : "";
    const canonicalUrl = `${baseHostForDomain(opts.domain)}/dp/${asin}`;
    const key = canonicalUrl || extractedUrl || asin;
    if (!key || seen.has(key)) continue;

    const title = pickTitle(el, link?.a);
    const imageUrl = pickImageUrl(el, link?.a);
    const price = pickPrice(el);

    out.push({
      asin,
      domain: opts.domain,
      productUrl: canonicalUrl,
      title: title || null,
      imageUrl: imageUrl || null,
      price,
      sourceUrl: opts.sourceUrl,
      sourceType: opts.sourceType,
      sourceAsin: opts.sourceAsin,
      provider,
      raw: { asin, extracted_from: "html", extracted_url: extractedUrl || null },
    });

    seen.add(key);
  }

  return out;
};
