import type {
  AmazonFullScrape,
  AmazonMoney,
  AmazonProductCard,
  AmazonVariant,
} from "@/lib/amazon/types";
import { convertMoneyToSekNoDecimals } from "@/lib/fx";
import {
  normalizeMeasurementRecordToMetric,
  normalizeMeasurementsToMetric,
} from "@/lib/units/metric";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const currencyFromDomain = (domain: string) => {
  const d = String(domain || "").trim().toLowerCase();
  if (d === "com") return "USD";
  if (d === "co.uk") return "GBP";
  if (["de", "fr", "it", "es"].includes(d)) return "EUR";
  if (d === "ca") return "CAD";
  if (d === "co.jp") return "JPY";
  if (d === "com.au") return "AUD";
  return null;
};

const normalizeMoneyToSek = async (money: AmazonMoney, domainForFallback: string): Promise<AmazonMoney> => {
  const currency = money.currency ?? currencyFromDomain(domainForFallback);
  return (await convertMoneyToSekNoDecimals({ amount: money.amount, currency })) as AmazonMoney;
};

function normalizeVariantMeasurements(variant: AmazonVariant): AmazonVariant {
  return {
    ...variant,
    title: variant.title ? normalizeMeasurementsToMetric(variant.title) : null,
    dimensions: variant.dimensions
      ? Object.fromEntries(
          Object.entries(variant.dimensions).map(([k, v]) => [
            k,
            normalizeMeasurementsToMetric(v),
          ])
        )
      : null,
  };
}

function normalizeCardMeasurements(card: AmazonProductCard): AmazonProductCard {
  return {
    ...card,
    title: card.title ? normalizeMeasurementsToMetric(card.title) : null,
  };
}

function normalizeRawDirectPayload(raw: unknown) {
  if (!isRecord(raw)) return raw;
  const parsed = raw.parsed;
  if (!isRecord(parsed)) return raw;
  const details = parsed.details;
  if (!isRecord(details)) return raw;

  const stringDetails: Record<string, string> = {};
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === "string") stringDetails[k] = v;
  }

  const normalizedDetails = normalizeMeasurementRecordToMetric(stringDetails);
  return {
    ...raw,
    parsed: {
      ...parsed,
      details_raw: parsed.details_raw ?? stringDetails,
      details: normalizedDetails,
    },
  };
}

function normalizeVariantRawDirectPayload(variant: AmazonVariant) {
  if (variant.raw === undefined) return variant;
  if (!isRecord(variant.raw)) return variant;
  const details = variant.raw.details;
  if (!isRecord(details)) return variant;

  const stringDetails: Record<string, string> = {};
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === "string") stringDetails[k] = v;
  }

  const normalizedDetails = normalizeMeasurementRecordToMetric(stringDetails);
  return {
    ...variant,
    raw: {
      ...variant.raw,
      details_raw: (variant.raw as any).details_raw ?? stringDetails,
      details: normalizedDetails,
    },
  };
}

export async function normalizeAmazonFullScrape(
  scrape: AmazonFullScrape
): Promise<AmazonFullScrape> {
  const price = await normalizeMoneyToSek(scrape.price, scrape.domain);

  const variants = await Promise.all(
    scrape.variants.map(async (v) => ({
      ...normalizeVariantRawDirectPayload(normalizeVariantMeasurements(v)),
      price: await normalizeMoneyToSek(v.price, scrape.domain),
    }))
  );

  const relatedProductCards = await Promise.all(
    scrape.relatedProductCards.map(async (c) => ({
      ...normalizeCardMeasurements(c),
      price: await normalizeMoneyToSek(c.price, c.domain),
    }))
  );

  const raw = scrape.provider === "direct" ? normalizeRawDirectPayload(scrape.raw) : scrape.raw;

  return {
    ...scrape,
    title: scrape.title ? normalizeMeasurementsToMetric(scrape.title) : null,
    description: scrape.description ? normalizeMeasurementsToMetric(scrape.description) : null,
    bulletPoints: scrape.bulletPoints.map((p) => normalizeMeasurementsToMetric(p)),
    brand: scrape.brand ? normalizeMeasurementsToMetric(scrape.brand) : null,
    price,
    variants,
    relatedProductCards,
    raw,
  };
}

export async function normalizeAmazonProductCards(
  cards: AmazonProductCard[]
): Promise<AmazonProductCard[]> {
  return Promise.all(
    cards.map(async (c) => ({
      ...normalizeCardMeasurements(c),
      price: await normalizeMoneyToSek(c.price, c.domain),
    }))
  );
}
