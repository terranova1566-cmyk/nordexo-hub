import fs from "node:fs";
import path from "node:path";
import { EXTRACTOR_UPLOAD_DIR } from "@/lib/1688-extractor";

export type QueueKeywordResult = {
  sourceMtimeMs: number;
  updatedAt: string;
  keywords: string[];
  label: string;
  source: "openai" | "fallback" | "empty";
  cacheVersion?: number;
};

const KEYWORD_CACHE_DIR = path.join(EXTRACTOR_UPLOAD_DIR, "_keyword_cache");
const PREVIEW_TITLE_CACHE_DIR = path.join(EXTRACTOR_UPLOAD_DIR, "_preview_table_cache");
const KEYWORD_CACHE_VERSION = 9;

const TITLE_KEYS = [
  "title_1688",
  "title_cn",
  "title_zh",
  "title",
  "product_title",
  "productTitle",
  "listing_title",
  "name",
  "subject",
  "subject_cn",
  "subject_zh",
  "item_title",
  "offer_title",
];

const CLEAN_LINE_BLOCKLIST = [
  "客服",
  "回头率",
  "商品评价",
  "查看全部评价",
  "登录查看全部",
  "服务",
  "物流",
  "发货",
  "品牌",
  "货号",
  "材质",
  "功能",
  "颜色",
  "上市年份",
  "商品",
  "全部",
];

const LATIN_STOP_WORDS = new Set([
  "and",
  "for",
  "with",
  "from",
  "the",
  "this",
  "that",
  "your",
  "you",
  "med",
  "och",
  "för",
  "utan",
  "som",
  "till",
  "den",
  "det",
  "ett",
  "en",
  "att",
  "hemma",
  "stor",
  "stora",
  "small",
  "large",
  "new",
  "set",
  "pack",
  "st",
  "pcs",
  "piece",
  "pieces",
  "usb",
  "wifi",
  "hd",
  "led",
  "smart",
  "portable",
  "trådlös",
  "justerbar",
  "kapacitet",
  "färg",
  "color",
  "white",
  "black",
  "blue",
  "red",
]);

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const extractEntries = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.urls)) return record.urls;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.results)) return record.results;
  return [];
};

const containsChinese = (value: string) => /[\u4e00-\u9fff]/.test(value);

const cleanTitle = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[|｜•·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const extractReadableChineseTitle = (readable: unknown) => {
  const raw = asText(readable);
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => cleanTitle(line))
    .filter(Boolean);

  const scored = lines
    .filter((line) => containsChinese(line))
    .filter((line) => line.length >= 4 && line.length <= 48)
    .filter((line) => !/^\d+([.,]\d+)?$/.test(line))
    .filter(
      (line) =>
        !CLEAN_LINE_BLOCKLIST.some((needle) => line.includes(needle)) &&
        !line.includes("分") &&
        !line.includes("评价")
    )
    .map((line) => {
      const punctuationPenalty = /[\t]/.test(line) ? 2 : 0;
      const hasCommaListPenalty = line.includes(",") || line.includes("，") ? 1 : 0;
      const score = line.length - punctuationPenalty - hasCommaListPenalty;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.line ?? "";
};

const extractMainTitle = (entry: Record<string, unknown>) => {
  const competitor = entry.competitor_data;
  if (competitor && typeof competitor === "object") {
    const title = cleanTitle(asText((competitor as Record<string, unknown>).title));
    if (title) return title;
  }

  for (const key of TITLE_KEYS) {
    const candidate = cleanTitle(asText(entry[key]));
    if (candidate) return candidate;
  }

  const readableTitle = extractReadableChineseTitle(entry.readable_1688);
  if (readableTitle) return readableTitle;

  return "";
};

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const normalizeKeywords = (input: unknown, maxCount: number) => {
  const limit = Math.max(1, Math.min(20, Math.round(maxCount || 1)));
  if (!Array.isArray(input)) return [] as string[];
  const out: string[] = [];
  const maxLabelLength = 42;
  for (const value of input) {
    let keyword = cleanTitle(asText(value))
      .replace(/^[-*•\d.\s]+/, "")
      .replace(/[，,、]+$/g, "");
    if (keyword.length > maxLabelLength) {
      const clipped = keyword.slice(0, maxLabelLength + 1);
      const wordBoundary = clipped.replace(/\s+\S*$/, "").trim();
      keyword = (wordBoundary || clipped.slice(0, maxLabelLength)).trim();
    }
    if (!keyword) continue;
    out.push(keyword);
    if (out.length >= limit) break;
  }
  return out;
};

const hasLatin = (value: string) => /[A-Za-z]/.test(value);

const normalizeSingleEnglishKeyword = (raw: string) => {
  const value = cleanTitle(raw);
  if (!value) return "";
  const directMappings: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(fidget|spinner|snurrande leksak)/i, label: "Fidget Spinner" },
    { pattern: /(nagel|nail|nagelfil|nageltrimmer|nagelklipp)/i, label: "Nail Trimmer" },
    { pattern: /(termometer|hygrometer|temperatur|thermometer)/i, label: "Thermometer" },
    { pattern: /(öron|otoskop|ear|ear wax)/i, label: "Ear Cleaner" },
    { pattern: /(hund|katt|pet|paw|dog|cat)/i, label: "Pet Trimmer" },
    { pattern: /(kolmonoxid|co[-\\s]?mätare|co detector|gas detector)/i, label: "CO Detector" },
    { pattern: /(magträn|resistance|expander|elastic band)/i, label: "Resistance Trainer" },
    { pattern: /(verktyg|tool|organizer|holder)/i, label: "Tool Accessory" },
  ];
  for (const mapping of directMappings) {
    if (mapping.pattern.test(value)) return mapping.label;
  }
  if (hasLatin(value) && !containsChinese(value)) {
    return toTitleCase(value.toLowerCase());
  }

  if (/耳|otoscope|ear/i.test(value)) return "Ear Cleaner";
  if (/狗|猫|宠物|paw|pet/i.test(value)) return "Pet Accessory";
  if (/包|袋|bag/i.test(value)) return "Bag";
  if (/检测|一氧化碳|气体|报警|detector|carbon monoxide|\bco\b/i.test(value)) {
    return "Gas Detector";
  }
  if (/剪|修|刨|剃|trimmer|groom/i.test(value)) return "Grooming Tool";
  if (/指甲|美甲|nail/i.test(value)) return "Nail Tool";
  if (/工具|tool|organizer|holder/i.test(value)) return "Tool Accessory";
  if (/玩具|陀螺|spinner|toy/i.test(value)) return "Toy";
  if (/灯|照明|light/i.test(value)) return "Light";
  if (/相机|摄像|camera/i.test(value)) return "Camera Tool";

  return "";
};

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const KNOWN_TERM_MAP: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(fidget|spinner)/i, label: "Fidget Spinner" },
  { pattern: /(verktygsbälte|tool belt|organizer)/i, label: "Tool Belt" },
  { pattern: /(hundtrimmer|dog trimmer|pet trimmer|tasstrimmer)/i, label: "Pet Trimmer" },
  { pattern: /(öronreng|otoskop|ear cleaner|ear wax)/i, label: "Ear Cleaner" },
  { pattern: /(kolmonoxid|co[-\s]?mätare|co detector|gas detector)/i, label: "CO Detector" },
  { pattern: /(magträn|resistance|expander|elastic band)/i, label: "Resistance Trainer" },
  { pattern: /(bag|väska|belt bag|crossbody)/i, label: "Utility Bag" },
  { pattern: /(nail|nagelfil|nageltrimmer)/i, label: "Nail Trimmer" },
  { pattern: /(radio|fm)/i, label: "Portable Radio" },
];

const deriveFallbackKeywordFromTitle = (title: string) => {
  const cleaned = cleanTitle(title)
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return "";

  const normalized = normalizeSingleEnglishKeyword(cleaned);
  if (normalized) return normalized;

  for (const mapping of KNOWN_TERM_MAP) {
    if (mapping.pattern.test(cleaned)) return mapping.label;
  }

  const latinPart = cleaned
    .split(/[|/,:;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .find((part) => /[A-Za-zÅÄÖåäö]/.test(part));

  if (latinPart) {
    const tokenized = latinPart
      .toLowerCase()
      .replace(/[^a-z0-9åäöéüßæø\s-]/gi, " ")
      .split(/[\s-]+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 2 &&
          !LATIN_STOP_WORDS.has(token) &&
          !/^\d+$/.test(token)
      )
      .slice(0, 3);
    if (tokenized.length) {
      return toTitleCase(tokenized.join(" "));
    }
  }

  if (containsChinese(cleaned)) {
    if (/耳/.test(cleaned)) return "Ear Cleaner";
    if (/狗|猫|宠物/.test(cleaned)) return "Pet Accessory";
    if (/修|剪|刀|刨/.test(cleaned)) return "Grooming Tool";
    if (/包|袋/.test(cleaned)) return "Bag";
    if (/检测|报警|气体|一氧化碳/.test(cleaned)) return "Gas Detector";
  }

  return "";
};

const fallbackKeywordForTitle = (title: string, index: number) => {
  const mapped = deriveFallbackKeywordFromTitle(title);
  if (mapped) return mapped;
  const normalized = normalizeSingleEnglishKeyword(title);
  if (normalized) return normalized;
  const direct = cleanTitle(title)
    .replace(/[（(].*?[)）]/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 28);
  if (direct) return direct;
  return `Product ${index + 1}`;
};

const mergeEnglishKeywords = (
  aiKeywords: string[] | null,
  titles: string[],
  maxCount: number
) => {
  const limit = Math.max(1, Math.min(20, Math.round(maxCount || 1)));
  const out: string[] = [];

  for (let index = 0; index < limit; index += 1) {
    const aiCandidate =
      Array.isArray(aiKeywords) && typeof aiKeywords[index] === "string"
        ? aiKeywords[index]
        : "";
    const normalizedAi = normalizeSingleEnglishKeyword(aiCandidate);
    if (normalizedAi) {
      out.push(normalizedAi);
      continue;
    }

    const title = titles[index] ?? "";
    out.push(fallbackKeywordForTitle(title, index));
  }

  return out;
};

const requestOpenAiKeywords = async (titles: string[], maxCount: number) => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  const limit = Math.max(1, Math.min(20, Math.round(maxCount || 1)));

  const models = Array.from(
    new Set(
      [
        process.env.BULK_QUEUE_KEYWORDS_MODEL,
        "gpt-5",
        "gpt-5.2",
        "gpt-5-mini",
        "gpt-4o-mini",
      ]
        .map((value) => asText(value))
        .filter(Boolean)
    )
  );

  if (models.length === 0) return null;

  const prompt = [
    "You receive product titles in mixed languages (Chinese, Swedish, English).",
    `Return exactly ${limit} short ENGLISH working product titles.`,
    "Rules:",
    "1) Each title must describe what the product is (noun-focused), not usage or marketing text.",
    "2) Keep each title concise and reusable (2-8 words).",
    "3) One title per input title, preserve title order.",
    "4) Output must be English only.",
    `5) Return exactly ${limit} titles.`,
    '6) Output JSON only: {"keywords":["k1","k2"]}',
    "",
    "Titles:",
    ...titles
      .slice(0, limit)
      .map((title, index) => `${index + 1}. ${title.slice(0, 180)}`),
  ].join("\n");

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
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
      const parsed = extractJsonFromText(content);
      const keywords = normalizeKeywords(
        parsed?.keywords ?? parsed?.items ?? parsed?.result ?? null,
        limit
      );
      if (keywords.length > 0) return keywords.slice(0, limit);
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
};

const sanitizeFileName = (fileName: string) => {
  const safe = path.basename(fileName);
  return safe === fileName ? safe : "";
};

const cacheFilePathFor = (fileName: string) =>
  path.join(KEYWORD_CACHE_DIR, `${fileName}.json`);

const readPreviewEnglishTitles = (
  fileName: string,
  sourceMtimeMs: number,
  maxCount: number
) => {
  const safeName = sanitizeFileName(fileName);
  if (!safeName) return [] as string[];
  const cachePath = path.join(PREVIEW_TITLE_CACHE_DIR, `${safeName}.json`);
  if (!fs.existsSync(cachePath)) return [] as string[];
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      sourceMtimeMs?: number;
      items?: Array<{ index?: number; titleEn?: string }>;
    };
    if (Number(parsed?.sourceMtimeMs) !== Number(sourceMtimeMs)) return [] as string[];
    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const limit = Math.max(1, Math.min(20, Math.round(maxCount || 1)));
    return rows
      .filter((row) => Number.isInteger(Number(row?.index)))
      .sort((a, b) => Number(a.index) - Number(b.index))
      .map((row) => cleanTitle(asText(row.titleEn)))
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [] as string[];
  }
};

const isValidKeywordCache = (
  cache: unknown,
  sourceMtimeMs: number
): cache is QueueKeywordResult => {
  if (!cache || typeof cache !== "object") return false;
  const record = cache as QueueKeywordResult;
  if (Number(record?.cacheVersion || 0) !== KEYWORD_CACHE_VERSION) return false;
  if (Number(record?.sourceMtimeMs) !== Number(sourceMtimeMs)) return false;
  if (!Array.isArray(record?.keywords)) return false;
  if (typeof record?.label !== "string") return false;
  return true;
};

export const readQueueKeywordCacheForFile = (
  fileName: string
): QueueKeywordResult | null => {
  const safeName = sanitizeFileName(fileName);
  if (!safeName) return null;

  const filePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);

  const cachePath = cacheFilePathFor(safeName);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const rawCache = fs.readFileSync(cachePath, "utf8");
    const cache = JSON.parse(rawCache) as unknown;
    return isValidKeywordCache(cache, stat.mtimeMs) ? (cache as QueueKeywordResult) : null;
  } catch {
    return null;
  }
};

export const generateQueueKeywordsForFile = async (
  fileName: string,
  options?: { force?: boolean; mode?: "fast" | "full" }
): Promise<QueueKeywordResult> => {
  const safeName = sanitizeFileName(fileName);
  if (!safeName) {
    throw new Error("Invalid file name.");
  }
  const filePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error("File not found.");
  }

  const stat = fs.statSync(filePath);
  fs.mkdirSync(KEYWORD_CACHE_DIR, { recursive: true });
  const cachePath = cacheFilePathFor(safeName);
  const mode = options?.mode === "fast" ? "fast" : "full";

  if (!options?.force) {
    const cached = readQueueKeywordCacheForFile(safeName);
    if (cached) {
      if (mode === "fast") return cached;
      if (cached.source === "openai") return cached;
    }
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw);
  const entries = extractEntries(payload);
  const titles = entries
    .map((entry) =>
      entry && typeof entry === "object"
        ? extractMainTitle(entry as Record<string, unknown>)
        : ""
    )
    .filter(Boolean);
  const keywordTargetCount = Math.max(1, Math.min(20, titles.length));

  if (titles.length === 0) {
    const emptyResult: QueueKeywordResult = {
      sourceMtimeMs: stat.mtimeMs,
      updatedAt: new Date().toISOString(),
      keywords: [],
      label: "",
      source: "empty",
      cacheVersion: KEYWORD_CACHE_VERSION,
    };
    fs.writeFileSync(cachePath, JSON.stringify(emptyResult, null, 2), "utf8");
    return emptyResult;
  }

  const aiKeywords =
    mode === "full"
      ? await requestOpenAiKeywords(titles, keywordTargetCount)
      : null;
  const previewTitles = readPreviewEnglishTitles(
    safeName,
    stat.mtimeMs,
    keywordTargetCount
  );
  const preferredAiKeywords = previewTitles.length > 0 ? previewTitles : aiKeywords;
  const finalKeywords = mergeEnglishKeywords(
    preferredAiKeywords,
    titles,
    keywordTargetCount
  );
  const result: QueueKeywordResult = {
    sourceMtimeMs: stat.mtimeMs,
    updatedAt: new Date().toISOString(),
    keywords: finalKeywords,
    label: finalKeywords.join(", "),
    source: preferredAiKeywords?.length ? "openai" : "fallback",
    cacheVersion: KEYWORD_CACHE_VERSION,
  };
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf8");
  return result;
};
