import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { EXTRACTOR_UPLOAD_DIR, PRODUCTION_SUPPLIER_PAYLOAD_DIR } from "@/lib/1688-extractor";

export const PARTNER_SUGGESTION_PROVIDER = "partner_suggestions";
export const PARTNER_SUGGESTION_DIR =
  process.env.PARTNER_PRODUCT_SUGGESTIONS_DIR ||
  "/srv/node-files/partner-product-suggestions";
export const PUBLIC_TEMP_DIR = "/srv/incoming-scripts/uploads/public-temp-images";

const SUGGESTION_ID_RE = /^[a-z0-9][a-z0-9_-]{5,80}$/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic|heif)$/i;
const SKIP_IMAGE_HINT_RE =
  /(icon|logo|avatar|sprite|placeholder|loading|spinner|thumbnail|thumb|badge|banner|qr|favicon)/i;

export type SuggestionSourceType = "image" | "url";

export type SuggestionSearchJob = {
  status: "idle" | "queued" | "running" | "done" | "error";
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastRunAt?: string | null;
  error?: string | null;
};

export type SuggestionSourceJob = {
  status: "idle" | "queued" | "running" | "done" | "error";
  stage?: "queued" | "crawl" | "ai_cleanup" | "done";
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

export type SuggestionGoogleTaxonomy = {
  status: "idle" | "queued" | "running" | "done" | "error";
  id?: number | null;
  path?: string | null;
  l1?: string | null;
  l2?: string | null;
  l3?: string | null;
  confidence?: number | null;
  sourceTitle?: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

export type SuggestionImage = {
  publicPath: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  byteSize: number;
};

export type ExternalDataStatus = {
  title: { ok: boolean; value: string | null };
  description: { ok: boolean; value: string | null };
  images: { ok: boolean; count: number; mainImageUrl: string | null };
};

export type ExternalDataAiReview = {
  model: string;
  verifiedAt: string;
  verified: boolean;
  confidence: number | null;
  notes: string[];
  cleanedTitle: string | null;
  cleanedDescription: string | null;
  keptImageIndexes: number[];
};

export type ExternalProductData = {
  jsonVersion: 1;
  sourceType: SuggestionSourceType;
  inputUrl: string | null;
  finalUrl: string | null;
  rawTitle: string | null;
  rawDescription: string | null;
  rawMainImageUrl: string | null;
  rawGalleryImageUrls: string[];
  title: string | null;
  description: string | null;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  imageCount: number;
  status: ExternalDataStatus;
  aiReview: ExternalDataAiReview | null;
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProductSuggestionRecord = {
  id: string;
  provider: string;
  createdAt: string;
  createdBy: string | null;
  sourceType: SuggestionSourceType;
  sourceLabel: string | null;
  sourceUrl: string | null;
  crawlFinalUrl: string | null;
  title: string | null;
  description: string | null;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  image: SuggestionImage | null;
  externalData?: ExternalProductData | null;
  errors: string[];
  searchJob?: SuggestionSearchJob;
  sourceJob?: SuggestionSourceJob;
  googleTaxonomy?: SuggestionGoogleTaxonomy;
};

export type MarketConfig = {
  market: string;
  currency: string;
  fx_rate_cny: number;
  weight_threshold_g: number;
  packing_fee: number;
  markup_percent: number;
  markup_fixed: number;
};

export type ShippingClassConfig = {
  market: string;
  shipping_class: string;
  rate_low: number;
  rate_high: number;
  base_low: number;
  base_high: number;
  mult_low: number;
  mult_high: number;
};

export type PricingBreakdown = {
  market: string;
  currency: string;
  b2bPrice: number;
  shippingCost: number;
  stockCost: number;
  totalCost: number;
};

export type VariantSelectionMetrics = {
  purchasePriceCny: number;
  weightGrams: number;
  priceMinCny: number;
  priceMaxCny: number;
  weightMinGrams: number;
  weightMaxGrams: number;
  selectedMetrics: Array<{
    priceCny: number;
    weightGrams: number;
  }>;
  shippingClass: string;
  selectedCount: number;
  availableCount: number;
  packsText: string | null;
};

export type UrlCrawlResult = {
  ok: boolean;
  inputUrl: string;
  finalUrl: string | null;
  title: string;
  description: string;
  readableText: string;
  mainImageUrl: string | null;
  imageUrls: string[];
  errors: string[];
};

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");

const stripHtml = (value: string) =>
  decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const uniqueList = (items: string[], max = 120) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = asText(item);
    if (!value) continue;
    const key = value.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
};

const toAbsoluteUrl = (baseUrl: string, value: string) => {
  const raw = asText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
};

const shouldSkipImageUrl = (urlText: string) => {
  const text = asText(urlText).toLowerCase();
  if (!text) return true;
  if (!/^https?:\/\//i.test(text)) return true;
  if (text.startsWith("data:")) return true;
  if (text.includes("/favicon")) return true;
  if (text.includes("doubleclick") || text.includes("googleads")) return true;
  if (text.includes("spacer.gif")) return true;
  if (SKIP_IMAGE_HINT_RE.test(text) && !/product|detail|offer|item|goods|sku/i.test(text)) {
    return true;
  }
  return false;
};

const scoreImageUrl = (urlText: string, ogImage: string) => {
  const text = asText(urlText);
  if (!text) return -1000;
  let score = 0;
  const lowered = text.toLowerCase();

  if (ogImage && text === ogImage) score += 120;
  if (IMAGE_EXT_RE.test(lowered)) score += 20;
  if (/\b(1200|1080|1000|900|800|750|700|640|600)\b/.test(lowered)) score += 18;
  if (/product|detail|offer|goods|item|sku|main|hero/.test(lowered)) score += 24;
  if (/small|thumb|icon|logo|sprite|placeholder|banner/.test(lowered)) score -= 24;

  const dim = lowered.match(/(\d{2,4})[x_](\d{2,4})/);
  if (dim?.[1] && dim?.[2]) {
    const w = Number(dim[1]);
    const h = Number(dim[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      const largest = Math.max(w, h);
      score += Math.min(40, Math.floor(largest / 30));
      if (largest < 220) score -= 24;
    }
  }

  return score;
};

const collectJsonLdBlocks = (html: string) => {
  const blocks: unknown[] = [];
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = asText(match[1]);
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed block
    }
  }
  return blocks;
};

const findProductNode = (node: unknown): Record<string, unknown> | null => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findProductNode(entry);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const type = asText(rec["@type"]);
  if (type.toLowerCase() === "product") return rec;

  const graph = rec["@graph"];
  if (graph) {
    const found = findProductNode(graph);
    if (found) return found;
  }
  const mainEntity = rec["mainEntity"];
  if (mainEntity) {
    const found = findProductNode(mainEntity);
    if (found) return found;
  }
  return null;
};

const parseMeta = (html: string, key: string, attr: "name" | "property") => {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
    "i"
  );
  const match = html.match(re);
  return match?.[1] ? decodeEntities(match[1]).trim() : "";
};

const parseTitle = (html: string) => {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? stripHtml(title[1]) : "";
};

const normalizeTextBlock = (value: string, maxLen = 3_500) => {
  const text = stripHtml(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.slice(0, maxLen);
};

const normalizeDescription = (value: string) => {
  const lines = String(value || "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  return normalizeTextBlock(deduped.join(" "), 4_500);
};

const extractReadablePageText = (html: string, maxChars = 30_000) => {
  const withoutNonVisible = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");

  const withBreaks = withoutNonVisible.replace(
    /<\/?(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|table|tr|td|th|br|hr|main|aside|footer|header|nav)[^>]*>/gi,
    "\n"
  );
  const rawText = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));

  const lines = rawText
    .split(/\r?\n/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
    if (deduped.length >= 1500) break;
  }

  return deduped.join("\n").slice(0, Math.max(2000, maxChars));
};

const extractDescriptionFromDom = (html: string) => {
  const blocks: string[] = [];
  const sectionRe =
    /<(div|section|article|ul)[^>]+(?:id|class)=["'][^"']*(description|feature|detail|spec|about|bullet|attribute|overview)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = sectionRe.exec(html)) !== null) {
    const text = normalizeTextBlock(asText(match[3]), 2_500);
    if (text.length < 40) continue;
    blocks.push(text);
    if (blocks.length >= 4) break;
  }

  if (blocks.length === 0) {
    const mainRe = /<main[^>]*>([\s\S]*?)<\/main>/i;
    const mainMatch = html.match(mainRe);
    if (mainMatch?.[1]) {
      const mainText = normalizeTextBlock(mainMatch[1], 2_800);
      if (mainText.length >= 60) blocks.push(mainText);
    }
  }

  return normalizeDescription(blocks.join("\n"));
};

const extractImgUrls = (html: string, finalUrl: string) => {
  const out: string[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = imgRe.exec(html)) !== null) {
    const tag = String(match[0] || "");
    const attrRe =
      /(src|data-src|data-original|data-image|data-lazy-src|data-zoom-image|poster|srcset)=['"]([^'"]+)['"]/gi;
    let attrMatch: RegExpExecArray | null = null;
    while ((attrMatch = attrRe.exec(tag)) !== null) {
      const attr = String(attrMatch[1] || "").toLowerCase();
      const raw = asText(attrMatch[2]);
      if (!raw) continue;
      if (attr === "srcset") {
        raw
          .split(",")
          .map((entry) => entry.trim().split(/\s+/)[0])
          .filter(Boolean)
          .forEach((candidate) => {
            const absolute = toAbsoluteUrl(finalUrl, candidate);
            if (absolute) out.push(absolute);
          });
      } else {
        const absolute = toAbsoluteUrl(finalUrl, raw);
        if (absolute) out.push(absolute);
      }
    }
  }

  const styleRe = /background-image\s*:\s*url\(([^)]+)\)/gi;
  let styleMatch: RegExpExecArray | null = null;
  while ((styleMatch = styleRe.exec(html)) !== null) {
    const raw = asText(styleMatch[1]).replace(/^['"]|['"]$/g, "");
    const absolute = toAbsoluteUrl(finalUrl, raw);
    if (absolute) out.push(absolute);
  }

  return uniqueList(out, 200).filter((url) => !shouldSkipImageUrl(url));
};

const extractLikelyProductLinks = (html: string, finalUrl: string) => {
  const out: string[] = [];
  const anchorRe = /<a\b[^>]*href=['"]([^'"]+)['"][^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = toAbsoluteUrl(finalUrl, asText(match[1]));
    if (!href) continue;
    const lowered = href.toLowerCase();
    if (!/^https?:\/\//i.test(lowered)) continue;
    if (!/product|prod|item|offer|detail|dp\//i.test(lowered)) continue;
    if (/category|search|cart|wishlist|login|signup|account/.test(lowered)) continue;
    out.push(href);
  }
  return uniqueList(out, 8);
};

const fetchHtml = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = asText(response.url) || url;
    const contentType = asText(response.headers.get("content-type"));
    if (!response.ok) {
      throw new Error(`Failed to fetch page (${response.status})`);
    }
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`Unsupported content-type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    return { html, finalUrl };
  } finally {
    clearTimeout(timeout);
  }
};

const parseUrlCandidate = (inputUrl: string, html: string, finalUrl: string) => {
  const readableText = extractReadablePageText(html);
  const jsonLdBlocks = collectJsonLdBlocks(html);
  let productNode: Record<string, unknown> | null = null;
  for (const block of jsonLdBlocks) {
    const found = findProductNode(block);
    if (found) {
      productNode = found;
      break;
    }
  }

  const title =
    asText(productNode?.name) ||
    parseMeta(html, "og:title", "property") ||
    parseMeta(html, "twitter:title", "name") ||
    parseTitle(html);

  const description = normalizeDescription(
    asText(productNode?.description) ||
      parseMeta(html, "og:description", "property") ||
      parseMeta(html, "description", "name") ||
      extractDescriptionFromDom(html)
  );

  const rawImages: string[] = [];
  const jsonImages = productNode?.image;
  if (Array.isArray(jsonImages)) {
    jsonImages.forEach((entry) => rawImages.push(asText(entry)));
  } else if (jsonImages) {
    rawImages.push(asText(jsonImages));
  }

  const ogImage = toAbsoluteUrl(finalUrl, parseMeta(html, "og:image", "property"));
  if (ogImage) rawImages.push(ogImage);

  const htmlImages = extractImgUrls(html, finalUrl);
  rawImages.push(...htmlImages);

  const imageUrls = uniqueList(
    rawImages
      .map((entry) => toAbsoluteUrl(finalUrl, entry))
      .filter(Boolean)
      .filter((entry) => !shouldSkipImageUrl(entry)),
    50
  );

  const scored = imageUrls
    .map((imageUrl) => ({ imageUrl, score: scoreImageUrl(imageUrl, ogImage) }))
    .sort((a, b) => b.score - a.score);

  const mainImageUrl = scored.length > 0 ? scored[0].imageUrl : null;

  const confidence =
    (productNode ? 4 : 0) +
    (title ? 2 : 0) +
    (description ? 1 : 0) +
    (imageUrls.length > 0 ? 2 : 0) +
    (/product|item|offer|detail|dp\//i.test(finalUrl.toLowerCase()) ? 1 : 0);

  const followLinks = extractLikelyProductLinks(html, finalUrl);

  return {
    inputUrl,
    finalUrl,
    title,
    description,
    readableText,
    mainImageUrl,
    imageUrls,
    confidence,
    followLinks,
  };
};

export const crawlUrlForProduct = async (inputUrlRaw: string): Promise<UrlCrawlResult> => {
  const inputUrl = asText(inputUrlRaw);
  if (!/^https?:\/\//i.test(inputUrl)) {
    return {
      ok: false,
      inputUrl,
      finalUrl: null,
      title: "",
      description: "",
      readableText: "",
      mainImageUrl: null,
      imageUrls: [],
      errors: ["Invalid URL."],
    };
  }

  const queue = [inputUrl];
  const seen = new Set<string>();
  const errors: string[] = [];
  let best: ReturnType<typeof parseUrlCandidate> | null = null;

  while (queue.length > 0 && seen.size < 4) {
    const target = queue.shift();
    if (!target) break;
    if (seen.has(target)) continue;
    seen.add(target);

    try {
      const { html, finalUrl } = await fetchHtml(target);
      const parsed = parseUrlCandidate(inputUrl, html, finalUrl);
      if (!best || parsed.confidence > best.confidence) {
        best = parsed;
      }

      if (parsed.confidence >= 7) {
        break;
      }

      parsed.followLinks.forEach((url) => {
        if (!seen.has(url) && queue.length < 8) queue.push(url);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${target}: ${message}`);
    }
  }

  if (!best) {
    return {
      ok: false,
      inputUrl,
      finalUrl: null,
      title: "",
      description: "",
      readableText: "",
      mainImageUrl: null,
      imageUrls: [],
      errors: errors.length > 0 ? errors : ["Unable to crawl URL."],
    };
  }

  return {
    ok: true,
    inputUrl,
    finalUrl: best.finalUrl,
    title: best.title,
    description: best.description,
    readableText: best.readableText,
    mainImageUrl: best.mainImageUrl,
    imageUrls: best.imageUrls,
    errors,
  };
};

const extractJsonFromText = (text: string) => {
  const raw = asText(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const hasUsableTitle = (value: unknown) => asText(value).length >= 3;
const hasUsableDescription = (value: unknown) => asText(value).length >= 40;

const normalizeImageList = (values: unknown[], max = 60) =>
  uniqueList(
    values
      .map((entry) => asText(entry))
      .filter(Boolean)
      .map((entry) => entry.replace(/\s+/g, ""))
      .filter((entry) => /^https?:\/\//i.test(entry) || entry.startsWith("/api/public/temp-images/"))
      .filter(
        (entry) => entry.startsWith("/api/public/temp-images/") || !shouldSkipImageUrl(entry)
      ),
    max
  );

const normalizeConfidence = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1 && num >= 0) return Number(num.toFixed(3));
  if (num <= 100 && num >= 0) return Number((num / 100).toFixed(3));
  return null;
};

const toFiniteNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeGoogleTaxonomyForRecord = (
  record: ProductSuggestionRecord,
  fallbackTitle: string | null
): SuggestionGoogleTaxonomy => {
  const existing =
    record.googleTaxonomy && typeof record.googleTaxonomy === "object"
      ? (record.googleTaxonomy as SuggestionGoogleTaxonomy)
      : null;

  const statusRaw = asText(existing?.status).toLowerCase();
  const status: SuggestionGoogleTaxonomy["status"] =
    statusRaw === "queued" ||
    statusRaw === "running" ||
    statusRaw === "done" ||
    statusRaw === "error" ||
    statusRaw === "idle"
      ? statusRaw
      : fallbackTitle
        ? "queued"
        : "idle";

  const l1Existing = asText(existing?.l1) || null;
  const l2Existing = asText(existing?.l2) || null;
  const l3Existing = asText(existing?.l3) || null;
  const pathExisting =
    asText(existing?.path) ||
    [l1Existing, l2Existing, l3Existing].filter(Boolean).join(" > ") ||
    "";
  const pathParts = pathExisting
    ? pathExisting
        .split(">")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  const l1 = l1Existing || pathParts[0] || null;
  const l2 = l2Existing || pathParts[1] || null;
  const l3 = l3Existing || pathParts[2] || null;
  const path = pathExisting || [l1, l2, l3].filter(Boolean).join(" > ") || null;
  const id = toFiniteNumber(existing?.id);
  const confidence = normalizeConfidence(existing?.confidence);
  const sourceTitle = asText(existing?.sourceTitle) || fallbackTitle || null;
  const updatedAt =
    asText(existing?.updatedAt) ||
    asText(existing?.finishedAt) ||
    asText(existing?.startedAt) ||
    asText(existing?.queuedAt) ||
    asText(record.createdAt) ||
    new Date().toISOString();

  return {
    status,
    id,
    path,
    l1,
    l2,
    l3,
    confidence,
    sourceTitle,
    queuedAt: asText(existing?.queuedAt) || null,
    startedAt: asText(existing?.startedAt) || null,
    finishedAt: asText(existing?.finishedAt) || null,
    updatedAt,
    error: asText(existing?.error) || null,
  };
};

const cleanExternalDataWithOpenAi = async (input: {
  inputUrl: string | null;
  finalUrl: string | null;
  rawTitle: string;
  rawDescription: string;
  readablePageText?: string;
  galleryImageUrls: string[];
}) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const modelCandidates = Array.from(
    new Set(
      [
        process.env.PRODUCT_SUGGESTION_EXTERNAL_MODEL,
        process.env.OPENCLAW_EXTERNAL_MODEL,
        "gpt-5.2",
        "gpt-5",
        "gpt-5-mini",
        "gpt-4o-mini",
      ]
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );
  if (modelCandidates.length === 0) return null;

  const readablePageText = asText(input.readablePageText || "").slice(0, 120_000);
  const fallbackText = [input.rawTitle, input.rawDescription]
    .map((entry) => asText(entry))
    .filter(Boolean)
    .join("\n\n");
  const copiedPageText = readablePageText || fallbackText;
  if (!copiedPageText) return null;

  const prompt = [
    "This is a complete copy-paste from a product web page.",
    "Clean marketing language, recommended products/menus, and non-core noise.",
    "Identify the core product and write output in Swedish.",
    "Return JSON only with EXACTLY these keys:",
    '{ "title": "...", "description": "..." }',
    "Rules:",
    "1) title: short Swedish e-commerce title, product-noun focused.",
    "2) description: Swedish, merge core product description + key specifications.",
    "3) Do not include external links, seller menus, campaign text, or unrelated recommendations.",
    "4) Keep technical details relevant to the actual product.",
    "",
    `Input URL: ${asText(input.inputUrl) || "-"}`,
    `Final URL: ${asText(input.finalUrl) || "-"}`,
    "Copied page text:",
    copiedPageText,
  ].join("\n");

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const content = asText(payload?.choices?.[0]?.message?.content);
      const parsed =
        payload && typeof payload === "object" && payload.json && typeof payload.json === "object"
          ? payload.json
          : extractJsonFromText(content);
      if (!parsed || typeof parsed !== "object") continue;

      const rec = parsed as Record<string, unknown>;
      const cleanedTitle = asText(rec.title || rec.cleaned_title || rec.product_title);
      const cleanedDescription = normalizeDescription(
        asText(rec.description || rec.cleaned_description || rec.product_description || rec.details)
      );
      const notes = Array.isArray(rec.notes)
        ? rec.notes.map((entry) => asText(entry)).filter(Boolean).slice(0, 10)
        : [];
      const verifiedRaw = asText(rec.verified_match || rec.verified || rec.match_ok || "");
      const verified =
        ["1", "true", "yes", "ok"].includes(verifiedRaw.toLowerCase()) ||
        (cleanedTitle.length >= 3 && cleanedDescription.length >= 40);
      const confidence = normalizeConfidence(rec.confidence) ?? null;

      if (!cleanedTitle && !cleanedDescription) {
        continue;
      }

      return {
        model,
        cleanedTitle: cleanedTitle || null,
        cleanedDescription: cleanedDescription || null,
        keptImageIndexes: [] as number[],
        notes,
        verified,
        confidence,
      };
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
};

const buildExternalStatus = (data: {
  title: string | null;
  description: string | null;
  galleryImageUrls: string[];
  mainImageUrl: string | null;
}): ExternalDataStatus => ({
  title: {
    ok: hasUsableTitle(data.title),
    value: hasUsableTitle(data.title) ? asText(data.title) : null,
  },
  description: {
    ok: hasUsableDescription(data.description),
    value: hasUsableDescription(data.description) ? asText(data.description) : null,
  },
  images: {
    ok: data.galleryImageUrls.length > 0,
    count: data.galleryImageUrls.length,
    mainImageUrl: asText(data.mainImageUrl) || null,
  },
});

export const buildExternalDataForImageSuggestion = (params: {
  createdAt?: string;
  imageUrl: string | null;
  errors?: string[];
}): ExternalProductData => {
  const now = asText(params.createdAt) || new Date().toISOString();
  const galleryImageUrls = normalizeImageList([params.imageUrl], 8);
  const mainImageUrl = asText(galleryImageUrls[0]) || null;
  const title = null;
  const description = null;
  return {
    jsonVersion: 1,
    sourceType: "image",
    inputUrl: null,
    finalUrl: null,
    rawTitle: null,
    rawDescription: null,
    rawMainImageUrl: mainImageUrl,
    rawGalleryImageUrls: [...galleryImageUrls],
    title,
    description,
    mainImageUrl,
    galleryImageUrls,
    imageCount: galleryImageUrls.length,
    status: buildExternalStatus({ title, description, galleryImageUrls, mainImageUrl }),
    aiReview: null,
    errors: uniqueList((params.errors || []).map((entry) => asText(entry)).filter(Boolean), 20),
    createdAt: now,
    updatedAt: now,
  };
};

export const buildExternalDataForUrlSuggestion = async (params: {
  inputUrl: string;
  finalUrl: string | null;
  title: string;
  description: string;
  readablePageText?: string;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  errors?: string[];
  createdAt?: string;
  runAiCleanup?: boolean;
}) => {
  const now = asText(params.createdAt) || new Date().toISOString();
  const rawTitle = asText(params.title) || null;
  const rawDescription = normalizeDescription(asText(params.description)) || null;
  const rawGalleryImageUrls = normalizeImageList(
    [params.mainImageUrl, ...(Array.isArray(params.galleryImageUrls) ? params.galleryImageUrls : [])],
    80
  );
  const rawMainImageUrl = asText(params.mainImageUrl) || asText(rawGalleryImageUrls[0]) || null;

  let title = rawTitle;
  let description = rawDescription;
  let galleryImageUrls = [...rawGalleryImageUrls];
  let mainImageUrl = rawMainImageUrl;
  let aiReview: ExternalDataAiReview | null = null;

  const aiResponse =
    params.runAiCleanup === false
      ? null
      : !rawTitle && !rawDescription && rawGalleryImageUrls.length === 0
        ? null
      : await cleanExternalDataWithOpenAi({
          inputUrl: asText(params.inputUrl) || null,
          finalUrl: asText(params.finalUrl) || null,
          rawTitle: rawTitle || "",
          rawDescription: rawDescription || "",
          readablePageText: asText(params.readablePageText || ""),
          galleryImageUrls,
        });

  if (aiResponse) {
    if (asText(aiResponse.cleanedTitle)) title = asText(aiResponse.cleanedTitle);
    if (asText(aiResponse.cleanedDescription)) {
      description = normalizeDescription(asText(aiResponse.cleanedDescription));
    }
    if (aiResponse.keptImageIndexes.length > 0) {
      galleryImageUrls = aiResponse.keptImageIndexes
        .map((idx) => galleryImageUrls[idx])
        .filter(Boolean);
    }
    if (!asText(mainImageUrl) && galleryImageUrls.length > 0) {
      mainImageUrl = asText(galleryImageUrls[0]) || null;
    }
    aiReview = {
      model: aiResponse.model,
      verifiedAt: now,
      verified: Boolean(aiResponse.verified),
      confidence: aiResponse.confidence ?? null,
      notes: Array.isArray(aiResponse.notes) ? aiResponse.notes : [],
      cleanedTitle: asText(aiResponse.cleanedTitle) || null,
      cleanedDescription: asText(aiResponse.cleanedDescription) || null,
      keptImageIndexes: aiResponse.keptImageIndexes,
    };
  }

  const normalizedErrors = uniqueList(
    (params.errors || []).map((entry) => asText(entry)).filter(Boolean),
    40
  );
  const status = buildExternalStatus({
    title,
    description,
    galleryImageUrls,
    mainImageUrl,
  });

  return {
    jsonVersion: 1 as const,
    sourceType: "url" as const,
    inputUrl: asText(params.inputUrl) || null,
    finalUrl: asText(params.finalUrl) || null,
    rawTitle,
    rawDescription,
    rawMainImageUrl,
    rawGalleryImageUrls,
    title,
    description,
    mainImageUrl,
    galleryImageUrls,
    imageCount: galleryImageUrls.length,
    status,
    aiReview,
    errors: normalizedErrors,
    createdAt: now,
    updatedAt: now,
  };
};

export const normalizeExternalDataForRecord = (
  record: ProductSuggestionRecord
): ProductSuggestionRecord => {
  const baseGallery = normalizeImageList(
    [record.mainImageUrl, ...(Array.isArray(record.galleryImageUrls) ? record.galleryImageUrls : [])],
    80
  );
  const baseMainImageUrl = asText(record.mainImageUrl) || asText(baseGallery[0]) || null;
  const baseTitle = asText(record.title) || null;
  const baseDescription = normalizeDescription(asText(record.description)) || null;
  const createdAt = asText(record.createdAt) || new Date().toISOString();

  const existing =
    record.externalData && typeof record.externalData === "object"
      ? (record.externalData as ExternalProductData)
      : null;
  const galleryImageUrls = normalizeImageList(
    [
      ...(existing?.galleryImageUrls || []),
      ...(existing?.rawGalleryImageUrls || []),
      ...baseGallery,
    ],
    80
  );
  const mainImageUrl =
    asText(existing?.mainImageUrl) ||
    asText(existing?.rawMainImageUrl) ||
    baseMainImageUrl ||
    (galleryImageUrls.length > 0 ? galleryImageUrls[0] : null);

  const title = asText(existing?.title) || baseTitle || asText(existing?.rawTitle) || null;
  const description =
    normalizeDescription(asText(existing?.description || existing?.rawDescription)) ||
    baseDescription ||
    null;
  const googleTaxonomy = normalizeGoogleTaxonomyForRecord(record, title);

  const nextExternal: ExternalProductData = {
    jsonVersion: 1,
    sourceType: record.sourceType || "image",
    inputUrl: asText(existing?.inputUrl || record.sourceUrl) || null,
    finalUrl: asText(existing?.finalUrl || record.crawlFinalUrl) || null,
    rawTitle: asText(existing?.rawTitle) || baseTitle || null,
    rawDescription:
      normalizeDescription(asText(existing?.rawDescription)) || baseDescription || null,
    rawMainImageUrl:
      asText(existing?.rawMainImageUrl) || baseMainImageUrl || asText(mainImageUrl) || null,
    rawGalleryImageUrls: normalizeImageList(
      [...(existing?.rawGalleryImageUrls || []), ...baseGallery],
      80
    ),
    title,
    description,
    mainImageUrl: asText(mainImageUrl) || null,
    galleryImageUrls,
    imageCount: galleryImageUrls.length,
    status: buildExternalStatus({
      title,
      description,
      galleryImageUrls,
      mainImageUrl,
    }),
    aiReview: existing?.aiReview || null,
    errors: uniqueList(
      [
        ...(existing?.errors || []),
        ...(Array.isArray(record.errors) ? record.errors : []),
      ]
        .map((entry) => asText(entry))
        .filter(Boolean),
      40
    ),
    createdAt: asText(existing?.createdAt) || createdAt,
    updatedAt: asText(existing?.updatedAt) || asText(existing?.createdAt) || createdAt,
  };

  return {
    ...record,
    title,
    description,
    mainImageUrl: asText(record.mainImageUrl) || asText(nextExternal.mainImageUrl) || null,
    galleryImageUrls: baseGallery.length > 0 ? baseGallery : [...nextExternal.galleryImageUrls],
    externalData: nextExternal,
    googleTaxonomy,
    errors: uniqueList(
      [
        ...(Array.isArray(record.errors) ? record.errors : []),
        ...(nextExternal.errors || []),
      ]
        .map((entry) => asText(entry))
        .filter(Boolean),
      40
    ),
  };
};

export const parseInputUrls = (raw: string) => {
  const lines = String(raw || "")
    .split(/[\n,]+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!/^https?:\/\//i.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
};

const ensurePublicTempDir = async () => {
  await fs.mkdir(PUBLIC_TEMP_DIR, { recursive: true });
};

const makePublicTempId = () => crypto.randomBytes(16).toString("hex");

export const normalizeImageBufferToPublicTemp = async (
  buffer: Buffer,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<SuggestionImage> => {
  const maxWidth = Math.max(50, Number(options?.maxWidth ?? 750));
  const maxHeight = Math.max(50, Number(options?.maxHeight ?? 750));
  const quality = Math.max(50, Math.min(95, Number(options?.quality ?? 90)));

  await ensurePublicTempDir();

  const normalized = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const id = makePublicTempId();
  const imagePath = path.join(PUBLIC_TEMP_DIR, `${id}.jpg`);
  const metaPath = path.join(PUBLIC_TEMP_DIR, `${id}.json`);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await fs.writeFile(imagePath, normalized.data);
  await fs.writeFile(
    metaPath,
    JSON.stringify({ expiresAt, contentType: "image/jpeg" }, null, 2),
    "utf8"
  );

  return {
    publicPath: `/api/public/temp-images/${id}.jpg`,
    width: normalized.info.width ?? null,
    height: normalized.info.height ?? null,
    mimeType: "image/jpeg",
    byteSize: normalized.data.byteLength,
  };
};

export const fetchAndNormalizeImage = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`Image fetch failed (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new Error("Downloaded image was empty.");
    }
    const image = await normalizeImageBufferToPublicTemp(buffer);
    return { image, finalUrl: asText(response.url) || url };
  } finally {
    clearTimeout(timeout);
  }
};

export const createSuggestionId = () => {
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString("hex");
  return `ps_${stamp}_${rand}`;
};

const ensureSuggestionDir = async () => {
  await fs.mkdir(PARTNER_SUGGESTION_DIR, { recursive: true });
};

const isValidSuggestionId = (id: string) => SUGGESTION_ID_RE.test(id);

const suggestionPathForId = (id: string) => {
  const safe = asText(id);
  if (!isValidSuggestionId(safe)) return null;
  return path.join(PARTNER_SUGGESTION_DIR, `${safe}.json`);
};

export const saveSuggestionRecord = async (record: ProductSuggestionRecord) => {
  const filePath = suggestionPathForId(record.id);
  if (!filePath) throw new Error("Invalid suggestion id.");
  await ensureSuggestionDir();
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
};

export const loadSuggestionRecord = async (id: string) => {
  const filePath = suggestionPathForId(id);
  if (!filePath) return null;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ProductSuggestionRecord;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const deleteSuggestionRecord = async (id: string) => {
  const filePath = suggestionPathForId(id);
  if (!filePath) return false;
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
    if (code === "ENOENT") return false;
    throw error;
  }
};

export const listSuggestionRecords = async () => {
  await ensureSuggestionDir();
  const entries = await fs.readdir(PARTNER_SUGGESTION_DIR);
  const files = entries.filter((entry) => entry.toLowerCase().endsWith(".json"));
  const loaded = await Promise.all(
    files.map(async (name) => {
      const fullPath = path.join(PARTNER_SUGGESTION_DIR, name);
      try {
        const raw = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw) as ProductSuggestionRecord;
        if (!parsed || typeof parsed !== "object" || !isValidSuggestionId(asText(parsed.id))) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    })
  );
  return loaded.filter((entry): entry is ProductSuggestionRecord => Boolean(entry));
};

const runUnzip = async (zipFilePath: string, outputDir: string) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-oq", zipFilePath, "-d", outputDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `unzip failed with code ${code}`));
      }
    });
  });
};

const walkFiles = async (dirPath: string): Promise<string[]> => {
  const out: string[] = [];
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
};

export const extractImagesFromZipBuffer = async (zipBuffer: Buffer) => {
  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const tmpRoot = path.join("/tmp", `partner-suggestions-${stamp}`);
  const zipPath = path.join(tmpRoot, "batch.zip");
  const outDir = path.join(tmpRoot, "unzipped");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(zipPath, zipBuffer);

  try {
    await runUnzip(zipPath, outDir);
    const allFiles = await walkFiles(outDir);
    const imageFiles = allFiles.filter((filePath) => IMAGE_EXT_RE.test(filePath));

    const extracted = await Promise.all(
      imageFiles.map(async (filePath) => {
        const buffer = await fs.readFile(filePath);
        return {
          fileName: path.basename(filePath),
          buffer,
        };
      })
    );

    return extracted.filter((entry) => entry.buffer.length > 0);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
};

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const asPriceNumber = (value: unknown) => {
  const text = asText(value).replace(/,/g, ".");
  if (!text) return null;
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const asWeightGrams = (value: unknown) => {
  const raw = asText(value).replace(/,/g, ".");
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("kg") || lower.includes("公斤") || lower.includes("千克")) {
    return Math.round(num * 1000);
  }
  if (lower.includes("g") || lower.includes("克")) {
    return Math.round(num);
  }
  if (num <= 20 && raw.includes(".")) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
};

const normalizeShippingClass = (value: unknown) => {
  const code = asText(value).toUpperCase();
  if (!code) return "NOR";
  if (["NOR", "BAT", "LIQ", "PBA"].includes(code)) return code;
  return "NOR";
};

const safePayloadPath = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  const resolved = path.resolve(raw);
  const allowedRoots = [
    path.resolve(PRODUCTION_SUPPLIER_PAYLOAD_DIR),
    path.resolve(EXTRACTOR_UPLOAD_DIR),
  ];
  if (!allowedRoots.some((root) => resolved.startsWith(`${root}${path.sep}`))) {
    return null;
  }
  if (path.extname(resolved).toLowerCase() !== ".json") return null;
  return resolved;
};

const extractPayloadCombos = (payload: unknown) => {
  if (Array.isArray(payload)) {
    const first = payload.find((entry) => entry && typeof entry === "object") as
      | Record<string, unknown>
      | undefined;
    const variations = first?.variations;
    if (variations && typeof variations === "object") {
      const combos = (variations as Record<string, unknown>).combos;
      if (Array.isArray(combos)) {
        return combos.filter((entry) => entry && typeof entry === "object") as Record<
          string,
          unknown
        >[];
      }
    }
    return [];
  }

  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    const variations = rec.variations;
    if (variations && typeof variations === "object") {
      const combos = (variations as Record<string, unknown>).combos;
      if (Array.isArray(combos)) {
        return combos.filter((entry) => entry && typeof entry === "object") as Record<
          string,
          unknown
        >[];
      }
    }
  }
  return [];
};

const loadCombosFromPayloadPath = async (payloadPath: string) => {
  try {
    const raw = await fs.readFile(payloadPath, "utf8");
    const parsed = JSON.parse(raw);
    return extractPayloadCombos(parsed);
  } catch {
    return [] as Record<string, unknown>[];
  }
};

const resolveClassConfig = (
  classMap: Map<string, Map<string, ShippingClassConfig>>,
  market: string,
  shippingClass: string
) => {
  const marketMap = classMap.get(market);
  if (!marketMap) return null;
  return marketMap.get(shippingClass) || marketMap.get("NOR") || null;
};

export const computeB2BPrices = (
  purchasePriceCny: number,
  weightGrams: number,
  shippingClass: string,
  markets: MarketConfig[],
  shippingClasses: ShippingClassConfig[]
) => {
  const classMap = new Map<string, Map<string, ShippingClassConfig>>();
  for (const row of shippingClasses) {
    const market = asText(row.market).toUpperCase();
    const code = asText(row.shipping_class).toUpperCase();
    if (!market || !code) continue;
    const byMarket = classMap.get(market) || new Map<string, ShippingClassConfig>();
    byMarket.set(code, row);
    classMap.set(market, byMarket);
  }

  const results: PricingBreakdown[] = [];
  for (const market of markets) {
    const marketCode = asText(market.market).toUpperCase();
    if (!marketCode) continue;
    const cfg = resolveClassConfig(classMap, marketCode, shippingClass);
    if (!cfg) continue;

    const useLow = weightGrams <= market.weight_threshold_g;
    const rate = useLow ? cfg.rate_low : cfg.rate_high;
    const base = useLow ? cfg.base_low : cfg.base_high;
    const mult = useLow ? cfg.mult_low : cfg.mult_high;

    const shippingCny = weightGrams * mult * rate + base;
    const shippingLocal = shippingCny * market.fx_rate_cny + market.packing_fee;
    const stockLocal = purchasePriceCny * market.fx_rate_cny;
    const totalCost = stockLocal + shippingLocal;
    const rawPrice = totalCost * (1 + market.markup_percent) + market.markup_fixed;
    const b2bPrice =
      market.currency.toUpperCase() === "EUR"
        ? Number(rawPrice.toFixed(2))
        : Math.round(rawPrice);

    if (!Number.isFinite(b2bPrice)) continue;

    results.push({
      market: marketCode,
      currency: asText(market.currency).toUpperCase() || "SEK",
      b2bPrice,
      shippingCost: Number(shippingLocal.toFixed(2)),
      stockCost: Number(stockLocal.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
    });
  }

  return results;
};

const normalizeSelectionIndexes = (value: unknown, comboCount: number) => {
  if (!Array.isArray(value)) return [] as number[];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of value) {
    const idx = Math.trunc(Number(entry));
    if (!Number.isFinite(idx)) continue;
    if (idx < 0 || idx >= comboCount) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  return out;
};

const normalizeOverrides = (value: unknown, comboCount: number) => {
  if (!Array.isArray(value)) return new Map<number, { price: number | null; weight: number | null }>();
  const out = new Map<number, { price: number | null; weight: number | null }>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const index = Math.trunc(Number(rec.index));
    if (!Number.isFinite(index) || index < 0 || index >= comboCount) continue;
    out.set(index, {
      price: toNumber(rec.price),
      weight: toNumber(rec.weight_grams),
    });
  }
  return out;
};

const parsePackMultipliers = (value: unknown) => {
  const tokens = asText(value).match(/\d+/g) ?? [];
  const numbers = tokens
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 999);
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
};

export const deriveVariantSelectionMetrics = async (
  selectedOfferRaw: unknown
): Promise<VariantSelectionMetrics | null> => {
  const selectedOffer =
    selectedOfferRaw && typeof selectedOfferRaw === "object"
      ? (selectedOfferRaw as Record<string, unknown>)
      : null;
  if (!selectedOffer) return null;

  const selectionRaw =
    selectedOffer._production_variant_selection &&
    typeof selectedOffer._production_variant_selection === "object"
      ? (selectedOffer._production_variant_selection as Record<string, unknown>)
      : null;
  if (!selectionRaw) return null;

  const payloadPath = safePayloadPath(selectedOffer._production_payload_file_path);
  if (!payloadPath) return null;

  const combos = await loadCombosFromPayloadPath(payloadPath);
  if (combos.length === 0) return null;

  const selectedIndexes = normalizeSelectionIndexes(
    selectionRaw.selected_combo_indexes,
    combos.length
  );
  if (selectedIndexes.length === 0) return null;

  const overrides = normalizeOverrides(selectionRaw.combo_overrides, combos.length);
  const packMultipliers = parsePackMultipliers(selectionRaw.packs_text);
  const effectivePacks = packMultipliers.length > 0 ? packMultipliers : [1];

  const selectedMetrics = selectedIndexes
    .map((index) => {
      const combo = combos[index];
      if (!combo) return null;
      const override = overrides.get(index);
      const price =
        override && override.price !== null && override.price > 0
          ? override.price
          : asPriceNumber(combo.price) ?? asPriceNumber(combo.price_raw);
      const weight =
        override && override.weight !== null && override.weight > 0
          ? Math.round(override.weight)
          : asWeightGrams(combo.weight_grams) ??
            asWeightGrams(combo.weightRaw) ??
            asWeightGrams(combo.weight_raw);
      if (price === null || weight === null || price <= 0 || weight <= 0) return null;
      return effectivePacks.map((pack) => ({
        price: Number((price * pack).toFixed(4)),
        weight: Math.round(weight * pack),
      }));
    })
    .flat()
    .filter((entry): entry is { price: number; weight: number } => Boolean(entry));

  if (selectedMetrics.length === 0) return null;

  const priceMinCny = Math.min(...selectedMetrics.map((entry) => entry.price));
  const priceMaxCny = Math.max(...selectedMetrics.map((entry) => entry.price));
  const weightMinGrams = Math.min(...selectedMetrics.map((entry) => entry.weight));
  const weightMaxGrams = Math.max(...selectedMetrics.map((entry) => entry.weight));
  const purchasePriceCny = priceMinCny;
  const weightGrams = weightMaxGrams;
  const selectedPriceWeightMetrics = selectedMetrics.map((entry) => ({
    priceCny: entry.price,
    weightGrams: entry.weight,
  }));

  const shippingClass = normalizeShippingClass(
    selectedOffer._digideal_shipping_class ||
      selectedOffer._production_shipping_class ||
      selectedOffer.shipping_class ||
      selectedOffer.product_shiptype
  );

  return {
    purchasePriceCny,
    weightGrams,
    priceMinCny,
    priceMaxCny,
    weightMinGrams,
    weightMaxGrams,
    selectedMetrics: selectedPriceWeightMetrics,
    shippingClass,
    selectedCount: selectedIndexes.length,
    availableCount: combos.length,
    packsText: asText(selectionRaw.packs_text) || null,
  };
};

export const mapMarketConfigRows = (rows: unknown): MarketConfig[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => {
      const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      if (!rec) return null;
      const market = asText(rec.market).toUpperCase();
      const currency = asText(rec.currency).toUpperCase();
      if (!market || !currency) return null;
      return {
        market,
        currency,
        fx_rate_cny: Number(rec.fx_rate_cny ?? 0),
        weight_threshold_g: Number(rec.weight_threshold_g ?? 300),
        packing_fee: Number(rec.packing_fee ?? 0),
        markup_percent: Number(rec.markup_percent ?? 0),
        markup_fixed: Number(rec.markup_fixed ?? 0),
      };
    })
    .filter((entry): entry is MarketConfig => Boolean(entry));
};

export const mapShippingClassRows = (rows: unknown): ShippingClassConfig[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => {
      const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      if (!rec) return null;
      const market = asText(rec.market).toUpperCase();
      const shippingClass = asText(rec.shipping_class).toUpperCase();
      if (!market || !shippingClass) return null;
      return {
        market,
        shipping_class: shippingClass,
        rate_low: Number(rec.rate_low ?? 0),
        rate_high: Number(rec.rate_high ?? 0),
        base_low: Number(rec.base_low ?? 0),
        base_high: Number(rec.base_high ?? 0),
        mult_low: Number(rec.mult_low ?? 1),
        mult_high: Number(rec.mult_high ?? 1),
      };
    })
    .filter((entry): entry is ShippingClassConfig => Boolean(entry));
};
