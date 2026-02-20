import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { EXTRACTOR_UPLOAD_DIR, readExtractorFile } from "@/lib/1688-extractor";

export const runtime = "nodejs";

type PreviewTitleRow = {
  index: number;
  titleZh: string;
  titleEn: string;
};

type PreviewTitleCache = {
  sourceMtimeMs: number;
  updatedAt: string;
  items: PreviewTitleRow[];
};

const PREVIEW_CACHE_DIR = path.join(EXTRACTOR_UPLOAD_DIR, "_preview_table_cache");

const TITLE_KEYS = [
  "title_1688",
  "title_cn",
  "title_zh",
  "subject",
  "subject_cn",
  "subject_zh",
  "title",
  "product_title",
  "productTitle",
  "name",
];

const IGNORE_LINE_TOKENS = [
  "客服",
  "回头率",
  "商品评价",
  "查看全部评价",
  "登录查看全部",
  "服务",
  "物流",
  "发货",
  "材质",
  "品牌",
  "规格",
  "货号",
  "价格",
  "评价",
  "全部",
  "店铺",
];

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const cleanText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[|｜•·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const containsChinese = (value: string) => /[\u4e00-\u9fff]/.test(value);

const firstText = (entry: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = cleanText(asText(entry[key]));
    if (value) return value;
  }
  return "";
};

const extractEntries = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as Record<
      string,
      unknown
    >[];
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const arrays = ["items", "urls", "data", "products", "results"];
  for (const key of arrays) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter(
        (item) => item && typeof item === "object"
      ) as Record<string, unknown>[];
    }
  }
  return [];
};

const extractReadableTitle = (readable: unknown) => {
  const raw = asText(readable);
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const ranked = lines
    .filter((line) => containsChinese(line))
    .filter((line) => line.length >= 5 && line.length <= 48)
    .filter((line) => !/^\d+([.,]\d+)?$/.test(line))
    .filter((line) => !line.includes("\t"))
    .filter(
      (line) =>
        !IGNORE_LINE_TOKENS.some((token) => line.includes(token)) &&
        !/%/.test(line)
    )
    .map((line) => ({ line, score: line.length }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.line ?? "";
};

const extractSupplierUrl = (entry: Record<string, unknown>) => {
  const direct = firstText(entry, [
    "url_1688",
    "url",
    "link",
    "product_url",
    "productUrl",
    "detail_url",
    "detailUrl",
    "offer_url",
    "offerUrl",
  ]);
  if (direct) return direct;
  if (entry.competitor_data && typeof entry.competitor_data === "object") {
    const sourceUrl = cleanText(
      asText((entry.competitor_data as Record<string, unknown>).source_url)
    );
    if (sourceUrl) return sourceUrl;
  }
  return "";
};

const extractPlatformLabel = (entry: Record<string, unknown>) => {
  const labels: string[] = [];
  const seen = new Set<string>();

  const addLabel = (label: string) => {
    const normalized = label.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(normalized);
  };

  const probeValues: string[] = [];
  const pushValue = (value: unknown) => {
    const text = cleanText(asText(value)).toLowerCase();
    if (text) probeValues.push(text);
  };

  pushValue(entry.production_provider);
  pushValue(entry.provider);
  pushValue(entry.source);
  pushValue(entry.source_platform);
  pushValue(entry.sourcePlatform);
  pushValue(entry.url);
  pushValue(entry.url_1688);
  pushValue(entry.supplier_url);

  if (entry.competitor_data && typeof entry.competitor_data === "object") {
    const competitor = entry.competitor_data as Record<string, unknown>;
    pushValue(competitor.provider);
    pushValue(competitor.source_url);
    pushValue(competitor.title);
  }

  if (Array.isArray(entry.notes)) {
    entry.notes.forEach((note) => pushValue(note));
  }

  const joined = probeValues.join(" | ");
  if (joined.includes("fyndiq")) addLabel("Fyndiq");
  if (joined.includes("digideal") || joined.includes("digideal.se")) {
    addLabel("DigiDeal.se");
  }

  return labels.length ? labels.join(", ") : "1688 only";
};

const extractChineseTitleCandidate = (entry: Record<string, unknown>) => {
  for (const key of TITLE_KEYS) {
    const value = cleanText(asText(entry[key]));
    if (value && containsChinese(value)) return value;
  }
  const readable = extractReadableTitle(entry.readable_1688);
  if (readable) return readable;
  return "";
};

const extractFallbackTitle = (
  entry: Record<string, unknown>,
  parsedTitle: string
) => {
  const fromKeys = firstText(entry, TITLE_KEYS);
  if (fromKeys) return fromKeys;
  if (entry.competitor_data && typeof entry.competitor_data === "object") {
    const competitorTitle = cleanText(
      asText((entry.competitor_data as Record<string, unknown>).title)
    );
    if (competitorTitle) return competitorTitle;
  }
  return cleanText(parsedTitle);
};

const extractJsonFromText = (text: string) => {
  const raw = asText(text);
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

const normalizeAiRows = (value: unknown) => {
  if (!Array.isArray(value)) return [] as PreviewTitleRow[];
  const rows: PreviewTitleRow[] = [];
  for (const row of value) {
    const index = Number((row as any)?.index);
    if (!Number.isInteger(index) || index < 0) continue;
    const titleZh = cleanText(asText((row as any)?.titleZh || (row as any)?.zh));
    const titleEn = cleanText(
      asText(
        (row as any)?.titleEn ||
          (row as any)?.en ||
          (row as any)?.english ||
          (row as any)?.translation
      )
    );
    if (!titleZh && !titleEn) continue;
    rows.push({ index, titleZh, titleEn });
  }
  return rows;
};

const requestPreviewTitles = async (
  inputRows: Array<{
    index: number;
    titleZhCandidate: string;
    fallbackTitle: string;
  }>
) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey || inputRows.length === 0) return null;

  const models = Array.from(
    new Set(
      [process.env.PREVIEW_TRANSLATE_MODEL, "gpt-4o-mini", "gpt-5-mini"]
        .map((value) => asText(value))
        .filter(Boolean)
    )
  );
  if (!models.length) return null;

  const promptRows = inputRows.slice(0, 250).map((row) => ({
    index: row.index,
    titleZhCandidate: row.titleZhCandidate || "",
    fallbackTitle: row.fallbackTitle || "",
  }));

  const prompt = [
    "You receive product titles and context for one batch row at a time.",
    "Return JSON only.",
    "For each row, output:",
    "1) titleZh: concise Chinese product noun title (no marketing, no use-case sentence).",
    "2) titleEn: concise English working title, 2-8 words, noun-focused.",
    "If titleZhCandidate is valid Chinese, preserve meaning and clean wording only.",
    "Output format:",
    '{"items":[{"index":0,"titleZh":"...","titleEn":"..."}]}',
    "",
    `Rows: ${JSON.stringify(promptRows)}`,
  ].join("\n");

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
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
      const rows = normalizeAiRows(parsed?.items ?? parsed?.result ?? null);
      if (rows.length > 0) return rows;
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  let decodedName = "";
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const safeName = path.basename(decodedName);
  if (!safeName || safeName !== decodedName) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const filePath = path.join(EXTRACTOR_UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = readExtractorFile(safeName);
  if (!parsed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true });
  const cachePath = path.join(PREVIEW_CACHE_DIR, `${safeName}.json`);

  let cachedRows = new Map<number, PreviewTitleRow>();
  if (fs.existsSync(cachePath)) {
    try {
      const rawCache = fs.readFileSync(cachePath, "utf8");
      const cache = JSON.parse(rawCache) as PreviewTitleCache;
      if (
        Number(cache?.sourceMtimeMs) === Number(stat.mtimeMs) &&
        Array.isArray(cache?.items)
      ) {
        cachedRows = new Map(
          cache.items
            .filter((row) => Number.isInteger(row?.index))
            .map((row) => [row.index, row])
        );
      }
    } catch {
      cachedRows = new Map();
    }
  }

  const rawPayload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rawEntries = extractEntries(rawPayload);
  const rawByIndex = new Map<number, Record<string, unknown>>();
  rawEntries.forEach((entry, index) => rawByIndex.set(index, entry));

  const aiInput = (parsed.items ?? []).map((item) => {
    const source = rawByIndex.get(item.index) ?? {};
    return {
      index: item.index,
      titleZhCandidate: extractChineseTitleCandidate(source),
      fallbackTitle: extractFallbackTitle(source, item.title),
    };
  });

  let aiRows: PreviewTitleRow[] = [];
  if (cachedRows.size === 0) {
    aiRows = (await requestPreviewTitles(aiInput)) ?? [];
    const cachePayload: PreviewTitleCache = {
      sourceMtimeMs: stat.mtimeMs,
      updatedAt: new Date().toISOString(),
      items: aiRows,
    };
    try {
      fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), "utf8");
    } catch {
      // ignore cache write errors
    }
    cachedRows = new Map(aiRows.map((row) => [row.index, row]));
  }

  const enrichedItems = (parsed.items ?? []).map((item) => {
    const source = rawByIndex.get(item.index) ?? {};
    const cached = cachedRows.get(item.index);
    const fallbackZh = extractChineseTitleCandidate(source);
    const fallbackTitle = extractFallbackTitle(source, item.title);
    const titleZh = cleanText(cached?.titleZh || fallbackZh || fallbackTitle).slice(
      0,
      120
    );
    const titleEn = cleanText(cached?.titleEn || fallbackTitle).slice(0, 140);
    return {
      ...item,
      supplierUrl: extractSupplierUrl(source),
      platformLabel: extractPlatformLabel(source),
      titleZh,
      titleEn,
    };
  });

  return NextResponse.json({
    ...parsed,
    items: enrichedItems,
    previewItems: enrichedItems,
  });
}
