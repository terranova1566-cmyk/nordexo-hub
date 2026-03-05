import * as HtmlParser from "next/dist/compiled/node-html-parser";
import { extractAsinFromUrl } from "@/lib/amazon/urls";
import type { AmazonMoney, AmazonProvider, AmazonVariant } from "@/lib/amazon/types";

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

const normalizeAsin = (value: string) => {
  const asin = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
};

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

const cleanText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

const unescapeJsonUrl = (value: string) =>
  value
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\\//g, "/");

const isAmazonMediaHost = (host: string) =>
  /(^|\.)media-amazon\.com$/i.test(String(host || "").toLowerCase());

const scoreAmazonImageSuffix = (suffix: string) => {
  const normalized = String(suffix || "").toUpperCase();
  if (!normalized) return 600;

  const numericParts = Array.from(normalized.matchAll(/(\d{2,4})/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  const maxNumeric = numericParts.length > 0 ? Math.max(...numericParts) : 0;

  let score = maxNumeric;
  if (/^S?L\d+/.test(normalized) || /^U?L\d+/.test(normalized)) {
    score += 3_000;
  } else if (/^[SU][XY]\d+/.test(normalized)) {
    score += 1_500;
  } else if (/^SS\d+/.test(normalized)) {
    score += 900;
  } else if (/^AC_/.test(normalized)) {
    score += 500;
  }

  if (normalized.includes("CR")) {
    // Cropped thumbnail variants are usually lower quality.
    score -= 150;
  }

  return score;
};

const parseAmazonMediaVariant = (value: string) => {
  try {
    const parsed = new URL(value);
    if (!isAmazonMediaHost(parsed.hostname)) return null;

    const fileName = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const extMatch = fileName.match(/\.(jpg|jpeg|png|webp)$/i);
    if (!extMatch) return null;
    const ext = extMatch[0].toLowerCase() === ".jpeg" ? ".jpg" : extMatch[0].toLowerCase();

    const stem = fileName.slice(0, -extMatch[0].length);
    const suffixMatch = stem.match(/^(.*)\._([^.]+)_$/);
    const baseStem = suffixMatch?.[1] ?? stem;
    const suffix = suffixMatch?.[2] ?? "";

    const key = `${parsed.origin}${parsed.pathname
      .replace(fileName, `${baseStem}${ext}`)
      .toLowerCase()}`;
    const score = scoreAmazonImageSuffix(suffix);
    return { key, score };
  } catch {
    return null;
  }
};

const extractText = (el: any) => cleanText(asString(el?.text));

const pickFirstText = (root: any, selectors: string[]) => {
  for (const sel of selectors) {
    const el = root.querySelector?.(sel);
    const t = extractText(el);
    if (t) return t;
  }
  return "";
};

const extractBulletPoints = (root: any): string[] => {
  const container =
    root.querySelector?.("#feature-bullets") ??
    root.querySelector?.("#featurebullets_feature_div") ??
    null;
  if (!container) return [];
  const items = container.querySelectorAll?.("li span.a-list-item") ?? [];
  const points = (items as any[]).map((el: any) => cleanText(extractText(el))) as string[];
  const cleaned = points
    .map((v) => v.replace(/^•\s*/g, "").trim())
    .filter(Boolean) as string[];
  return uniq(cleaned);
};

const extractDescription = (root: any) => {
  const el =
    root.querySelector?.("#productDescription") ??
    root.querySelector?.("#productDescription_feature_div") ??
    null;
  const t = cleanText(extractText(el));
  if (t) return t;

  const meta = root.querySelector?.('meta[name="description"]');
  const c = cleanText(asString(meta?.getAttribute?.("content")));
  return c || "";
};

const extractCanonicalUrl = (root: any, domain: string) => {
  const link = root.querySelector?.('link[rel="canonical"]');
  const href = asString(link?.getAttribute?.("href"));
  if (href) return absolutizeHref(domain, href);

  const og = root.querySelector?.('meta[property="og:url"]');
  const ogUrl = asString(og?.getAttribute?.("content"));
  if (ogUrl) return absolutizeHref(domain, ogUrl);

  return "";
};

const extractMainAsin = (root: any, fallbackUrl: string) => {
  const fromInput =
    normalizeAsin(asString(root.querySelector?.("input#ASIN")?.getAttribute?.("value"))) ||
    normalizeAsin(
      asString(root.querySelector?.('input[name="ASIN"]')?.getAttribute?.("value"))
    );
  if (fromInput) return fromInput;
  const fromUrl = extractAsinFromUrl(fallbackUrl);
  return fromUrl ? normalizeAsin(fromUrl) : "";
};

const extractPriceText = (root: any) => {
  const selectors = [
    "#corePriceDisplay_desktop_feature_div .a-offscreen",
    "#corePriceDisplay_mobile_feature_div .a-offscreen",
    "span#priceblock_ourprice",
    "span#priceblock_dealprice",
    "span#priceblock_saleprice",
    ".a-price .a-offscreen",
    "span.a-offscreen",
  ];
  for (const sel of selectors) {
    const el = root.querySelector?.(sel);
    const t = cleanText(extractText(el));
    if (t) return t;
  }
  return "";
};

const moneyFromPriceText = (priceText: string): AmazonMoney => ({
  amount: priceText ? parsePriceAmount(priceText) : null,
  currency: priceText ? currencyFromPriceText(priceText) : null,
});

const extractImages = (root: any, html: string) => {
  const raw: string[] = [];
  const pushRaw = (value: string) => {
    const next = String(value || "").trim();
    if (!next || !/^https?:\/\//i.test(next)) return;
    raw.push(next);
  };

  const landing = root.querySelector?.("img#landingImage");
  const dyn = asString(landing?.getAttribute?.("data-a-dynamic-image"));
  if (dyn) {
    try {
      const parsed = JSON.parse(dyn) as Record<string, unknown>;
      Object.keys(parsed).forEach((u) => {
        pushRaw(u);
      });
    } catch {
      // ignore
    }
  }

  const oldHires =
    asString(landing?.getAttribute?.("data-old-hires")) ||
    asString(landing?.getAttribute?.("src"));
  pushRaw(oldHires);

  const front = root.querySelector?.("img#imgBlkFront");
  const frontSrc =
    asString(front?.getAttribute?.("data-old-hires")) || asString(front?.getAttribute?.("src"));
  pushRaw(frontSrc);

  // Fallback: look for hi-res images embedded in JSON blobs.
  const blob = String(html || "");
  for (const match of blob.matchAll(/"hiRes"\s*:\s*"([^"]+)"/g)) {
    const u = unescapeJsonUrl(match[1] || "");
    pushRaw(u);
  }
  for (const match of blob.matchAll(/"large"\s*:\s*"([^"]+)"/g)) {
    const u = unescapeJsonUrl(match[1] || "");
    pushRaw(u);
  }

  const byKey = new Map<
    string,
    { groupOrder: number; candidateOrder: number; score: number; url: string }
  >();
  const seenRaw = new Set<string>();
  raw.forEach((url, index) => {
    if (seenRaw.has(url)) return;
    seenRaw.add(url);

    const parsedVariant = parseAmazonMediaVariant(url);
    const key = parsedVariant ? `amz:${parsedVariant.key}` : `raw:${url}`;
    const score = parsedVariant?.score ?? 0;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        groupOrder: index,
        candidateOrder: index,
        score,
        url,
      });
      return;
    }
    const shouldReplace =
      score > existing.score ||
      (score === existing.score && url.length > existing.url.length);
    if (shouldReplace) {
      byKey.set(key, {
        groupOrder: existing.groupOrder,
        candidateOrder: index,
        score,
        url,
      });
    }
  });

  return Array.from(byKey.values())
    .sort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      return a.candidateOrder - b.candidateOrder;
    })
    .map((row) => row.url);
};

const extractDetails = (root: any) => {
  const out: Record<string, string> = {};
  const push = (kRaw: string, vRaw: string) => {
    const k = cleanText(kRaw).replace(/:$/, "").trim();
    const v = cleanText(vRaw);
    if (!k || !v) return;
    if (!(k in out)) out[k] = v;
  };

  const tableSelectors = [
    "#productOverview_feature_div table",
    "#productDetails_techSpec_section_1",
    "#productDetails_techSpec_section_2",
    "#productDetails_detailBullets_sections1",
    "#productDetails_detailBullets_sections2",
  ];

  for (const sel of tableSelectors) {
    const table = root.querySelector?.(sel);
    const rows = table?.querySelectorAll?.("tr") ?? [];
    for (const tr of rows) {
      const th = tr.querySelector?.("th");
      const td = tr.querySelector?.("td");
      const k = extractText(th);
      const v = extractText(td);
      if (k && v) push(k, v);
    }
  }

  const detailBullets = root.querySelector?.("#detailBullets_feature_div");
  const lis = detailBullets?.querySelectorAll?.("li") ?? [];
  for (const li of lis) {
    const labelEl = li.querySelector?.("span.a-text-bold");
    const label = extractText(labelEl);
    if (!label) continue;
    const all = extractText(li);
    const value = all.replace(label, "").trim();
    push(label, value);
  }

  return out;
};

const extractRating = (root: any) => {
  const el =
    root.querySelector?.("#acrPopover") ??
    root.querySelector?.('[data-hook="rating-out-of-text"]') ??
    null;
  const t = cleanText(asString(el?.getAttribute?.("title")) || extractText(el));
  const m = t.match(/([0-9.]+)\s+out of\s+5/i);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
};

const extractReviewCount = (root: any) => {
  const el =
    root.querySelector?.("#acrCustomerReviewText") ??
    root.querySelector?.('[data-hook="total-review-count"]') ??
    null;
  const t = cleanText(extractText(el));
  if (!t) return null;
  const digits = t.replace(/[^\d]/g, "");
  if (!digits) return null;
  const v = Number(digits);
  return Number.isFinite(v) ? v : null;
};

const extractVariantsBase = (root: any, domain: string) => {
  const twister =
    root.querySelector?.("#twister_feature_div") ??
    root.querySelector?.("#twister") ??
    root.querySelector?.("#variation_color_name") ??
    root.querySelector?.("#variation_size_name") ??
    null;

  const candidates =
    (twister?.querySelectorAll?.("[data-asin],[data-defaultasin],[data-dp-url]") ??
      []) as any[];

  const out: Array<Pick<AmazonVariant, "asin" | "url" | "selected" | "dimensions" | "tooltipImage">> =
    [];

  const seen = new Set<string>();
  for (const el of candidates) {
    const asin =
      normalizeAsin(asString(el.getAttribute?.("data-asin"))) ||
      normalizeAsin(asString(el.getAttribute?.("data-defaultasin"))) ||
      normalizeAsin(extractAsinFromUrl(asString(el.getAttribute?.("data-dp-url"))) || "");

    if (!asin || seen.has(asin)) continue;

    const className = asString(el.getAttribute?.("class")).toLowerCase();
    const selected =
      className.includes("selected") ||
      className.includes("swatchselect") ||
      asString(el.getAttribute?.("aria-checked")).toLowerCase() === "true";

    const dpUrl =
      asString(el.getAttribute?.("data-dp-url")) ||
      asString(el.querySelector?.("a")?.getAttribute?.("href")) ||
      "";
    const url = dpUrl ? absolutizeHref(domain, dpUrl) : `${baseHostForDomain(domain)}/dp/${asin}`;

    const img = el.querySelector?.("img");
    const tooltipImage =
      asString(img?.getAttribute?.("src")) ||
      asString(img?.getAttribute?.("data-src")) ||
      null;

    out.push({ asin, url, selected, dimensions: null, tooltipImage });
    seen.add(asin);
  }

  return out;
};

export type ParsedAmazonProductPage = {
  asin: string;
  canonicalUrl: string | null;
  title: string | null;
  brand: string | null;
  priceText: string | null;
  price: AmazonMoney;
  description: string | null;
  bulletPoints: string[];
  images: string[];
  variantsBase: Array<
    Pick<AmazonVariant, "asin" | "url" | "selected" | "dimensions" | "tooltipImage">
  >;
  details: Record<string, string>;
  rating: number | null;
  reviewCount: number | null;
  provider: AmazonProvider;
};

export function parseAmazonProductPageHtml(
  html: string,
  opts: { url: string; domain: string; provider: AmazonProvider }
): ParsedAmazonProductPage {
  const root = HtmlParser.parse(String(html || ""));

  const asin = extractMainAsin(root, opts.url);
  const canonical = extractCanonicalUrl(root, opts.domain);

  const title =
    pickFirstText(root, ["#productTitle", "h1#title span", "h1 span#productTitle"]) ||
    null;

  const brandRaw =
    pickFirstText(root, [
      "#bylineInfo",
      "a#bylineInfo",
      "#bylineInfo_feature_div",
      'a[data-merchant-id]',
    ]) || "";
  const brand = brandRaw
    ? brandRaw.replace(/^visit the\s+/i, "").replace(/\s+store$/i, "").trim()
    : null;

  const priceText = extractPriceText(root);
  const price = moneyFromPriceText(priceText);

  const description = extractDescription(root) || null;
  const bulletPoints = extractBulletPoints(root);
  const images = extractImages(root, html);
  const variantsBase = extractVariantsBase(root, opts.domain);
  const details = extractDetails(root);
  const rating = extractRating(root);
  const reviewCount = extractReviewCount(root);

  return {
    asin: asin || normalizeAsin(extractAsinFromUrl(opts.url) || "") || "",
    canonicalUrl: canonical || null,
    title,
    brand,
    priceText: priceText || null,
    price,
    description,
    bulletPoints,
    images,
    variantsBase,
    details,
    rating,
    reviewCount,
    provider: opts.provider,
  };
}
