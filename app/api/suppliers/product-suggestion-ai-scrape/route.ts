import { NextResponse } from "next/server";
import {
  buildExternalDataForUrlSuggestion,
  crawlUrlForProduct,
  type UrlCrawlResult,
} from "@/lib/product-suggestions";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, X-Nodexo-Token",
};

const MAX_BULLETS = 24;
const MAX_IMAGES = 80;

type BrowserFallbackPayload = {
  sourceUrl?: unknown;
  sourceHost?: unknown;
  tabTitle?: unknown;
  title?: unknown;
  description?: unknown;
  bulletPoints?: unknown;
  imageUrls?: unknown;
  mainImageUrl?: unknown;
  readableText?: unknown;
  runServerCrawl?: unknown;
  runAiCleanup?: unknown;
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const toBool = (value: unknown, fallback: boolean) => {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
};

const parseTokens = () => {
  const raw =
    process.env.NODEXO_PRODUCT_SUGGESTION_SCRAPE_TOKENS ||
    process.env.NODEXO_PRODUCT_SUGGESTION_SCRAPE_TOKEN ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKENS ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKEN ||
    "";

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
};

const getAuthToken = (request: Request) => {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return (
    request.headers.get("x-api-key") || request.headers.get("x-nodexo-token") || ""
  );
};

const normalizeBulletPoints = (values: unknown) => {
  const candidates = Array.isArray(values)
    ? values
    : String(values || "")
        .split(/[\n•\u2022]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of candidates) {
    const text = asText(entry).replace(/\s+/g, " ");
    if (!text || text.length < 2 || text.length > 400) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
};

const normalizeImageUrls = (values: unknown[], max = MAX_IMAGES) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of values) {
    const text = asText(entry);
    if (!text) continue;

    let normalized = text;
    try {
      const parsed = new URL(text);
      if (!/^https?:$/i.test(parsed.protocol)) continue;
      parsed.hash = "";
      normalized = parsed.toString();
    } catch {
      continue;
    }

    const key = normalized.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }

  return out;
};

const safeHostname = (rawUrl: string) => {
  try {
    return new URL(rawUrl).hostname || "";
  } catch {
    return "";
  }
};

const extractFallbackBulletsFromText = (description: string) => {
  if (!description) return [] as string[];
  const lines = description
    .split(/\r?\n/g)
    .map((line) => asText(line))
    .filter(Boolean);

  const candidates =
    lines.length > 1
      ? lines
      : description
          .split(/(?:\s+[•\u2022]\s+|\s+-\s+)/g)
          .map((line) => asText(line))
          .filter(Boolean);

  return normalizeBulletPoints(candidates.filter((line) => line.length >= 12));
};

const mergeReadableText = (parts: unknown[]) =>
  parts
    .map((part) => asText(part))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 180_000);

export async function POST(request: Request) {
  const tokens = parseTokens();
  if (tokens.length) {
    const provided = getAuthToken(request);
    if (!provided || !tokens.includes(provided)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const payload =
    rawBody && typeof rawBody === "object"
      ? (rawBody as BrowserFallbackPayload)
      : null;

  const sourceUrl = asText(payload?.sourceUrl);
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return NextResponse.json(
      { error: "sourceUrl must be an absolute http(s) URL." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const browserTitle = asText(payload?.title) || asText(payload?.tabTitle);
  const browserDescription = asText(payload?.description);
  const browserBulletPoints = normalizeBulletPoints(payload?.bulletPoints);
  const browserImageUrls = normalizeImageUrls([
    payload?.mainImageUrl,
    ...(Array.isArray(payload?.imageUrls) ? payload?.imageUrls : []),
  ]);
  const browserReadableText = asText(payload?.readableText);

  const hasStrongBrowserSnapshot =
    browserTitle.length >= 4 &&
    (browserDescription.length >= 80 || browserImageUrls.length >= 3);

  const runServerCrawl = toBool(payload?.runServerCrawl, !hasStrongBrowserSnapshot);
  const runAiCleanup = toBool(payload?.runAiCleanup, true);

  let crawlResult: UrlCrawlResult | null = null;
  let crawlErrors: string[] = [];

  if (runServerCrawl) {
    try {
      crawlResult = await crawlUrlForProduct(sourceUrl);
      if (Array.isArray(crawlResult.errors) && crawlResult.errors.length > 0) {
        crawlErrors = crawlResult.errors.map((entry) => asText(entry)).filter(Boolean);
      }
    } catch (error) {
      crawlErrors = [error instanceof Error ? error.message : String(error)];
    }
  }

  const mergedImageUrls = normalizeImageUrls([
    ...browserImageUrls,
    crawlResult?.mainImageUrl,
    ...(Array.isArray(crawlResult?.imageUrls) ? crawlResult.imageUrls : []),
  ]);

  const mergedMainImageUrl =
    browserImageUrls[0] ||
    asText(crawlResult?.mainImageUrl) ||
    (mergedImageUrls.length > 0 ? mergedImageUrls[0] : "") ||
    null;

  const mergedTitle = browserTitle || asText(crawlResult?.title);
  const mergedDescription = browserDescription || asText(crawlResult?.description);
  const finalUrl =
    asText(crawlResult?.finalUrl) ||
    sourceUrl;

  const readableText = mergeReadableText([
    browserReadableText,
    browserBulletPoints.join("\n"),
    mergedDescription,
    crawlResult?.readableText,
  ]);

  const externalData = await buildExternalDataForUrlSuggestion({
    inputUrl: sourceUrl,
    finalUrl,
    title: mergedTitle,
    description: mergedDescription,
    readablePageText: readableText,
    mainImageUrl: mergedMainImageUrl,
    galleryImageUrls: mergedImageUrls,
    errors: crawlErrors,
    runAiCleanup,
  });

  const description = asText(externalData.description) || mergedDescription;
  const bulletPoints =
    browserBulletPoints.length > 0
      ? browserBulletPoints
      : extractFallbackBulletsFromText(description);

  const sourceHost = asText(payload?.sourceHost) || safeHostname(finalUrl) || safeHostname(sourceUrl);

  const record = {
    record_type: "product_suggestion",
    schema_version: "1.0",
    payload_type: "product_suggestions_browser_v1",

    source_platform: "generic_ai",
    source_host: sourceHost,

    product_title: asText(externalData.title) || mergedTitle,
    product_url: finalUrl,
    product_id: "",
    product_id_type: "",
    asin: "",
    units_sold_text: "",
    units_sold_value: null,

    main_image_urls: normalizeImageUrls(externalData.galleryImageUrls || mergedImageUrls),
    bullet_points: bulletPoints,
    product_description: description,

    scraped_at: new Date().toISOString(),

    platform_attributes: {
      generic_ai: {
        input_url: sourceUrl,
        final_url: finalUrl,
        run_server_crawl: runServerCrawl,
        run_ai_cleanup: runAiCleanup,
        crawl_ok: Boolean(crawlResult?.ok),
        crawl_errors: crawlErrors,
        ai_model: externalData.aiReview?.model || null,
        ai_verified: externalData.aiReview?.verified ?? null,
        ai_confidence: externalData.aiReview?.confidence ?? null,
        browser_snapshot: {
          title: browserTitle || null,
          description_length: browserDescription.length,
          bullet_points_count: browserBulletPoints.length,
          image_count: browserImageUrls.length,
          readable_text_length: browserReadableText.length,
        },
      },
    },
  };

  return NextResponse.json(
    {
      ok: true,
      sourceType: "browser_ai_fallback",
      record,
      diagnostics: {
        crawl_used: runServerCrawl,
        crawl_ok: Boolean(crawlResult?.ok),
        crawl_errors: crawlErrors,
        ai_model: externalData.aiReview?.model || null,
      },
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
