#!/usr/bin/env node

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { scrapeCdonFromHtml } from "./competitor-scrapers/cdon.mjs";
import { scrapeFyndiqFromHtml } from "./competitor-scrapers/fyndiq.mjs";
import { loadDigidealFromSupabase } from "./competitor-scrapers/digideal.mjs";
import {
  extractJsonFromText as parseJsonFromText,
  normalizeNameLoose as normalizeVariantNameLoose,
  normalizeNameStrict as normalizeVariantNameStrict,
  parseVariantWeightTableFromReadableText,
} from "../shared/1688/core.mjs";
import { reviewSupplierWeightBestEffort } from "../shared/1688/weight-review.mjs";
import { enhance1688ItemWithAi } from "../shared/1688/ai-pipeline.mjs";

const EXTRACTOR_CLI_PATH = "/srv/node-tools/1688-extractor/src/offer_detail_cli.js";
const OUTPUT_DIR =
  process.env.NODEXO_PRODUCTION_PAYLOAD_DIR ||
  path.join(
    process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor",
    "_production_queue_payloads"
  );
const PARTNER_SUGGESTION_DIR =
  process.env.PARTNER_PRODUCT_SUGGESTIONS_DIR ||
  "/srv/node-files/partner-product-suggestions";
const REQUEST_TIMEOUT_MS = 25_000;

const parseArgs = (argv) => {
  const out = { provider: "", productId: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = String(argv[i] || "").trim();
    const val = String(argv[i + 1] || "").trim();
    if (key === "--provider") out.provider = val;
    if (key === "--product-id" || key === "--product_id") out.productId = val;
  }
  return out;
};

const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const firstString = (...values) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const sanitizeFilePart = (value) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "item";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const decodeEntities = (value) =>
  String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripHtml = (value) =>
  decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const uniqueUrls = (values) => {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = asText(value);
    if (!text || !isHttpUrl(text)) continue;
    const key = text.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

const toAbsoluteUrl = (baseUrl, maybeRelative) => {
  const raw = asText(maybeRelative);
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (!baseUrl) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
};

const extractOfferId = (detailUrl, fallbackId = "") => {
  const fromFallback = asText(fallbackId);
  if (fromFallback) return fromFallback;
  const raw = asText(detailUrl);
  if (!raw) return "";
  const match = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  return match?.[1] ? match[1] : "";
};

const canonical1688Url = (detailUrl, offerId = "") => {
  const id = extractOfferId(detailUrl, offerId);
  if (id) return `https://detail.1688.com/offer/${id}.html`;
  return asText(detailUrl);
};

const toPriceNumber = (value) => {
  const text = asText(value).replace(",", ".");
  if (!text) return null;
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
};

const enrichVariantWeightsFromReadableText = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const extracted =
    payload.extracted && typeof payload.extracted === "object" ? payload.extracted : null;
  if (!extracted) return payload;
  const variations =
    extracted.variations && typeof extracted.variations === "object"
      ? extracted.variations
      : null;
  const combos = Array.isArray(variations?.combos) ? variations.combos : null;
  if (!combos || combos.length === 0) return payload;

  const table = parseVariantWeightTableFromReadableText(extracted.readableText);
  const fallbackFromTable =
    Array.isArray(table.weights) && table.weights.length > 0
      ? Math.max(
          ...table.weights.filter(
            (entry) => Number.isFinite(Number(entry)) && Number(entry) > 0
          )
        )
      : null;
  if (
    (!table.weightByName || table.weightByName.size === 0) &&
    (!fallbackFromTable || !Number.isFinite(Number(fallbackFromTable)))
  ) {
    return payload;
  }

  const nextCombos = combos.map((combo) => {
    if (!combo || typeof combo !== "object") return combo;
    const row = { ...combo };
    const candidates = [
      row.t1,
      row.t1_zh,
      row.t1_en,
      row.t2,
      row.t2_zh,
      row.t2_en,
      row.t3,
      row.t3_zh,
      row.t3_en,
      row.name,
    ]
      .map((v) => asText(v))
      .filter(Boolean);

    const strictKeys = candidates.map((c) => normalizeVariantNameStrict(c)).filter(Boolean);
    const looseKeys = candidates.map((c) => normalizeVariantNameLoose(c)).filter(Boolean);
    const grams =
      strictKeys.map((k) => table.weightByName.get(k)).find((v) => Number.isFinite(Number(v)) && Number(v) > 0) ??
      looseKeys.map((k) => table.weightByName.get(k)).find((v) => Number.isFinite(Number(v)) && Number(v) > 0) ??
      (Number.isFinite(Number(fallbackFromTable)) && Number(fallbackFromTable) > 0
        ? Number(fallbackFromTable)
        : null) ??
      null;
    if (!grams) return row;

    row.weight_grams = Number(grams);
    row.weightRaw = `${Number(grams)}g`;
    return row;
  });

  return {
    ...payload,
    extracted: {
      ...extracted,
      variations: {
        ...variations,
        combos: nextCombos,
      },
    },
  };
};

const getVariationQuality = (payload) => {
  const combos = Array.isArray(payload?.extracted?.variations?.combos)
    ? payload.extracted.variations.combos
    : [];
  const prices = combos
    .map((combo) => {
      const direct = toPriceNumber(combo?.price);
      if (direct !== null) return direct;
      return toPriceNumber(combo?.priceRaw ?? combo?.price_raw);
    })
    .filter((entry) => entry !== null);
  const uniquePrices = new Set(prices.map((entry) => Number(entry).toFixed(4)));
  return {
    combos: combos.length,
    priced: prices.length,
    uniquePrices: uniquePrices.size,
  };
};

const isLikelyFlatPriceExtraction = (quality) =>
  quality.combos >= 2 && quality.priced >= 2 && quality.uniquePrices <= 1;

const isBetterVariationQuality = (next, current) => {
  if (next.uniquePrices !== current.uniquePrices) {
    return next.uniquePrices > current.uniquePrices;
  }
  if (next.priced !== current.priced) {
    return next.priced > current.priced;
  }
  if (next.combos !== current.combos) {
    return next.combos > current.combos;
  }
  return false;
};

const isLikelyCaptchaReadableText = (value) => {
  const text = asText(value).toLowerCase();
  if (!text) return false;
  return (
    text.includes("请按住滑块") ||
    text.includes("拖动到最右边") ||
    text.includes("通过验证以确保正常访问") ||
    text.includes("滑块完成验证") ||
    text.includes("security check") ||
    text.includes("drag the slider") ||
    text.includes("complete verification")
  );
};

const collectExtractorImageCandidates = (payload) => {
  const extracted =
    payload && typeof payload === "object" && payload.extracted && typeof payload.extracted === "object"
      ? payload.extracted
      : null;
  const root = payload && typeof payload === "object" ? payload : null;
  const candidates = [
    extracted?.mainImageUrl,
    root?.mainImageUrl,
    ...(Array.isArray(extracted?.imageUrls) ? extracted.imageUrls : []),
    ...(Array.isArray(root?.imageUrls) ? root.imageUrls : []),
    ...(Array.isArray(extracted?.variantImages)
      ? extracted.variantImages
          .map((entry) => firstString(entry?.url_full, entry?.url))
      : []),
  ]
    .map((entry) => asText(entry))
    .filter(Boolean);
  return uniqueUrls(candidates);
};

const summarizeExtractorPayload = (payload) => {
  const extracted =
    payload && typeof payload === "object" && payload.extracted && typeof payload.extracted === "object"
      ? payload.extracted
      : null;
  const variations =
    extracted?.variations && typeof extracted.variations === "object"
      ? extracted.variations
      : payload?.variations && typeof payload.variations === "object"
        ? payload.variations
        : null;
  const comboCount = Array.isArray(variations?.combos) ? variations.combos.length : 0;
  const imageCount = collectExtractorImageCandidates(payload).length;
  const readable = firstString(
    extracted?.readableText,
    extracted?.text_1688?.readable_full,
    extracted?.text_1688?.readable_compact,
    payload?.readableText
  );
  return {
    comboCount,
    imageCount,
    captchaLike: isLikelyCaptchaReadableText(readable),
  };
};

const countWeightTokens = (value) => {
  const text = asText(value);
  if (!text) return 0;
  const matches = text.match(/-?\d+(?:[.,]\d+)?\s*(?:kg|g|公斤|千克|克)/gi);
  return Array.isArray(matches) ? matches.length : 0;
};

const compactReadableText = (value, options = {}) => {
  const maxChars = Number.isFinite(Number(options.maxChars))
    ? Math.max(3_000, Math.trunc(Number(options.maxChars)))
    : 120_000;
  const maxLines = Number.isFinite(Number(options.maxLines))
    ? Math.max(150, Math.trunc(Number(options.maxLines)))
    : 8_000;
  const text = asText(value).replace(/\u00a0/g, " ");
  if (!text) return "";

  const out = [];
  const seen = new Set();
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out.join("\n").slice(0, maxChars);
};

const mergeReadableText = (primary, secondary, options = {}) => {
  const preferred = compactReadableText(primary, options);
  const fallback = compactReadableText(secondary, options);
  if (!preferred) return fallback;
  if (!fallback || fallback === preferred) return preferred;

  const primaryLines = preferred.split("\n");
  const out = [...primaryLines];
  const seen = new Set(primaryLines);
  for (const line of fallback.split("\n")) {
    const text = asText(line);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join("\n");
};

const mergeReadableTextIntoPayload = (basePayload, secondaryPayload) => {
  if (!basePayload || typeof basePayload !== "object") return basePayload;
  const baseExtracted =
    basePayload.extracted && typeof basePayload.extracted === "object"
      ? basePayload.extracted
      : null;
  if (!baseExtracted) return basePayload;

  const secondaryExtracted =
    secondaryPayload?.extracted && typeof secondaryPayload.extracted === "object"
      ? secondaryPayload.extracted
      : null;
  const baseReadable = asText(baseExtracted.readableText);
  const secondaryReadable = asText(secondaryExtracted?.readableText);
  if (!secondaryReadable) {
    return {
      ...basePayload,
      extracted: {
        ...baseExtracted,
        readableText: compactReadableText(baseReadable),
      },
    };
  }

  const baseWeightTokens = countWeightTokens(baseReadable);
  const secondaryWeightTokens = countWeightTokens(secondaryReadable);
  const preferSecondary = secondaryWeightTokens > baseWeightTokens;
  const merged = mergeReadableText(
    preferSecondary ? secondaryReadable : baseReadable,
    preferSecondary ? baseReadable : secondaryReadable
  );

  return {
    ...basePayload,
    extracted: {
      ...baseExtracted,
      readableText: merged,
    },
  };
};

const hasCjk = (value) => /[\u3400-\u9fff]/.test(String(value || ""));
const variantTranslationCache = new Map();
const normalizeVariantTextKey = (value) =>
  firstString(value)
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .toLowerCase();

const mergeVariantLabelsFromSource = (targetPayload, sourcePayload) => {
  const targetExtracted =
    targetPayload?.extracted && typeof targetPayload.extracted === "object"
      ? targetPayload.extracted
      : null;
  const sourceExtracted =
    sourcePayload?.extracted && typeof sourcePayload.extracted === "object"
      ? sourcePayload.extracted
      : null;
  const targetVariations =
    targetExtracted?.variations && typeof targetExtracted.variations === "object"
      ? targetExtracted.variations
      : null;
  const sourceVariations =
    sourceExtracted?.variations && typeof sourceExtracted.variations === "object"
      ? sourceExtracted.variations
      : null;
  const targetCombos = Array.isArray(targetVariations?.combos)
    ? targetVariations.combos
    : null;
  const sourceCombos = Array.isArray(sourceVariations?.combos)
    ? sourceVariations.combos
    : null;
  if (!targetCombos || !sourceCombos || targetCombos.length !== sourceCombos.length) {
    return targetPayload;
  }

  const fields = ["t1", "t2", "t3"];
  const mergedCombos = targetCombos.map((targetCombo, index) => {
    const sourceCombo = sourceCombos[index];
    if (
      !targetCombo ||
      typeof targetCombo !== "object" ||
      !sourceCombo ||
      typeof sourceCombo !== "object"
    ) {
      return targetCombo;
    }
    const out = { ...targetCombo };
    for (const field of fields) {
      const sourceZh = firstString(sourceCombo[`${field}_zh`], sourceCombo[field]);
      if (sourceZh && hasCjk(sourceZh) && !firstString(out[`${field}_zh`])) {
        out[`${field}_zh`] = sourceZh;
      }
      const sourceEn = firstString(sourceCombo[`${field}_en`]);
      if (sourceEn && !firstString(out[`${field}_en`])) {
        out[`${field}_en`] = sourceEn;
      }
      const raw = firstString(out[field]);
      if (!firstString(out[`${field}_en`]) && raw && !hasCjk(raw)) {
        out[`${field}_en`] = raw;
      }
    }
    return out;
  });

  return {
    ...targetPayload,
    extracted: {
      ...targetExtracted,
      variations: {
        ...targetVariations,
        combos: mergedCombos,
      },
    },
  };
};

const translateVariantCombosBestEffort = async (payload) => {
  const apiKey = firstString(process.env.OPENAI_API_KEY);
  if (!apiKey || !payload || typeof payload !== "object") return payload;

  const extracted =
    payload.extracted && typeof payload.extracted === "object"
      ? payload.extracted
      : null;
  const variations =
    extracted?.variations && typeof extracted.variations === "object"
      ? extracted.variations
      : null;
  const combos = Array.isArray(variations?.combos) ? variations.combos : null;
  if (!combos || combos.length === 0) return payload;

  const fields = ["t1", "t2", "t3"];
  const nextCombos = combos.map((combo) =>
    combo && typeof combo === "object" ? { ...combo } : combo
  );

  const sourceSet = new Set();
  const toTranslate = [];
  for (const combo of nextCombos) {
    if (!combo || typeof combo !== "object") continue;
    for (const field of fields) {
      const zh = firstString(combo[`${field}_zh`], combo[field]);
      if (!zh || !hasCjk(zh)) continue;
      if (!firstString(combo[`${field}_zh`])) combo[`${field}_zh`] = zh;

      const existingEn = firstString(combo[`${field}_en`]);
      if (existingEn) continue;

      const cached = variantTranslationCache.get(zh);
      if (cached) {
        combo[`${field}_en`] = cached;
        continue;
      }
      if (!sourceSet.has(zh)) {
        sourceSet.add(zh);
        toTranslate.push(zh);
      }
    }
  }

  const applyUpdated = () => ({
    ...payload,
    extracted: {
      ...extracted,
      variations: {
        ...variations,
        combos: nextCombos,
      },
    },
  });

  if (toTranslate.length === 0) return applyUpdated();

  const titles = toTranslate.slice(0, 50);
  const prompt = [
    "Translate this title to English, maximum 80 characters.",
    "Focus on product nouns and function; remove filler words.",
    "Return JSON only.",
    'Return format: { "items": [ { "source": "...", "english_title": "..." } ] }',
    "",
    "Titles:",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
  ].join("\n");

  const models = Array.from(
    new Set(
      [
        process.env.SUPPLIER_VARIANT_TRANSLATE_MODEL,
        "gpt-4o-mini",
        process.env.SUPPLIER_TRANSLATE_MODEL,
        process.env.OPENAI_EDIT_MODEL,
        "gpt-5-mini",
        "gpt-5-nano",
      ]
        .map((value) => asText(value))
        .filter(Boolean)
    )
  );

  let parsed = null;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
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
      const data = await response.json().catch(() => null);
      parsed = parseJsonFromText(asText(data?.choices?.[0]?.message?.content));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timer);
    }
  }

  const translatedMap = new Map();
  const rows = Array.isArray(parsed?.items) ? parsed.items : [];
  for (const row of rows) {
    const source = firstString(row?.source);
    const english = firstString(
      row?.english_title,
      row?.englishTitle,
      row?.title_en,
      row?.translation,
      row?.english
    ).slice(0, 80);
    if (!source || !english) continue;
    translatedMap.set(source, english);
    translatedMap.set(normalizeVariantTextKey(source), english);
    variantTranslationCache.set(source, english);
    variantTranslationCache.set(normalizeVariantTextKey(source), english);
  }

  if (translatedMap.size > 0) {
    for (const combo of nextCombos) {
      if (!combo || typeof combo !== "object") continue;
      for (const field of fields) {
        if (firstString(combo[`${field}_en`])) continue;
        const zh = firstString(combo[`${field}_zh`], combo[field]);
        if (!zh || !hasCjk(zh)) continue;
        const translated = firstString(
          translatedMap.get(zh),
          translatedMap.get(normalizeVariantTextKey(zh))
        );
        if (translated) combo[`${field}_en`] = translated;
      }
    }
  }

  return applyUpdated();
};

const formatTimestamp = (date) => {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const d = date || new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
};

const sanitizeReadable1688 = (value) => {
  const raw = String(value || "")
    .replace(/\r/g, "\n")
    .trim();
  if (!raw) return "";

  const cutoffPatterns = [
    /内容声明：阿里巴巴中国站/i,
    /【平台活动下价格】/i,
    /店铺推荐/,
    /相关推荐/,
    /相关产品/,
    /推荐商品/,
    /商家推荐/,
    /搭配组货/,
    /已累计采购/,
    /Code[:：]/i,
    /Click to feedback/i,
    /module\.exports/i,
    /__esModule/i,
    /webpack/i,
  ];
  let cutAt = raw.length;
  for (const pattern of cutoffPatterns) {
    const match = raw.match(pattern);
    if (!match || typeof match.index !== "number") continue;
    cutAt = Math.min(cutAt, match.index);
  }

  const cleaned = raw.slice(0, cutAt);
  const badLine = (line) =>
    /^(function\s*\(|var\s+[A-Za-z_$][\w$]*\s*=|return\s+[A-Za-z_$][\w$]*\(|\{.*\}|\[.*\])/.test(
      line
    ) ||
    /Code[:：]|Click to feedback|module\.exports|__esModule|webpack/i.test(line);

  const navigationNoise = new Set([
    "综合服务",
    "评价",
    "关注",
    "本店",
    "找货源",
    "找工厂",
    "搜索",
    "店铺推荐",
    "全部商品",
    "店铺动态",
    "加工专区",
    "工厂档案",
    "联系方式",
    "Play",
    "1688 AIBUY",
    "Fullscreen",
    "洽谈",
    "咨询",
    "询盘",
    "议价",
    "手机",
    "下单",
    "反馈",
    "意见",
    "举报",
    "批发",
    "代发",
    "加工定制",
    "查看",
    "服务",
    "物流",
    "优惠",
    "属性",
    "立即下单",
    "加采购车",
    "已选清单",
    "商品详情",
    "资质证书",
    "订购说明",
    "商品属性",
    "商品描述",
    "价格说明",
    "包装信息",
  ]);

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !badLine(line))
    .filter((line) => !navigationNoise.has(line))
    .filter((line) => !/^0:\d{2}$/.test(line))
    .filter((line) => !/^\d+(?:\.\d+)?\+$/.test(line))
    .filter((line) => !/^\|\s*\d+元$/.test(line))
    .filter((line) => !/^收藏\(\d+\)$/.test(line));

  const deduped = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }

  return deduped.join("\n").slice(0, 16_000);
};

const parseMetaTag = (html, key, attr = "property") => {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
    "i"
  );
  const match = html.match(re);
  return match?.[1] ? decodeEntities(match[1]).trim() : "";
};

const parseTitleTag = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
};

const collectJsonLdBlocks = (html) => {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const text = String(match[1] || "").trim();
    if (!text) continue;
    const parsed = parseJsonFromText(text);
    if (parsed !== null) blocks.push(parsed);
  }
  return blocks;
};

const findProductNode = (node) => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const rec = node;
  const typeRaw = rec["@type"];
  const typeList = Array.isArray(typeRaw) ? typeRaw : [typeRaw];
  if (
    typeList.some((type) => String(type || "").toLowerCase() === "product")
  ) {
    return rec;
  }
  for (const value of Object.values(rec)) {
    const found = findProductNode(value);
    if (found) return found;
  }
  return null;
};

const extractImgUrlsFromHtml = (html, baseUrl) => {
  const urls = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const absolute = toAbsoluteUrl(baseUrl, match[1]);
    if (absolute) urls.push(absolute);
    if (urls.length >= 120) break;
  }
  return uniqueUrls(urls);
};

const parseCsvList = (value) =>
  asText(value)
    .split(",")
    .map((entry) => asText(entry))
    .filter(Boolean);

const fetchHtml = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const finalUrl = response.url || url;
    return { html, finalUrl };
  } finally {
    clearTimeout(timeout);
  }
};

const scrapeCompetitorPage = async (url) => {
  if (!isHttpUrl(url)) {
    return { ok: false, error: "Missing competitor URL." };
  }
  try {
    const { html, finalUrl } = await fetchHtml(url);

    const jsonLdBlocks = collectJsonLdBlocks(html);
    let productNode = null;
    for (const block of jsonLdBlocks) {
      const found = findProductNode(block);
      if (found) {
        productNode = found;
        break;
      }
    }

    const title = firstString(
      productNode?.name,
      parseMetaTag(html, "og:title", "property"),
      parseTitleTag(html)
    );
    const description = stripHtml(
      firstString(
        productNode?.description,
        parseMetaTag(html, "og:description", "property"),
        parseMetaTag(html, "description", "name")
      )
    );

    const jsonLdImagesRaw = productNode?.image;
    const jsonLdImages = Array.isArray(jsonLdImagesRaw)
      ? jsonLdImagesRaw
      : jsonLdImagesRaw
        ? [jsonLdImagesRaw]
        : [];
    const ogImage = parseMetaTag(html, "og:image", "property");
    const htmlImages = extractImgUrlsFromHtml(html, finalUrl).slice(0, 80);

    const imageUrls = uniqueUrls([
      ...jsonLdImages.map((entry) => toAbsoluteUrl(finalUrl, entry)),
      toAbsoluteUrl(finalUrl, ogImage),
      ...htmlImages,
    ]).slice(0, 80);

    return {
      ok: true,
      finalUrl,
      title,
      description,
      imageUrls,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const scrapeCompetitorPageByProvider = async (provider, url) => {
  const source = asText(provider).toLowerCase();
  const target = asText(url);
  if (!isHttpUrl(target)) {
    return { ok: false, error: "Missing competitor URL." };
  }

  if (source !== "cdon" && source !== "fyndiq") {
    return scrapeCompetitorPage(target);
  }

  try {
    const { html, finalUrl } = await fetchHtml(target);
    const normalizedFinal = asText(finalUrl).toLowerCase();
    if (
      (source === "fyndiq" || source === "cdon") &&
      !normalizedFinal.includes("/produkt/")
    ) {
      return {
        ok: false,
        error: `redirected_to_non_product:${finalUrl}`,
      };
    }
    const parsed =
      source === "cdon"
        ? scrapeCdonFromHtml({ html, url: finalUrl })
        : scrapeFyndiqFromHtml({ html, url: finalUrl });
    const hasUseful =
      asText(parsed?.title) ||
      asText(parsed?.description) ||
      (Array.isArray(parsed?.imageUrls) && parsed.imageUrls.length > 0);
    if (hasUseful) {
      return {
        ok: true,
        finalUrl,
        title: asText(parsed?.title),
        description: asText(parsed?.description),
        imageUrls: uniqueUrls(parsed?.imageUrls || []).slice(0, 40),
      };
    }
  } catch {
    // fallback below
  }

  return scrapeCompetitorPage(target);
};

const run1688OfferDetail = async (detailUrl, offerId) => {
  const runAttempt = async (mode) => {
  const tmpOut = path.join(
    "/tmp",
    `supplier-fetch-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  const args = [
    "--pretty",
    "false",
    "--includeText",
    "true",
    "--includeVariations",
    "true",
    "--downloadImages",
    "false",
    "--maxTextChars",
    "250000",
    "--output",
    tmpOut,
  ];

  const id = asText(offerId);
  if (id) args.push("--offer-id", id);
  else args.push("--url", detailUrl);

  try {
    const result = await new Promise((resolve, reject) => {
      const envForMode =
        mode === "cn"
          ? {
              ...process.env,
              HEADLESS: "1",
              FORCE_1688_CHINESE_UI:
                process.env.FORCE_1688_CHINESE_UI || "1",
              LOCALE: process.env.LOCALE || "zh-CN",
              ACCEPT_LANGUAGE:
                process.env.ACCEPT_LANGUAGE || "zh-CN,zh;q=0.9,en;q=0.6",
              TIMEZONE: process.env.TIMEZONE || "Asia/Shanghai",
            }
          : {
              ...process.env,
              HEADLESS: "1",
              FORCE_1688_CHINESE_UI: "0",
              LOCALE: "en-US",
              ACCEPT_LANGUAGE: "en-US,en;q=0.9,zh-CN;q=0.5",
              TIMEZONE: process.env.TIMEZONE || "UTC",
            };

      const child = spawn(process.execPath, [EXTRACTOR_CLI_PATH, ...args], {
        env: envForMode,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const maxBuffer = 12 * 1024 * 1024;
      const timeoutMs = 240_000;
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        reject(new Error("1688 extractor timed out."));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        if (stdout.length < maxBuffer) {
          stdout += chunk.toString();
        }
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < maxBuffer) {
          stderr += chunk.toString();
        }
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });

    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();

    let parsed = null;
    if (fs.existsSync(tmpOut)) {
      try {
        parsed = JSON.parse(fs.readFileSync(tmpOut, "utf8"));
      } catch {}
    }
    if (!parsed) parsed = parseJsonFromText(stdout);

    if (!parsed) {
      return {
        ok: false,
        error: stderr || "Extractor returned no JSON payload.",
        mode,
      };
    }

    if (parsed && typeof parsed === "object" && parsed.ok === false) {
      const message =
        typeof parsed?.error?.message === "string"
          ? parsed.error.message
          : typeof parsed?.error === "string"
            ? parsed.error
            : "1688 extractor failed.";
      return { ok: false, error: message };
    }

    const summary = summarizeExtractorPayload(parsed);
    if (summary.captchaLike && summary.comboCount === 0 && summary.imageCount <= 1) {
      return {
        ok: false,
        error:
          "1688 returned a verification page instead of supplier data. Please retry.",
        mode,
      };
    }

    if (result.code !== 0 && !parsed) {
      return {
        ok: false,
        error: stderr || `1688 extractor exited with code ${result.code}.`,
        mode,
      };
    }

    return { ok: true, payload: enrichVariantWeightsFromReadableText(parsed), mode };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      mode,
    };
  } finally {
    try {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {}
  }
  };

  const primary = await runAttempt("cn");
  if (!primary.ok) {
    const fallback = await runAttempt("default");
    if (!fallback.ok) return primary;
    return {
      ...fallback,
      payload: enrichVariantWeightsFromReadableText(
        mergeReadableTextIntoPayload(fallback.payload, primary?.payload)
      ),
    };
  }

  const primaryQuality = getVariationQuality(primary.payload);
  const primaryReadable = asText(primary?.payload?.extracted?.readableText);
  const shouldTryReadableFallback =
    primaryReadable.length < 1_800 || countWeightTokens(primaryReadable) <= 1;
  if (!isLikelyFlatPriceExtraction(primaryQuality) && !shouldTryReadableFallback) {
    return primary;
  }

  const fallback = await runAttempt("default");
  if (!fallback.ok) {
    return primary;
  }

  const fallbackQuality = getVariationQuality(fallback.payload);
  if (isBetterVariationQuality(fallbackQuality, primaryQuality)) {
    const merged = mergeVariantLabelsFromSource(fallback.payload, primary.payload);
    return {
      ...fallback,
      payload: enrichVariantWeightsFromReadableText(
        mergeReadableTextIntoPayload(merged, primary.payload)
      ),
    };
  }
  const merged = mergeVariantLabelsFromSource(primary.payload, fallback.payload);
  return {
    ...primary,
    payload: enrichVariantWeightsFromReadableText(
      mergeReadableTextIntoPayload(merged, fallback.payload)
    ),
  };
};

const getSupabaseAdmin = () => {
  const url = firstString(
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const key = firstString(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY
  );
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const selectionMatches = (current, snapshot) => {
  const currentId = asText(current?.selected_offer_id);
  const snapshotId = asText(snapshot?.selected_offer_id);
  if (snapshotId && currentId && snapshotId !== currentId) return false;

  const currentUrl = canonical1688Url(current?.selected_detail_url, currentId);
  const snapshotUrl = canonical1688Url(
    snapshot?.selected_detail_url,
    snapshotId
  );
  if (snapshotUrl && currentUrl && snapshotUrl !== currentUrl) return false;
  return true;
};

const withPayloadMeta = (offer, patch) => {
  const now = patch.updatedAt || new Date().toISOString();
  const base = offer && typeof offer === "object" ? offer : {};
  const hasWeightReview =
    patch.weightReview && typeof patch.weightReview === "object";
  return {
    ...base,
    _production_payload_status: firstString(patch.status) || null,
    _production_payload_source: firstString(patch.source) || null,
    _production_payload_error: firstString(patch.error) || null,
    _production_payload_file_name: firstString(patch.fileName) || null,
    _production_payload_file_path: firstString(patch.filePath) || null,
    _production_payload_updated_at: now,
    _production_payload_saved_at: patch.savedAt ?? null,
    _production_payload_competitor_url: firstString(patch.competitorUrl) || null,
    _production_payload_competitor_title:
      firstString(patch.competitorTitle) || null,
    _production_payload_competitor_images:
      Number.isFinite(Number(patch.competitorImages)) && Number(patch.competitorImages) >= 0
        ? Number(patch.competitorImages)
        : null,
    _production_payload_competitor_error:
      firstString(patch.competitorError) || null,
    _production_weight_review_status: hasWeightReview
      ? patch.weightReview.needs_review
        ? "warning"
        : "ok"
      : firstString(base._production_weight_review_status) || null,
    _production_weight_review_summary:
      hasWeightReview
        ? firstString(patch.weightReview?.summary) || null
        : firstString(base._production_weight_review_summary) || null,
    _production_weight_review_reason_codes: hasWeightReview
      ? Array.isArray(patch.weightReview?.reason_codes)
        ? patch.weightReview.reason_codes.filter((entry) => asText(entry))
        : []
      : Array.isArray(base._production_weight_review_reason_codes)
        ? base._production_weight_review_reason_codes
        : [],
    _production_weight_review_confidence:
      hasWeightReview && Number.isFinite(Number(patch.weightReview?.confidence))
        ? Number(patch.weightReview.confidence)
        : Number.isFinite(Number(base._production_weight_review_confidence))
          ? Number(base._production_weight_review_confidence)
          : null,
    _production_weight_review_trigger_next_supplier: hasWeightReview
      ? Boolean(patch.weightReview?.trigger_next_supplier)
      : Boolean(base._production_weight_review_trigger_next_supplier),
    _production_weight_review_updated_at: hasWeightReview
      ? now
      : firstString(base._production_weight_review_updated_at) || null,
  };
};

const loadSelection = async (admin, provider, productId) => {
  const { data, error } = await admin
    .from("discovery_production_supplier_selection")
    .select(
      "provider, product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, selected_by, updated_at"
    )
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
};

const updateSelectionOffer = async (admin, provider, productId, offer) => {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("discovery_production_supplier_selection")
    .update({
      selected_offer: offer,
      updated_at: now,
    })
    .eq("provider", provider)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
};

const isSafeSuggestionId = (value) =>
  /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(asText(value));

const loadPartnerSuggestionSeed = async (productId) => {
  const safeId = asText(productId);
  if (!isSafeSuggestionId(safeId)) {
    return { title: "", description: "", url: "", imageUrls: [] };
  }

  const filePath = path.join(PARTNER_SUGGESTION_DIR, `${safeId}.json`);
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const external =
      parsed?.externalData && typeof parsed.externalData === "object"
        ? parsed.externalData
        : null;

    const title = firstString(
      external?.title,
      parsed?.title,
      external?.rawTitle
    );
    const description = firstString(
      external?.description,
      parsed?.description,
      external?.rawDescription
    );
    const url = firstString(
      external?.finalUrl,
      external?.inputUrl,
      parsed?.crawlFinalUrl,
      parsed?.sourceUrl
    );
    const imageUrls = uniqueUrls([
      ...(Array.isArray(external?.galleryImageUrls) ? external.galleryImageUrls : []),
      ...(Array.isArray(external?.rawGalleryImageUrls) ? external.rawGalleryImageUrls : []),
      external?.mainImageUrl,
      external?.rawMainImageUrl,
      ...(Array.isArray(parsed?.galleryImageUrls) ? parsed.galleryImageUrls : []),
      parsed?.mainImageUrl,
    ]);

    return { title, description, url, imageUrls };
  } catch {
    return { title: "", description: "", url: "", imageUrls: [] };
  }
};

const loadCompetitorSeed = async (admin, provider, productId) => {
  if (provider === "digideal") {
    const { data, error } = await admin
      .from("digideal_products_search")
      .select("listing_title, title_h1, product_url, source_url, primary_image_url, image_urls")
      .eq("product_id", productId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const imageList = Array.isArray(data?.image_urls) ? data.image_urls : [];
    return {
      title: firstString(data?.listing_title, data?.title_h1),
      description: "",
      url: firstString(data?.product_url, data?.source_url),
      imageUrls: uniqueUrls([data?.primary_image_url, ...imageList]),
    };
  }

  if (provider === "partner_suggestions") {
    const seeded = await loadPartnerSuggestionSeed(productId);
    if (
      asText(seeded?.title) ||
      asText(seeded?.description) ||
      asText(seeded?.url) ||
      (Array.isArray(seeded?.imageUrls) && seeded.imageUrls.length > 0)
    ) {
      return seeded;
    }
  }

  const { data, error } = await admin
    .from("discovery_products")
    .select("title, source_url, product_url, image_url, image_local_url")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    title: firstString(data?.title),
    description: "",
    url: firstString(data?.product_url, data?.source_url),
    imageUrls: uniqueUrls([data?.image_url, data?.image_local_url]),
  };
};

const buildExtractorItem = ({
  provider,
  productId,
  detailUrl,
  offerId,
  extractedPayload,
  competitor,
  weightReview,
}) => {
  const extracted = extractedPayload?.extracted ?? {};
  const extractedErrors = Array.isArray(extractedPayload?.errors)
    ? extractedPayload.errors.map((entry) => asText(entry)).filter(Boolean)
    : [];

  const readable1688Full = compactReadableText(asText(extracted?.readableText), {
    maxChars: 140_000,
    maxLines: 10_000,
  });
  const readable1688 = sanitizeReadable1688(readable1688Full);

  // Keep 1688 source images separate from marketplace competitor images.
  const imageUrls1688 = uniqueUrls(
    Array.isArray(extracted?.imageUrls) ? extracted.imageUrls : []
  ).slice(0, 80);
  const competitorImageUrls = uniqueUrls(
    Array.isArray(competitor.imageUrls) ? competitor.imageUrls : []
  ).slice(0, 40);

  const variantImages = Array.isArray(extracted?.variantImages)
    ? extracted.variantImages
    : [];
  const variations1688 =
    extracted?.variations_enriched_1688 && typeof extracted.variations_enriched_1688 === "object"
      ? extracted.variations_enriched_1688
      : extracted?.variations ?? null;

  const variantImageUrls = uniqueUrls(
    variantImages.map((entry) => firstString(entry?.url_full, entry?.url))
  );

  const notes = [];
  if (competitor.url) notes.push(`competitor_url:${competitor.url}`);
  if (competitor.title) notes.push(`competitor_title:${competitor.title}`);
  if (competitor.error) notes.push(`competitor_fetch_error:${competitor.error}`);
  if (weightReview?.needs_review) {
    notes.push(
      `weight_review_warning:${Array.isArray(weightReview?.reason_codes) ? weightReview.reason_codes.join(",") : "possible_weight_issue"}`
    );
  }

  const extractedSchemaVersionRaw = Number(extracted?.schema_version);
  const schemaVersion =
    Number.isInteger(extractedSchemaVersionRaw) && extractedSchemaVersionRaw >= 1
      ? extractedSchemaVersionRaw
      : 2;
  const extractionMeta1688 =
    extracted?.extraction_meta_1688 && typeof extracted.extraction_meta_1688 === "object"
      ? extracted.extraction_meta_1688
      : {
          generated_at: new Date().toISOString(),
          source: "production_supplier_fetch_worker",
          parser_version: "legacy_passthrough",
          readable_text_chars: readable1688Full.length,
          variant_combo_count: Array.isArray(extracted?.variations?.combos)
            ? extracted.variations.combos.length
            : 0,
        };
  const text1688 =
    extracted?.text_1688 && typeof extracted.text_1688 === "object"
      ? {
          ...extracted.text_1688,
          readable_full: asText(extracted?.text_1688?.readable_full) || readable1688Full || readable1688,
          readable_compact:
            asText(extracted?.text_1688?.readable_compact) ||
            sanitizeReadable1688(readable1688Full || readable1688),
        }
      : {
          readable_full: readable1688Full || readable1688,
          readable_compact: sanitizeReadable1688(readable1688Full || readable1688),
          weight_focused_excerpt: "",
          stats: {
            line_count: readable1688Full ? readable1688Full.split(/\n+/).filter(Boolean).length : 0,
            char_count: readable1688Full.length,
            weight_keyword_lines: 0,
          },
        };

  return {
    schema_version: schemaVersion,
    extraction_meta_1688: extractionMeta1688,
    text_1688: text1688,
    weights_1688:
      extracted?.weights_1688 && typeof extracted.weights_1688 === "object"
        ? extracted.weights_1688
        : null,
    variations_enriched_1688:
      extracted?.variations_enriched_1688 &&
      typeof extracted.variations_enriched_1688 === "object"
        ? extracted.variations_enriched_1688
        : null,
    variant_table_1688:
      extracted?.variant_table_1688 && typeof extracted.variant_table_1688 === "object"
        ? extracted.variant_table_1688
        : null,
    quality_1688:
      extracted?.quality_1688 && typeof extracted.quality_1688 === "object"
        ? extracted.quality_1688
        : null,
    sku: "",
    url_1688: detailUrl,
    url_1688_list: detailUrl ? [detailUrl] : [],
    url_amz: "",
    variants_1688: "",
    readable_1688: readable1688,
    readable_1688_full: readable1688Full || readable1688,
    main_image_1688: firstString(
      extracted?.mainImageUrl,
      imageUrls1688[0],
      competitorImageUrls[0]
    ),
    image_urls_1688: imageUrls1688,
    supplementary_image_urls: competitorImageUrls,
    variant_images_1688: variantImages,
    variant_image_urls: variantImageUrls,
    downloaded_images: Array.isArray(extracted?.downloadedImages)
      ? extracted.downloadedImages
      : [],
    product_weights_1688: Array.isArray(extracted?.weights) ? extracted.weights : [],
    variations: variations1688,
    weight_review_1688:
      weightReview && typeof weightReview === "object" ? weightReview : null,
    variation_filter_tokens: [],
    notes,
    errors: extractedErrors,
    production_provider: provider,
    production_product_id: productId,
    selected_supplier_offer_id: firstString(offerId) || null,
    competitor_data: {
      provider,
      source_url: firstString(competitor.url) || null,
      title: firstString(competitor.title) || null,
      description: firstString(competitor.description) || null,
      image_urls: competitorImageUrls,
      fetched_at: new Date().toISOString(),
      error: firstString(competitor.error) || null,
    },
  };
};

const saveExtractorItems = async (items, provider, productId) => {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const base = `production_supplier_${sanitizeFilePart(provider)}_${sanitizeFilePart(
    productId
  )}`;
  const stamp = formatTimestamp(new Date());
  let fileName = `${base}_${stamp}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(OUTPUT_DIR, fileName))) {
    fileName = `${base}_${stamp}_${counter}.json`;
    counter += 1;
  }
  const filePath = path.join(OUTPUT_DIR, fileName);
  await fsp.writeFile(filePath, JSON.stringify(items, null, 2), "utf8");
  return { fileName, filePath };
};

const failSelection = async (admin, selection, message) => {
  const now = new Date().toISOString();
  const failedOffer = withPayloadMeta(selection?.selected_offer, {
    status: "failed",
    source: "auto",
    error: message,
    updatedAt: now,
    savedAt: null,
  });
  await updateSelectionOffer(
    admin,
    selection.provider,
    selection.product_id,
    failedOffer
  );
};

const fetchCompetitorData = async (admin, provider, productId, overrideUrl = "") => {
  let competitorSeed = {
    title: "",
    description: "",
    url: "",
    imageUrls: [],
  };
  let competitor = {
    title: "",
    description: "",
    url: "",
    imageUrls: [],
    error: "",
  };

  if (provider === "digideal") {
    try {
      competitor = await loadDigidealFromSupabase(admin, productId);
    } catch (error) {
      competitor = {
        ...competitor,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return competitor;
  }

  try {
    competitorSeed = await loadCompetitorSeed(admin, provider, productId);
    if (asText(overrideUrl)) {
      competitorSeed.url = asText(overrideUrl);
    }
    competitor = {
      title: competitorSeed.title,
      description: competitorSeed.description,
      url: competitorSeed.url,
      imageUrls: competitorSeed.imageUrls,
      error: "",
    };
  } catch {
    return competitor;
  }

  if (!competitorSeed.url) return competitor;

  const scraped = await scrapeCompetitorPageByProvider(provider, competitorSeed.url);
  if (scraped.ok) {
    return {
      title: firstString(scraped.title, competitorSeed.title),
      description: firstString(scraped.description, competitorSeed.description),
      url: firstString(scraped.finalUrl, competitorSeed.url),
      imageUrls: uniqueUrls([
        ...(Array.isArray(scraped.imageUrls) ? scraped.imageUrls : []),
        ...(Array.isArray(competitorSeed.imageUrls) ? competitorSeed.imageUrls : []),
      ]),
      error: "",
    };
  }

  return {
    ...competitor,
    error: firstString(scraped.error),
  };
};

const main = async () => {
  const { provider, productId } = parseArgs(process.argv);
  if (!provider || !productId) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  const selection = await loadSelection(admin, provider, productId);
  if (!selection) return;

  const selectedOfferId = firstString(selection?.selected_offer_id);
  const selectedDetailUrl = canonical1688Url(
    firstString(
      selection?.selected_detail_url,
      selection?.selected_offer?.detailUrl,
      selection?.selected_offer?.detail_url
    ),
    selectedOfferId
  );

  if (!selectedDetailUrl) {
    await failSelection(admin, selection, "Selected supplier has no 1688 URL.");
    return;
  }

  const fetchingOffer = withPayloadMeta(selection?.selected_offer, {
    status: "fetching",
    source: "auto",
    error: null,
    updatedAt: new Date().toISOString(),
    savedAt: null,
  });
  await updateSelectionOffer(admin, provider, productId, fetchingOffer);

  const detailPromise = run1688OfferDetail(selectedDetailUrl, selectedOfferId);
  const competitorOverrideUrl = firstString(
    selection?.selected_offer?._production_payload_competitor_override_url
  );
  const competitorPromise = fetchCompetitorData(
    admin,
    provider,
    productId,
    competitorOverrideUrl
  );
  const [detailResult, competitor] = await Promise.all([detailPromise, competitorPromise]);

  if (!detailResult.ok) {
    await failSelection(admin, selection, detailResult.error || "1688 extraction failed.");
    return;
  }

  const translatedDetailPayload = await translateVariantCombosBestEffort(
    detailResult.payload
  );
  let weightReview = null;
  try {
    weightReview = await reviewSupplierWeightBestEffort({
      extractedPayload: translatedDetailPayload,
      competitor,
      detailUrl: selectedDetailUrl,
    });
  } catch {
    weightReview = null;
  }

  let item = buildExtractorItem({
    provider,
    productId,
    detailUrl: selectedDetailUrl,
    offerId: selectedOfferId,
    extractedPayload: translatedDetailPayload,
    competitor,
    weightReview,
  });
  try {
    item = await enhance1688ItemWithAi(item, {
      source: "production_supplier_fetch_worker",
      mode: firstString(
        process.env.NODEXO_1688_PRODUCTION_AI_MODE,
        process.env.NODEXO_1688_AI_MODE,
        "full"
      ),
      enableWeightReview: firstString(
        process.env.NODEXO_1688_PRODUCTION_AI_WEIGHT_REVIEW,
        process.env.NODEXO_1688_AI_WEIGHT_REVIEW,
        "1"
      ),
      enableAttributeExtract: firstString(
        process.env.NODEXO_1688_PRODUCTION_AI_ATTRIBUTE_EXTRACT,
        process.env.NODEXO_1688_AI_ATTRIBUTE_EXTRACT,
        "1"
      ),
      modelCandidates: parseCsvList(
        firstString(
          process.env.NODEXO_1688_PRODUCTION_AI_MODELS,
          process.env.NODEXO_1688_AI_MODELS
        )
      ),
    });
  } catch {
    // Keep original extractor item when AI enhancement fails.
  }

  const finalWeightReview =
    item?.weight_review_1688 && typeof item.weight_review_1688 === "object"
      ? item.weight_review_1688
      : weightReview;

  const itemSummary = {
    comboCount: Array.isArray(item?.variations?.combos) ? item.variations.combos.length : 0,
    imageCount: uniqueUrls([
      item?.main_image_1688,
      ...(Array.isArray(item?.image_urls_1688) ? item.image_urls_1688 : []),
      ...(Array.isArray(item?.variant_image_urls) ? item.variant_image_urls : []),
    ]).length,
    captchaLike: isLikelyCaptchaReadableText(
      firstString(item?.readable_1688_full, item?.readable_1688, item?.text_1688?.readable_full)
    ),
  };
  if (itemSummary.comboCount === 0 && itemSummary.imageCount === 0) {
    await failSelection(
      admin,
      selection,
      "1688 payload was empty (no variants/images). Please retry this supplier."
    );
    return;
  }
  if (itemSummary.captchaLike && itemSummary.comboCount === 0 && itemSummary.imageCount <= 1) {
    await failSelection(
      admin,
      selection,
      "1688 verification blocked this supplier page. Retry later or select another supplier."
    );
    return;
  }

  let saved;
  try {
    saved = await saveExtractorItems([item], provider, productId);
  } catch (error) {
    await failSelection(
      admin,
      selection,
      error instanceof Error ? error.message : "Unable to save extractor JSON."
    );
    return;
  }

  const latestSelection = await loadSelection(admin, provider, productId);
  if (!latestSelection) return;
  if (!selectionMatches(latestSelection, selection)) return;

  const readyAt = new Date().toISOString();
  const readyOffer = withPayloadMeta(latestSelection?.selected_offer, {
    status: "ready",
    source: "auto",
    error: null,
    fileName: saved.fileName,
    filePath: saved.filePath,
    updatedAt: readyAt,
    savedAt: readyAt,
    competitorUrl: competitor.url,
    competitorTitle: competitor.title,
    competitorImages: Array.isArray(competitor.imageUrls)
      ? competitor.imageUrls.length
      : 0,
    competitorError: competitor.error,
    weightReview: finalWeightReview,
  });
  await updateSelectionOffer(admin, provider, productId, readyOffer);
};

main().catch(async (error) => {
  try {
    const { provider, productId } = parseArgs(process.argv);
    if (!provider || !productId) return;
    const admin = getSupabaseAdmin();
    if (!admin) return;

    const selection = await loadSelection(admin, provider, productId);
    if (!selection) return;
    const payloadStatus = firstString(
      selection?.selected_offer?._production_payload_status
    ).toLowerCase();
    if (payloadStatus !== "fetching") return;

    await failSelection(
      admin,
      selection,
      error instanceof Error && asText(error.message)
        ? error.message
        : "Supplier payload worker failed unexpectedly."
    );
  } catch {
    // Detached worker: intentionally silent.
  }
});
