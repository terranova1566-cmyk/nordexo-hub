import { spawnSync } from "node:child_process";

const TOOL_PATH = "/srv/node-tools/1688-extractor/src/offer_detail_cli.js";

export type OfferDetailScrape = {
  ok?: boolean;
  input?: { offerId?: string | null; url?: string | null };
  meta?: { title?: string | null };
  extracted?: {
    readableText?: string | null;
    mainImageUrl?: string | null;
    imageUrls?: unknown;
    galleryImageUrls?: unknown;
    descriptionImageUrls?: unknown;
    variantImages?: unknown;
    variations?: unknown;
    weights?: unknown;
    priceStats?: { min?: number | null; max?: number | null } | null;
  };
  errors?: unknown;
};

export type Normalized1688Candidate = {
  supplierName: string | null;
  title: string | null;
  images: string[];
  galleryImages: string[];
  descriptionImages: string[];
  moq: number | null;
  sourcePriceMinCny: number | null;
  sourcePriceMaxCny: number | null;
  priceTiers: Array<{ minQty: number; priceCny: number }>;
  variants: unknown;
  leadTimes: Record<string, unknown>;
  packaging: Record<string, unknown>;
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
};

const asFiniteNumber = (value: unknown): number | null => {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(num) ? num : null;
};

const uniq = (items: string[]) => Array.from(new Set(items));

const looksLikeProductImage = (url: string) => {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return false;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/.test(lower)) return false;
  // Filter obvious UI assets.
  if (lower.includes("/tfs/") && lower.includes("tb1")) return false;
  if (lower.includes("lazyload")) return false;
  if (lower.includes("sprite")) return false;
  if (lower.includes("icon")) return false;
  return true;
};

const extractSupplierName = (readableText: string) => {
  const lines = readableText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const first = lines[0];
  if (first.length > 2 && first.length < 128) return first;
  return null;
};

const extractMoq = (readableText: string) => {
  // Examples: "1台起批", "10件起批"
  const match = readableText.match(/(\d{1,6})\s*(台|件|个|套)\s*起批/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const extractVariationPrices = (variations: any): number[] => {
  const combos = variations?.combos;
  if (!Array.isArray(combos)) return [];
  const out: number[] = [];
  combos.forEach((combo: any) => {
    const p = asFiniteNumber(combo?.price);
    if (p !== null && p >= 0) out.push(p);
  });
  return out;
};

const looksLikeDescriptionImage = (url: string) =>
  /(desc|detaildesc|description|content|long|detail)/i.test(url);

export const fetch1688OfferDetail = (input: {
  offerId?: string | null;
  url?: string | null;
  includeText?: boolean;
  includeVariations?: boolean;
  downloadImages?: boolean;
  maxTextChars?: number;
  timeoutMs?: number;
}): { ok: true; data: OfferDetailScrape } | { ok: false; error: string } => {
  const offerId = asString(input.offerId);
  const url = asString(input.url);
  if (!offerId && !url) {
    return { ok: false, error: "Provide offerId or url." };
  }

  const includeText = input.includeText ?? true;
  const includeVariations = input.includeVariations ?? true;
  const downloadImages = input.downloadImages ?? false;
  const maxTextChars = input.maxTextChars ?? 250_000;
  const timeoutMs = input.timeoutMs ?? 180_000;

  const args: string[] = [
    "--pretty",
    "false",
    "--includeText",
    includeText ? "true" : "false",
    "--includeVariations",
    includeVariations ? "true" : "false",
    "--downloadImages",
    downloadImages ? "true" : "false",
    "--maxTextChars",
    String(maxTextChars),
  ];
  if (offerId) {
    args.push("--offer-id", offerId);
  } else if (url) {
    args.push("--url", url);
  }

  const result = spawnSync(process.execPath, [TOOL_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HEADLESS: "1",
    },
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
  });

  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();

  if (!stdout) {
    return { ok: false, error: stderr || "1688 extractor returned empty output." };
  }

  try {
    const parsed = JSON.parse(stdout) as OfferDetailScrape;
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      error: `1688 extractor returned invalid JSON: ${stdout.slice(0, 300)}`,
    };
  }
};

export const normalize1688OfferToCandidate = (
  scrape: OfferDetailScrape
): Normalized1688Candidate => {
  const title = asString(scrape?.meta?.title) || null;
  const readableText = asString(scrape?.extracted?.readableText);
  const supplierName = readableText ? extractSupplierName(readableText) : null;
  const moq = readableText ? extractMoq(readableText) : null;

  const mainImageUrl = asString(scrape?.extracted?.mainImageUrl);
  const imageUrls = asStringArray(scrape?.extracted?.imageUrls);
  const rawGalleryImages = asStringArray(scrape?.extracted?.galleryImageUrls);
  const rawDescriptionImages = asStringArray(scrape?.extracted?.descriptionImageUrls);

  const splitByHeuristic = imageUrls.reduce(
    (acc, url) => {
      if (looksLikeDescriptionImage(url)) acc.description.push(url);
      else acc.gallery.push(url);
      return acc;
    },
    { gallery: [] as string[], description: [] as string[] }
  );

  const galleryImages = uniq(
    [
      mainImageUrl,
      ...rawGalleryImages,
      ...(rawGalleryImages.length > 0 ? [] : splitByHeuristic.gallery),
    ].filter(Boolean)
  ).filter(looksLikeProductImage);

  const descriptionImages = uniq(
    [
      ...rawDescriptionImages,
      ...(rawDescriptionImages.length > 0 ? [] : splitByHeuristic.description),
    ].filter(Boolean)
  ).filter(looksLikeProductImage);

  const images = uniq(
    [mainImageUrl, ...galleryImages, ...descriptionImages, ...imageUrls].filter(Boolean)
  ).filter(looksLikeProductImage);

  const variations = scrape?.extracted?.variations as any;
  const varPrices = extractVariationPrices(variations);
  const statsMin = asFiniteNumber(scrape?.extracted?.priceStats?.min);
  const statsMax = asFiniteNumber(scrape?.extracted?.priceStats?.max);
  const sourcePriceMinCny =
    varPrices.length > 0 ? Math.min(...varPrices) : statsMin ?? null;
  const sourcePriceMaxCny =
    varPrices.length > 0 ? Math.max(...varPrices) : statsMax ?? null;

  const priceTiers: Array<{ minQty: number; priceCny: number }> = [];
  if (sourcePriceMinCny !== null) {
    priceTiers.push({ minQty: moq ?? 1, priceCny: sourcePriceMinCny });
  }

  return {
    supplierName,
    title,
    images,
    galleryImages,
    descriptionImages,
    moq,
    sourcePriceMinCny,
    sourcePriceMaxCny,
    priceTiers,
    variants: variations ?? {},
    leadTimes: {},
    packaging: {},
  };
};
