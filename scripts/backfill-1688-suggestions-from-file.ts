#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPPLIER_PAYLOAD_DIR } from "@/lib/1688-extractor";
import {
  PARTNER_SUGGESTION_DIR,
  PARTNER_SUGGESTION_PROVIDER,
  fetchAndNormalizeImage,
  normalizeExternalDataForRecord,
  saveSuggestionRecord,
  type ProductSuggestionRecord,
} from "@/lib/product-suggestions";

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key]) return;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
};

loadEnvFile("/srv/nordexo-hub/.env.local");
loadEnvFile("/srv/.env.local");

const EXTRACTOR_FILE =
  process.argv[2] ||
  "/srv/node-files/1688-extractor/1688_product_extraction_20260306_210709167.json";
const MAX_TRANSLATE = 30;
const TITLE_BLOCKLIST = [
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
  "商品属性",
  "商品资质",
  "包装信息",
  "商品详情",
  "加采购车",
  "立即下单",
  "库存",
  "商品件重尺",
  "关于质量",
  "质量问题",
  "本店",
  "负责处理",
  "同款商品",
  "多个平台",
  "累计销量",
  "淘宝",
  "天猫",
  "电子商务平台",
  "销量",
];
const STOREISH_TITLE_RE = /(旗舰店|专营店|店铺|商行|有限公司|工厂|鞋厂|公司介绍|企业店)/i;

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const hasCjk = (value: unknown) => /[\u3400-\u9fff]/.test(asText(value));

const canonicalOfferUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const match = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (match?.[1]) return `https://detail.1688.com/offer/${match[1]}.html`;
  return raw;
};

const extractOfferId = (value: unknown) => {
  const text = asText(value);
  const match = text.match(/\/offer\/(\d{6,})\.html/i);
  return match?.[1] || "";
};

const isStoreishTitle = (value: unknown) => {
  const text = asText(value);
  if (!text) return false;
  return STOREISH_TITLE_RE.test(text) && text.length <= 64;
};

const cleanReadableLine = (value: unknown) =>
  asText(value)
    .replace(/\s+/g, " ")
    .replace(/[|｜•·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const inferTitleFromReadable1688 = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => cleanReadableLine(line))
    .filter(Boolean);
  if (!lines.length) return "";

  const candidates = lines
    .filter((line) => hasCjk(line))
    .filter((line) => line.length >= 6 && line.length <= 90)
    .filter((line) => !/^[-\d\s.,%]+$/.test(line))
    .filter((line) => !line.includes("\t"))
    .filter(
      (line) =>
        !TITLE_BLOCKLIST.some((token) => line.includes(token)) &&
        !line.includes("¥") &&
        !line.includes("￥")
    )
    .map((line, idx) => {
      let score = 0;
      score += Math.min(60, line.length);
      if (!/[A-Za-z]/.test(line)) score += 8;
      if (idx < Math.max(20, Math.round(lines.length * 0.35))) score += 10;
      if (isStoreishTitle(line)) score -= 24;
      if (/(同款商品|平台|销量|质量问题|本店|关于质量|负责处理)/.test(line)) score -= 60;
      if ((line.match(/[，,]/g) || []).length >= 4) score -= 20;
      if (/^(跨境|新款|春秋|夏季|秋冬|冬季|男女|男士|女士|儿童|户外|运动)/.test(line)) {
        score += 10;
      }
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.line || "";
};

const normalizeHttpUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeImageUrlList = (values: unknown[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    const normalized = normalizeHttpUrl(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 120) break;
  }
  return out;
};

const pickItemTitle = (item: Record<string, unknown>) => {
  const direct = asText(
    item.product_title ||
      item.title ||
      item.name ||
      item.title_1688 ||
      item.title_cn ||
      item.title_zh ||
      item.offerTitle ||
      item.subject
  );
  if (!direct) return "";
  if (!isStoreishTitle(direct)) return direct;
  const fallback = inferTitleFromReadable1688(item.readable_1688 || item.readable_1688_raw);
  return fallback || direct;
};

const normalizeCombosForCache = (value: unknown) => {
  const combos = Array.isArray(value) ? value : [];
  return combos
    .map((entry) =>
      entry && typeof entry === "object"
        ? ({ ...(entry as Record<string, unknown>) } as Record<string, unknown>)
        : null
    )
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const normalizeVariantSelection = (value: unknown, comboCount: number) => {
  const selection = toObjectRecord(value);
  const selectedComboIndexes = Array.isArray(selection.selected_combo_indexes)
    ? (selection.selected_combo_indexes as unknown[])
        .map((entry) => Number(entry))
        .filter(
          (entry) =>
            Number.isInteger(entry) && entry >= 0 && (!comboCount || entry < comboCount)
        )
    : [];
  const packs = Array.isArray(selection.packs)
    ? (selection.packs as unknown[])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];
  const comboOverrides = Array.isArray(selection.combo_overrides)
    ? (selection.combo_overrides as unknown[])
        .map((entry) => {
          const row = toObjectRecord(entry);
          const index = Number(row.index);
          if (!Number.isInteger(index) || index < 0 || (comboCount && index >= comboCount)) {
            return null;
          }
          const price = Number(row.price);
          const weightGrams = Number(row.weight_grams ?? row.weightGrams);
          return {
            index,
            price: Number.isFinite(price) && price > 0 ? price : null,
            weight_grams:
              Number.isFinite(weightGrams) && weightGrams > 0 ? Math.round(weightGrams) : null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    selected_combo_indexes: Array.from(new Set(selectedComboIndexes)).sort((a, b) => a - b),
    packs: Array.from(new Set(packs)).sort((a, b) => a - b),
    packs_text: asText(selection.packs_text),
    combo_overrides: comboOverrides,
  };
};

const extractSelectedVariantIndexesFromCombos = (combos: Array<Record<string, unknown>>) => {
  const out: number[] = [];
  combos.forEach((combo, index) => {
    const quantity = Number(combo.quantity ?? combo.qty ?? combo.selected_qty);
    if (Number.isFinite(quantity) && quantity > 0) out.push(index);
  });
  return out;
};

const extractJsonFromText = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const translateTitlesBestEffort = async (titles: string[]) => {
  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) return new Map<string, string>();

  const uniqueTitles = Array.from(new Set(titles.map((entry) => asText(entry)).filter(Boolean)));
  const limited = uniqueTitles.filter((entry) => hasCjk(entry)).slice(0, MAX_TRANSLATE);
  if (!limited.length) return new Map<string, string>();

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.NODEXO_1688_TITLE_TRANSLATE_MODEL,
        "gpt-5-mini",
        "gpt-5-nano",
      ]
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );
  if (!models.length) return new Map<string, string>();

  const prompt = [
    "Translate Chinese 1688 product titles into concise, natural English.",
    "Return JSON only.",
    'Format: { "items": [ { "source": "...", "english_title": "..." } ] }',
    "Rules:",
    "1) Keep key product nouns and technical attributes.",
    "2) Remove hype/marketing words.",
    "3) Max 120 characters per title.",
    "",
    "Titles:",
    ...limited.map((entry, idx) => `${idx + 1}. ${entry}`),
  ].join("\n");

  let parsed: Record<string, unknown> | null = null;
  for (const model of models) {
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
      const extracted = extractJsonFromText(payload?.choices?.[0]?.message?.content);
      if (extracted && typeof extracted === "object") {
        parsed = extracted as Record<string, unknown>;
        break;
      }
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }

  const out = new Map<string, string>();
  const rows = Array.isArray(parsed?.items) ? parsed.items : [];
  rows.forEach((row, index) => {
    const rec = toObjectRecord(row);
    const source = asText(rec.source || limited[index]);
    const english = asText(
      rec.english_title || rec.englishTitle || rec.title_en || rec.translation || rec.english
    ).slice(0, 120);
    if (!source || !english || hasCjk(english)) return;
    out.set(source, english);
  });

  const translateSingle = async (source: string) => {
    const prompt = [
      "Translate this Chinese supplier product title into concise, natural English.",
      "Keep key product nouns and technical attributes, remove marketing filler, max 120 chars.",
      'Return JSON only with format: { "english_title": "..." }',
      "",
      `Title: ${source}`,
    ].join("\n");
    for (const model of models) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
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
        const extracted = extractJsonFromText(payload?.choices?.[0]?.message?.content);
        const rec = toObjectRecord(extracted);
        const english = asText(
          rec.english_title || rec.englishTitle || rec.title_en || rec.translation || rec.english
        ).slice(0, 120);
        if (english && !hasCjk(english)) return english;
      } catch {
        // try next model
      } finally {
        clearTimeout(timeout);
      }
    }
    return "";
  };

  for (const source of limited) {
    if (out.has(source)) continue;
    const translated = await translateSingle(source);
    if (translated) out.set(source, translated);
  }

  return out;
};

const sanitizeFilePart = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "item";

const nowStamp = () => {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
};

const main = async () => {
  if (!fs.existsSync(EXTRACTOR_FILE)) {
    throw new Error(`Extractor file not found: ${EXTRACTOR_FILE}`);
  }

  const extractorItemsRaw = JSON.parse(fs.readFileSync(EXTRACTOR_FILE, "utf8")) as unknown[];
  const extractorItems = Array.isArray(extractorItemsRaw)
    ? extractorItemsRaw
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => entry as Record<string, unknown>)
    : [];

  const byOfferUrl = new Map<string, Record<string, unknown>>();
  for (const item of extractorItems) {
    const offerUrl = canonicalOfferUrl(item.url_1688 || item.detail_url || item.detailUrl);
    if (!offerUrl) continue;
    byOfferUrl.set(offerUrl, item);
  }
  if (!byOfferUrl.size) {
    throw new Error("No valid 1688 offer URLs found in extractor file.");
  }

  const suggestionFiles = fs
    .readdirSync(PARTNER_SUGGESTION_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"));

  const matches: Array<{
    fileName: string;
    filePath: string;
    record: ProductSuggestionRecord;
    offerUrl: string;
    item: Record<string, unknown>;
  }> = [];

  for (const fileName of suggestionFiles) {
    const filePath = path.join(PARTNER_SUGGESTION_DIR, fileName);
    let parsed: ProductSuggestionRecord | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ProductSuggestionRecord;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const sourcePlatform = asText((parsed as Record<string, unknown>).source_platform);
    if (!sourcePlatform.toLowerCase().includes("1688")) continue;
    const offerUrl = canonicalOfferUrl(parsed.sourceUrl || parsed.crawlFinalUrl);
    if (!offerUrl) continue;
    const item = byOfferUrl.get(offerUrl);
    if (!item) continue;
    matches.push({ fileName, filePath, record: parsed, offerUrl, item });
  }

  if (!matches.length) {
    console.log("No matching suggestion rows found for this extractor file.");
    return;
  }

  const titleCandidates = matches
    .map(({ item }) => {
      const title = pickItemTitle(item);
      if (!title || !hasCjk(title)) return "";
      return title;
    })
    .filter(Boolean);
  const translatedTitles = await translateTitlesBestEffort(titleCandidates);

  const supabaseUrl = asText(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceKey = asText(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_KEY
  );
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase credentials in environment.");
  }
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  fs.mkdirSync(PRODUCTION_SUPPLIER_PAYLOAD_DIR, { recursive: true });
  const importedAt = new Date().toISOString();
  const stamp = nowStamp();

  const repaired: Array<{
    id: string;
    oldTitle: string;
    newTitle: string;
    mainImage: string;
    offers: number;
    combos: number;
  }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const { record, item, offerUrl } = matches[index];
    const id = asText(record.id);
    if (!id) continue;

    const baseTitle = pickItemTitle(item);
    const translatedTitle = translatedTitles.get(baseTitle || "") || "";
    const title = translatedTitle || baseTitle || asText(record.title);
    const description = asText(
      item.product_description || item.description || item.readable_1688 || item.readable_1688_raw
    ).slice(0, 12000);

    const imageUrls = normalizeImageUrlList([
      item.main_image_1688,
      ...(Array.isArray(item.image_urls_1688) ? item.image_urls_1688 : []),
      ...(Array.isArray(item.gallery_image_urls_1688) ? item.gallery_image_urls_1688 : []),
      ...(Array.isArray(item.description_image_urls_1688) ? item.description_image_urls_1688 : []),
      ...(Array.isArray(item.variant_image_urls) ? item.variant_image_urls : []),
    ]);
    const remoteMainImageUrl = imageUrls[0] || "";

    let normalizedImage = record.image || null;
    let mainImageUrl = remoteMainImageUrl || asText(record.mainImageUrl);
    if (remoteMainImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(remoteMainImageUrl);
        normalizedImage = fetched.image;
        mainImageUrl = fetched.image.publicPath;
      } catch {
        // fallback to remote URL
      }
    }

    const existingErrors = Array.isArray(record.errors) ? record.errors : [];
    const errors = existingErrors
      .map((entry) => asText(entry))
      .filter(Boolean)
      .filter(
        (entry) =>
          !/No product image URL found in uploaded suggestion/i.test(entry) &&
          !/Supplier search timed out/i.test(entry) &&
          !/Source crawl timed out/i.test(entry)
      );
    if (!mainImageUrl) {
      errors.push("No product image URL found in uploaded suggestion.");
    }

    const oldTitle = asText(record.title);
    const variations = toObjectRecord(item.variations);
    const combos = normalizeCombosForCache(variations.combos);
    const baseSelection = normalizeVariantSelection(item.production_variant_selection, combos.length);
    const fallbackSelectedIndexes =
      baseSelection.selected_combo_indexes.length > 0
        ? baseSelection.selected_combo_indexes
        : extractSelectedVariantIndexesFromCombos(combos);
    const selectedComboIndexes =
      fallbackSelectedIndexes.length > 0
        ? fallbackSelectedIndexes
        : combos.map((_, comboIndex) => comboIndex);
    const variantSelection = {
      ...baseSelection,
      selected_combo_indexes: Array.from(new Set(selectedComboIndexes)).sort((a, b) => a - b),
    };
    const offerId = asText(item.selected_supplier_offer_id) || extractOfferId(offerUrl) || null;

    const externalDataBase = toObjectRecord((record as unknown as Record<string, unknown>).externalData);
    const patched = normalizeExternalDataForRecord({
      ...record,
      sourceType: "url",
      sourceUrl: offerUrl || mainImageUrl || record.sourceUrl || null,
      crawlFinalUrl: null,
      title: title || null,
      description: description || null,
      mainImageUrl: mainImageUrl || null,
      galleryImageUrls: imageUrls,
      image: normalizedImage,
      errors,
      searchJob: {
        status: "done",
        queuedAt: null,
        startedAt: importedAt,
        finishedAt: importedAt,
        error: null,
        lastRunAt: importedAt,
      },
      sourceJob: {
        status: "done",
        stage: "done",
        queuedAt: null,
        startedAt: importedAt,
        finishedAt: importedAt,
        updatedAt: importedAt,
        error: null,
      },
      reviewStatus: record.reviewStatus || "new",
      externalData: {
        ...externalDataBase,
        title: title || null,
        rawTitle: baseTitle || title || null,
        description: description || null,
        rawDescription: description || null,
        mainImageUrl: mainImageUrl || null,
        rawMainImageUrl: mainImageUrl || null,
        galleryImageUrls: imageUrls,
        imageCount: imageUrls.length,
        status: {
          title: {
            ok: Boolean(title),
            value: title || null,
          },
          description: {
            ok: Boolean(description),
            value: description || null,
          },
          images: {
            ok: Boolean(mainImageUrl || imageUrls.length),
            count: imageUrls.length,
            mainImageUrl: mainImageUrl || null,
          },
        },
        errors,
        updatedAt: importedAt,
      },
    } as ProductSuggestionRecord);

    const mutableRecord = patched as Record<string, unknown>;
    const attrs = toObjectRecord(mutableRecord.platform_attributes);
    const attrs1688 = toObjectRecord(attrs["1688"]);
    mutableRecord.source_platform = "1688";
    mutableRecord.payload_type = "product_suggestions_browser_v1";
    mutableRecord.platform_attributes = {
      ...attrs,
      "1688": {
        ...attrs1688,
        offer_id: offerId,
        offer_url: offerUrl,
        gallery_image_urls: Array.isArray(item.gallery_image_urls_1688)
          ? item.gallery_image_urls_1688
          : [],
        description_image_urls: Array.isArray(item.description_image_urls_1688)
          ? item.description_image_urls_1688
          : [],
      },
    };
    mutableRecord.extension_payload_1688 = item;
    const finalRecord = normalizeExternalDataForRecord(mutableRecord as ProductSuggestionRecord);
    await saveSuggestionRecord(finalRecord);

    const payloadItem = {
      ...(item as Record<string, unknown>),
      production_provider: PARTNER_SUGGESTION_PROVIDER,
      production_product_id: id,
      url_1688: offerUrl,
      url_1688_list: [offerUrl],
    };
    const payloadFileName = `production_supplier_${sanitizeFilePart(
      PARTNER_SUGGESTION_PROVIDER
    )}_${sanitizeFilePart(id)}_${stamp}_${String(index + 1).padStart(3, "0")}.json`;
    const payloadFilePath = path.join(PRODUCTION_SUPPLIER_PAYLOAD_DIR, payloadFileName);
    fs.writeFileSync(payloadFilePath, JSON.stringify(payloadItem, null, 2), "utf8");

    const selectedOffer = {
      offerId,
      detailUrl: offerUrl,
      imageUrl: remoteMainImageUrl || null,
      subject: baseTitle || null,
      subject_en: translatedTitle || (!hasCjk(baseTitle) ? baseTitle : null),
      _production_payload_status: "ready",
      _production_payload_source: "extension_json_backfill",
      _production_payload_error: null,
      _production_payload_file_name: payloadFileName,
      _production_payload_file_path: payloadFilePath,
      _production_payload_updated_at: importedAt,
      _production_payload_saved_at: importedAt,
      _production_variant_selection: variantSelection,
      _production_variant_cache: {
        cached_at: importedAt,
        payload_file_path: payloadFilePath,
        available_count: combos.length,
        type1_label: asText(variations.type1_label || variations.type1Label),
        type2_label: asText(variations.type2_label || variations.type2Label),
        type3_label: asText(variations.type3_label || variations.type3Label),
        combos,
        gallery_images: Array.isArray(item.image_urls_1688) ? item.image_urls_1688 : [],
        weight_review:
          item.weight_review_1688 && typeof item.weight_review_1688 === "object"
            ? item.weight_review_1688
            : null,
      },
    };

    await Promise.all([
      adminClient
        .from("discovery_production_supplier_searches")
        .upsert(
          {
            provider: PARTNER_SUGGESTION_PROVIDER,
            product_id: id,
            fetched_at: importedAt,
            offers: [
              {
                rank: 1,
                offerId,
                detailUrl: offerUrl,
                imageUrl: remoteMainImageUrl || null,
                subject: baseTitle || null,
                subject_en: translatedTitle || (!hasCjk(baseTitle) ? baseTitle : null),
              },
            ],
            input: {
              source: "backfill_1688_from_file",
              mode: "preloaded_1688",
              file: path.basename(EXTRACTOR_FILE),
            },
            meta: {
              source: "backfill_1688_from_file",
              preloaded: true,
              payload_file_name: payloadFileName,
            },
          },
          { onConflict: "provider,product_id" }
        ),
      adminClient
        .from("discovery_production_supplier_selection")
        .upsert(
          {
            provider: PARTNER_SUGGESTION_PROVIDER,
            product_id: id,
            selected_offer_id: offerId,
            selected_detail_url: offerUrl,
            selected_offer: selectedOffer,
            selected_at: importedAt,
            selected_by: asText(record.createdBy) || null,
            updated_at: importedAt,
          },
          { onConflict: "provider,product_id" }
        ),
    ]);

    repaired.push({
      id,
      oldTitle,
      newTitle: title,
      mainImage: mainImageUrl || "",
      offers: 1,
      combos: combos.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        extractor_file: EXTRACTOR_FILE,
        repaired_count: repaired.length,
        repaired,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
