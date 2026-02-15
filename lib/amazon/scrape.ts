import { oxylabsQuery } from "@/lib/amazon/oxylabs";
import { fetchAmazonHtmlDirect } from "@/lib/amazon/direct";
import {
  canonicalAmazonProductUrl,
  extractAsinFromUrl,
  inferAmazonDomain,
  normalizeAmazonProductUrl,
} from "@/lib/amazon/urls";
import { extractAmazonProductCardsFromHtml } from "@/lib/amazon/extract-cards";
import { parseAmazonProductPageHtml } from "@/lib/amazon/parse-product";
import { AmazonScrapeError } from "@/lib/amazon/errors";
import { normalizeAmazonFullScrape, normalizeAmazonProductCards } from "@/lib/amazon/normalize";
import type {
  AmazonFullScrape,
  AmazonMoney,
  AmazonProductCard,
  AmazonProvider,
  AmazonVariant,
} from "@/lib/amazon/types";

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const safeArray = <T = unknown>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const parsePriceAmount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\d.,-]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  // Heuristic: if both "," and "." exist, assume "," thousands and "." decimals.
  // If only "," exists, assume it's a decimal separator (EU style).
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

const moneyFromContent = (content: Record<string, unknown>): AmazonMoney => {
  const currency = asString(content.currency) || null;
  const amount = parsePriceAmount(content.price);
  return { amount, currency };
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
) => {
  const results: R[] = [];
  const safeConcurrency = Math.max(1, Math.trunc(concurrency || 1));
  let index = 0;
  const workers = Array.from({ length: safeConcurrency }, () => async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await handler(current));
    }
  });
  await Promise.all(workers.map((w) => w()));
  return results;
};

export type ScrapeProductOptions = {
  provider?: AmazonProvider;
  includeVariantImages?: boolean;
  includeRelatedProducts?: boolean;
  maxRelated?: number;
};

export async function scrapeAmazonProductFull(
  productUrl: string,
  options: ScrapeProductOptions = {}
): Promise<AmazonFullScrape> {
  const provider: AmazonProvider = options.provider ?? "oxylabs";
  if (provider === "direct") {
    const direct = await scrapeAmazonProductFullDirect(productUrl, options);
    return await normalizeAmazonFullScrape(direct);
  }

  const domain = inferAmazonDomain(productUrl);
  const normalized = normalizeAmazonProductUrl(productUrl);
  const asin = normalized.asin ?? extractAsinFromUrl(productUrl);
  if (!asin) {
    throw new Error("Could not extract ASIN from product URL.");
  }

  const includeVariantImages = options.includeVariantImages !== false;
  const includeRelatedProducts = options.includeRelatedProducts !== false;
  const maxRelated = Math.max(0, Math.trunc(options.maxRelated ?? 24));

  const { content: productContentRaw } = await oxylabsQuery({
    source: "amazon_product",
    domain,
    query: asin,
    parse: true,
    context: {
      autoselect_variant: true,
    },
  });

  const productContent = toRecord(productContentRaw);
  const title = asString(productContent.title) || null;
  const brand = asString(productContent.manufacturer) || null;
  const description = asString(productContent.description) || null;
  const bulletPoints = safeArray<string>(productContent.bullet_points)
    .map((v) => asString(v))
    .filter(Boolean);
  const images = safeArray<string>(productContent.images)
    .map((v) => asString(v))
    .filter(Boolean);

  const variations = safeArray<Record<string, unknown>>(productContent.variation);
  const baseVariants: AmazonVariant[] = [];
  variations.forEach((entry) => {
    const e = toRecord(entry);
    const vAsin = asString(e.asin).toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(vAsin)) return;
    const dims = toRecord(e.dimensions);
    const dimensions =
      Object.keys(dims).length > 0
        ? Object.fromEntries(
            Object.entries(dims)
              .map(([k, v]) => [asString(k), asString(v)])
              .filter(([k, v]) => Boolean(k && v))
          )
        : null;
    baseVariants.push({
      asin: vAsin,
      url: canonicalAmazonProductUrl(domain, vAsin) || asString(e.url) || null,
      selected: Boolean(e.selected),
      dimensions,
      tooltipImage: asString(e.tooltip_image) || null,
      title: null,
      price: {
        amount: parsePriceAmount(e.price),
        currency: asString(productContent.currency) || null,
      },
      images: [],
      raw: e,
    });
  });

  const variantAsins = Array.from(
    new Set(baseVariants.map((v) => v.asin).filter(Boolean))
  );

  const variantDetailsByAsin = new Map<string, AmazonVariant>();
  if (includeVariantImages && variantAsins.length > 0) {
    const fetched = await mapWithConcurrency(variantAsins, 3, async (vAsin) => {
      const { content } = await oxylabsQuery({
        source: "amazon_product",
        domain,
        query: vAsin,
        parse: true,
        context: {
          autoselect_variant: true,
        },
      });
      const c = toRecord(content);
      const vTitle = asString(c.title) || null;
      const vImages = safeArray<string>(c.images)
        .map((v) => asString(v))
        .filter(Boolean);
      const money = moneyFromContent(c);
      const base = baseVariants.find((b) => b.asin === vAsin) ?? null;
      return {
        asin: vAsin,
        url: canonicalAmazonProductUrl(domain, vAsin) || asString(c.url) || base?.url || null,
        selected: base?.selected ?? false,
        dimensions: base?.dimensions ?? null,
        tooltipImage: base?.tooltipImage ?? null,
        title: vTitle,
        price: money,
        images: vImages,
        raw: c,
      } satisfies AmazonVariant;
    });
    fetched.forEach((v) => variantDetailsByAsin.set(v.asin, v));
  }

  const variants: AmazonVariant[] =
    baseVariants.length > 0
      ? baseVariants.map((v) => variantDetailsByAsin.get(v.asin) ?? v)
      : [];

  let relatedProductAsins: string[] = [];
  let relatedProductCards: AmazonProductCard[] = [];

  if (includeRelatedProducts) {
    const urlForHtml = canonicalAmazonProductUrl(domain, asin) || normalized.canonicalUrl || productUrl;
    const { content: htmlRaw } = await oxylabsQuery({
      source: "amazon",
      domain,
      url: urlForHtml,
      parse: false,
      render: "html",
    });

    const html = typeof htmlRaw === "string" ? htmlRaw : "";
    const exclude = new Set<string>([asin, ...variantAsins]);
    const extracted = extractAmazonProductCardsFromHtml(html, {
      domain,
      sourceUrl: urlForHtml,
      sourceType: "recommended",
      sourceAsin: asin,
      maxItems: Math.max(1, maxRelated),
      provider: "oxylabs",
    }).filter((card) => (card.asin ? !exclude.has(card.asin) : true));

    relatedProductCards = extracted.slice(0, maxRelated);
    relatedProductAsins = relatedProductCards
      .map((c) => c.asin)
      .filter((v): v is string => Boolean(v));
  }

  const full: AmazonFullScrape = {
    asin,
    domain,
    productUrl: canonicalAmazonProductUrl(domain, asin) || normalized.canonicalUrl || asString(productContent.url) || productUrl,
    title,
    brand,
    price: moneyFromContent(productContent),
    description,
    bulletPoints,
    images,
    variants,
    relatedProductAsins,
    relatedProductCards,
    provider: "oxylabs",
    raw: productContent,
  };
  return await normalizeAmazonFullScrape(full);
}

export type ScrapeListingOptions = {
  provider?: AmazonProvider;
  maxItems?: number;
};

export async function scrapeAmazonListingCards(
  listingUrl: string,
  options: ScrapeListingOptions = {}
) {
  const provider: AmazonProvider = options.provider ?? "oxylabs";
  if (provider === "direct") {
    const direct = await scrapeAmazonListingCardsDirect(listingUrl, options);
    return { ...direct, cards: await normalizeAmazonProductCards(direct.cards) };
  }

  const domain = inferAmazonDomain(listingUrl);
  const maxItems = Math.max(1, Math.trunc(options.maxItems ?? 40));

  const { content: htmlRaw } = await oxylabsQuery({
    source: "amazon",
    domain,
    url: listingUrl,
    parse: false,
    render: "html",
  });
  const html = typeof htmlRaw === "string" ? htmlRaw : "";
  const cardsRaw = extractAmazonProductCardsFromHtml(html, {
    domain,
    sourceUrl: listingUrl,
    sourceType: "listing",
    sourceAsin: null,
    maxItems,
    provider: "oxylabs",
  });

  const cards = await normalizeAmazonProductCards(cardsRaw);
  const asins = cards.map((c) => c.asin).filter(Boolean);
  return { domain, sourceUrl: listingUrl, asins, cards };
}

const baseHostForDomain = (domain: string) => {
  const d = (domain || "com").toLowerCase();
  if (d === "com") return "https://www.amazon.com";
  return `https://www.amazon.${d}`;
};

async function scrapeAmazonProductFullDirect(
  productUrl: string,
  options: ScrapeProductOptions
): Promise<AmazonFullScrape> {
  const domain = inferAmazonDomain(productUrl);
  const normalized = normalizeAmazonProductUrl(productUrl);
  const asinFromUrl = normalized.asin ?? extractAsinFromUrl(productUrl);
  if (!asinFromUrl) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: "missing_asin",
      message: "Could not extract ASIN from product URL.",
      url: productUrl,
    });
  }

  const includeVariantImages = options.includeVariantImages !== false;
  const includeRelatedProducts = options.includeRelatedProducts !== false;
  const maxRelated = Math.max(0, Math.trunc(options.maxRelated ?? 24));

  const urlForHtml = normalized.canonicalUrl ?? productUrl;
  const fetched = await fetchAmazonHtmlDirect(urlForHtml);
  if (fetched.blocked) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: fetched.blocked.code,
      message: fetched.blocked.message,
      url: fetched.finalUrl,
      detail: {
        status: fetched.status,
        contentType: fetched.contentType,
        blocked: fetched.blocked,
        debug: fetched.debug,
      },
    });
  }
  if (fetched.status >= 400) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: "http_error",
      message: `Amazon returned HTTP ${fetched.status}.`,
      url: fetched.finalUrl,
      detail: { status: fetched.status, contentType: fetched.contentType, debug: fetched.debug },
    });
  }

  const parsed = parseAmazonProductPageHtml(fetched.html, {
    url: urlForHtml,
    domain,
    provider: "direct",
  });

  const asin = parsed.asin || asinFromUrl;
  const productCanonical =
    canonicalAmazonProductUrl(domain, asin) || normalized.canonicalUrl || parsed.canonicalUrl || urlForHtml;

  const baseHost = baseHostForDomain(domain);
  const baseVariants: AmazonVariant[] = parsed.variantsBase
    .filter((v) => v.asin !== asin)
    .map((v) => ({
      asin: v.asin,
      url: `${baseHost}/dp/${v.asin}`,
      selected: v.selected,
      dimensions: v.dimensions,
      tooltipImage: v.tooltipImage,
      title: null,
      price: parsed.price,
      images: [],
      raw: { extracted_from: "html", extracted_url: v.url },
    }));

  const variantAsins = Array.from(
    new Set(baseVariants.map((v) => v.asin).filter(Boolean))
  );

  const variantDetailsByAsin = new Map<string, AmazonVariant>();
  const variantImageErrors: Array<{ asin: string; code: string; error: string }> = [];

  if (includeVariantImages && variantAsins.length > 0) {
    const fetchedVariants = await mapWithConcurrency<string, AmazonVariant | null>(
      variantAsins,
      1,
      async (vAsin) => {
      try {
        const vUrl = `${baseHost}/dp/${vAsin}`;
        const res = await fetchAmazonHtmlDirect(vUrl);
        if (res.blocked) {
          throw new AmazonScrapeError({
            provider: "direct",
            code: res.blocked.code,
            message: res.blocked.message,
            url: res.finalUrl,
            detail: { status: res.status, blocked: res.blocked, debug: res.debug },
          });
        }
        if (res.status >= 400) {
          throw new AmazonScrapeError({
            provider: "direct",
            code: "http_error",
            message: `Amazon returned HTTP ${res.status}.`,
            url: res.finalUrl,
            detail: { status: res.status, debug: res.debug },
          });
        }

        const p = parseAmazonProductPageHtml(res.html, {
          url: vUrl,
          domain,
          provider: "direct",
        });

        const base = baseVariants.find((b) => b.asin === vAsin) ?? null;
        return {
          asin: vAsin,
          url: vUrl,
          selected: base?.selected ?? false,
          dimensions: base?.dimensions ?? null,
          tooltipImage: base?.tooltipImage ?? null,
          title: p.title,
          price: p.price,
          images: p.images,
          raw: { details: p.details, rating: p.rating, reviewCount: p.reviewCount },
        } as AmazonVariant;
      } catch (err) {
        if (err instanceof AmazonScrapeError) {
          variantImageErrors.push({
            asin: vAsin,
            code: err.code,
            error: err.message,
          });
        } else {
          variantImageErrors.push({
            asin: vAsin,
            code: "variant_fetch_failed",
            error: err instanceof Error ? err.message : "Variant fetch failed.",
          });
        }
        return null;
      }
      }
    );

    fetchedVariants
      .filter((v): v is AmazonVariant => Boolean(v))
      .forEach((v) => variantDetailsByAsin.set(v.asin, v));
  }

  const variants: AmazonVariant[] =
    baseVariants.length > 0
      ? baseVariants.map((v) => variantDetailsByAsin.get(v.asin) ?? v)
      : [];

  let relatedProductAsins: string[] = [];
  let relatedProductCards: AmazonProductCard[] = [];

  if (includeRelatedProducts) {
    const exclude = new Set<string>([asin, ...variantAsins]);
    const extracted = extractAmazonProductCardsFromHtml(fetched.html, {
      domain,
      sourceUrl: productCanonical,
      sourceType: "recommended",
      sourceAsin: asin,
      maxItems: Math.max(1, maxRelated),
      provider: "direct",
    }).filter((card) => (card.asin ? !exclude.has(card.asin) : true));

    relatedProductCards = extracted.slice(0, maxRelated);
    relatedProductAsins = relatedProductCards
      .map((c) => c.asin)
      .filter((v): v is string => Boolean(v));
  }

  return {
    asin,
    domain,
    productUrl: productCanonical,
    title: parsed.title,
    brand: parsed.brand,
    price: parsed.price,
    description: parsed.description,
    bulletPoints: parsed.bulletPoints,
    images: parsed.images,
    variants,
    relatedProductAsins,
    relatedProductCards,
    provider: "direct",
    raw: {
      fetched: {
        url: fetched.url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        contentType: fetched.contentType,
      },
      parsed: {
        canonicalUrl: parsed.canonicalUrl,
        priceText: parsed.priceText,
        details: parsed.details,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
      },
      variantImageErrors,
    },
  };
}

async function scrapeAmazonListingCardsDirect(listingUrl: string, options: ScrapeListingOptions) {
  const domain = inferAmazonDomain(listingUrl);
  const maxItems = Math.max(1, Math.trunc(options.maxItems ?? 40));

  const fetched = await fetchAmazonHtmlDirect(listingUrl);
  if (fetched.blocked) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: fetched.blocked.code,
      message: fetched.blocked.message,
      url: fetched.finalUrl,
      detail: {
        status: fetched.status,
        contentType: fetched.contentType,
        blocked: fetched.blocked,
        debug: fetched.debug,
      },
    });
  }
  if (fetched.status >= 400) {
    throw new AmazonScrapeError({
      provider: "direct",
      code: "http_error",
      message: `Amazon returned HTTP ${fetched.status}.`,
      url: fetched.finalUrl,
      detail: { status: fetched.status, contentType: fetched.contentType, debug: fetched.debug },
    });
  }

  const cards = extractAmazonProductCardsFromHtml(fetched.html, {
    domain,
    sourceUrl: listingUrl,
    sourceType: "listing",
    sourceAsin: null,
    maxItems,
    provider: "direct",
  });

  const asins = cards.map((c) => c.asin).filter(Boolean);
  return { domain, sourceUrl: listingUrl, asins, cards };
}
