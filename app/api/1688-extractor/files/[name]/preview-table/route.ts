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

type PreviewVariantRow = {
  comboIndex: number;
  labelZh: string;
  labelEn: string;
  labelRaw: string;
  imageUrl: string | null;
  priceText: string;
  weightText: string;
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

const normalizeVariantToken = (value: unknown) =>
  asText(value)
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .toLowerCase();

const toRemoteImageUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
};

const buildVariantLabelRaw = (combo: Record<string, unknown>) =>
  [
    combo.t1,
    combo.t2,
    combo.t3,
    combo.t1_zh,
    combo.t2_zh,
    combo.t3_zh,
    combo.t1_en,
    combo.t2_en,
    combo.t3_en,
  ]
    .map((value) => cleanText(asText(value)))
    .find(Boolean) || "";

const buildVariantLabelZh = (combo: Record<string, unknown>) => {
  const fromZh = [combo.t1_zh, combo.t2_zh, combo.t3_zh]
    .map((value) => cleanText(asText(value)))
    .filter(Boolean);
  if (fromZh.length > 0) return fromZh.join(" / ");
  const fallback = [combo.t1, combo.t2, combo.t3]
    .map((value) => cleanText(asText(value)))
    .filter((value) => value && containsChinese(value));
  return fallback.join(" / ");
};

const buildVariantLabelEn = (combo: Record<string, unknown>) => {
  const fromEn = [combo.t1_en, combo.t2_en, combo.t3_en]
    .map((value) => cleanText(asText(value)))
    .filter(Boolean);
  if (fromEn.length > 0) return fromEn.join(" / ");
  const fallback = [combo.t1, combo.t2, combo.t3]
    .map((value) => cleanText(asText(value)))
    .filter((value) => value && !containsChinese(value));
  return fallback.join(" / ");
};

const buildVariantPriceText = (combo: Record<string, unknown>) => {
  const direct = cleanText(
    asText(combo.priceRaw || combo.price_raw || combo.price_text || combo.priceText)
  );
  if (direct) return direct;
  const numeric = Number(combo.price);
  return Number.isFinite(numeric) ? `¥${numeric}` : "";
};

const buildVariantWeightText = (combo: Record<string, unknown>) => {
  const direct = cleanText(
    asText(
      combo.weightRaw ||
        combo.weight_raw ||
        combo.weightText ||
        combo.weight_text ||
        combo.weight
    )
  );
  if (direct) return direct;
  const grams = Number(combo.weight_grams ?? combo.weightGrams);
  return Number.isFinite(grams) ? `${Math.round(grams)}g` : "";
};

const collectVariantRows = (entry: Record<string, unknown>): PreviewVariantRow[] => {
  const variations =
    entry.variations && typeof entry.variations === "object"
      ? (entry.variations as Record<string, unknown>)
      : null;
  const combos = variations && Array.isArray(variations.combos) ? variations.combos : [];
  const variantImages = Array.isArray(entry.variant_images_1688)
    ? (entry.variant_images_1688 as unknown[])
    : [];

  const imageRows = variantImages
    .map((row) =>
      row && typeof row === "object" ? (row as Record<string, unknown>) : null
    )
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const imageByToken = new Map<string, string>();
  imageRows.forEach((row) => {
    const nameToken = normalizeVariantToken(row.name || row.label || row.text);
    const imageUrl = toRemoteImageUrl(
      row.url_full || row.full_url || row.image_full_url || row.url || row.image_url
    );
    if (!nameToken || !imageUrl) return;
    if (!imageByToken.has(nameToken)) imageByToken.set(nameToken, imageUrl);
  });

  const rows: PreviewVariantRow[] = combos
    .map((combo, index) => {
      const rec =
        combo && typeof combo === "object"
          ? (combo as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const comboIndex = Number(rec.index);
      const resolvedIndex =
        Number.isInteger(comboIndex) && comboIndex >= 0 ? comboIndex : index;
      const labelZh = buildVariantLabelZh(rec);
      const labelEn = buildVariantLabelEn(rec);
      const labelRaw =
        [rec.t1, rec.t2, rec.t3]
          .map((value) => cleanText(asText(value)))
          .filter(Boolean)
          .join(" / ") || buildVariantLabelRaw(rec);
      const labelCandidates = [
        rec.t1_zh,
        rec.t1,
        rec.t1_en,
        rec.t2_zh,
        rec.t2,
        rec.t2_en,
        rec.t3_zh,
        rec.t3,
        rec.t3_en,
      ]
        .map((value) => normalizeVariantToken(value))
        .filter(Boolean);

      let imageUrl = toRemoteImageUrl(
        rec.image_full_url || rec.image_zoom_url || rec.image_url || rec.image_thumb_url
      );
      if (!imageUrl) {
        for (const token of labelCandidates) {
          const direct = imageByToken.get(token);
          if (direct) {
            imageUrl = direct;
            break;
          }
          const partial = imageRows.find((row) => {
            const rowToken = normalizeVariantToken(row.name || row.label || row.text);
            if (!rowToken) return false;
            return rowToken.includes(token) || token.includes(rowToken);
          });
          if (partial) {
            imageUrl = toRemoteImageUrl(
              partial.url_full ||
                partial.full_url ||
                partial.image_full_url ||
                partial.url ||
                partial.image_url
            );
            if (imageUrl) break;
          }
        }
      }

      return {
        comboIndex: resolvedIndex,
        labelZh,
        labelEn,
        labelRaw,
        imageUrl: imageUrl || null,
        priceText: buildVariantPriceText(rec),
        weightText: buildVariantWeightText(rec),
      };
    })
    .filter((row) => row.labelZh || row.labelEn || row.labelRaw || row.imageUrl);

  if (rows.length > 0) return rows;

  const fallbackVariants = asText(entry.variants_1688)
    .split(/\r?\n/)
    .map((value) => cleanText(value))
    .filter(Boolean);
  return fallbackVariants.map((value, index) => ({
    comboIndex: index,
    labelZh: containsChinese(value) ? value : "",
    labelEn: containsChinese(value) ? "" : value,
    labelRaw: value,
    imageUrl: null,
    priceText: "",
    weightText: "",
  }));
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
    const record =
      row && typeof row === "object"
        ? (row as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const index = Number(record.index);
    if (!Number.isInteger(index) || index < 0) continue;
    const titleZh = cleanText(asText(record.titleZh || record.zh));
    const titleEn = cleanText(
      asText(
        record.titleEn ||
          record.en ||
          record.english ||
          record.translation
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
    const variants = collectVariantRows(source);
    return {
      ...item,
      variantCount: variants.length,
      supplierUrl: extractSupplierUrl(source),
      platformLabel: extractPlatformLabel(source),
      titleZh,
      titleEn,
      variants,
    };
  });

  return NextResponse.json({
    ...parsed,
    items: enrichedItems,
    previewItems: enrichedItems,
  });
}
