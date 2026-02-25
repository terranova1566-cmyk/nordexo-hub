import { asText, extractJsonFromText } from "./core.mjs";
import { reviewSupplierWeightBestEffort } from "./weight-review.mjs";

const DEFAULT_MODELS = [
  process.env.NODEXO_1688_AI_MODEL,
  process.env.SUPPLIER_WEIGHT_REVIEW_MODEL,
  "gpt-5.2",
  "gpt-5",
  "gpt-5-mini",
  "gpt-4o-mini",
].filter(Boolean);

const toBool = (value, fallback = false) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const uniq = (values, max = 200) => {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = asText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
};

const toModels = (provided) => {
  const sources = [
    ...(Array.isArray(provided) ? provided : []),
    ...DEFAULT_MODELS,
  ];
  const out = [];
  const seen = new Set();
  for (const raw of sources) {
    const model = asText(raw);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
};

const normalizeWeightList = (value) => {
  if (!Array.isArray(value)) return [];
  return uniq(value.map((entry) => asText(entry)).filter(Boolean), 120);
};

const normalizeVariations = (value) => {
  if (!value || typeof value !== "object") return null;
  const rec = value;
  const combos = Array.isArray(rec.combos)
    ? rec.combos
        .map((entry) => (entry && typeof entry === "object" ? { ...entry } : null))
        .filter(Boolean)
    : [];
  return {
    ...rec,
    combos,
  };
};

const toReadableText = (item) =>
  asText(
    item?.text_1688?.readable_full ||
      item?.readable_1688_full ||
      item?.readable_1688 ||
      item?.readable1688 ||
      ""
  );

const toDetailUrl = (item) =>
  asText(item?.url_1688 || item?.detail_url || item?.detailUrl || "");

const toTitleHints = (item) => ({
  title_zh: asText(item?.title_zh || item?.title_cn || item?.title_1688 || ""),
  title_en: asText(item?.title_en || item?.subject_en || ""),
});

const toExtractedPayload = (item) => {
  const readableText = toReadableText(item);
  const variations = normalizeVariations(
    item?.variations_enriched_1688 && typeof item.variations_enriched_1688 === "object"
      ? item.variations_enriched_1688
      : item?.variations
  );
  const weights = normalizeWeightList(item?.product_weights_1688 || item?.weights || []);
  return {
    extracted: {
      readableText,
      variations,
      weights,
      mainImageUrl: asText(item?.main_image_1688 || item?.mainImageUrl || ""),
    },
  };
};

const toCompetitorHint = (item) => {
  const competitor = item?.competitor_data;
  if (!competitor || typeof competitor !== "object") return null;
  return {
    title: asText(competitor.title),
    description: asText(competitor.description),
  };
};

const compactReadableText = (value, options = {}) => {
  const maxChars = Number.isFinite(Number(options.maxChars))
    ? Math.max(2_000, Math.trunc(Number(options.maxChars)))
    : 30_000;
  const maxLines = Number.isFinite(Number(options.maxLines))
    ? Math.max(120, Math.trunc(Number(options.maxLines)))
    : 900;
  const lines = String(value || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out.join("\n").slice(0, maxChars);
};

const summarizeVariantRows = (variations) => {
  const combos = Array.isArray(variations?.combos) ? variations.combos : [];
  return combos.slice(0, 35).map((combo, index) => ({
    index,
    t1: asText(combo?.t1_zh || combo?.t1),
    t2: asText(combo?.t2_zh || combo?.t2),
    t3: asText(combo?.t3_zh || combo?.t3),
    t1_en: asText(combo?.t1_en),
    t2_en: asText(combo?.t2_en),
    t3_en: asText(combo?.t3_en),
    weight_raw: asText(combo?.weight_raw || combo?.weightRaw || combo?.weight),
    weight_grams:
      Number.isFinite(Number(combo?.weight_grams)) && Number(combo.weight_grams) > 0
        ? Math.round(Number(combo.weight_grams))
        : null,
    price_raw: asText(combo?.price_raw || combo?.priceRaw),
    price:
      Number.isFinite(Number(combo?.price)) && Number(combo.price) >= 0
        ? Number(combo.price)
        : null,
  }));
};

const parseNumberArray = (value, options = {}) => {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : Number.MAX_SAFE_INTEGER;
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const n = Number(entry);
    if (!Number.isFinite(n)) continue;
    const rounded = Math.round(n);
    if (rounded < min || rounded > max) continue;
    const key = String(rounded);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rounded);
  }
  return out.sort((a, b) => a - b);
};

const normalizeAttributeResult = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed;
  const summary = asText(rec.summary || rec.analysis || rec.note).slice(0, 500);
  const confidenceRaw = Number(rec.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;
  return {
    summary,
    confidence,
    unit_weight_candidates_grams: parseNumberArray(
      rec.unit_weight_candidates_grams || rec.unit_weights_grams || [],
      { min: 1, max: 500_000 }
    ),
    packaging_weight_candidates_grams: parseNumberArray(
      rec.packaging_weight_candidates_grams || rec.packaging_weights_grams || [],
      { min: 1, max: 5_000_000 }
    ),
    dimensions_cm_candidates: uniq(rec.dimensions_cm_candidates || rec.dimensions || [], 20),
    materials: uniq(rec.materials || rec.material || [], 20),
    product_name_cn: asText(rec.product_name_cn || rec.title_cn || "").slice(0, 180),
    product_name_en: asText(rec.product_name_en || rec.title_en || "").slice(0, 180),
    evidence_lines: uniq(rec.evidence_lines || rec.evidence || [], 25),
    warnings: uniq(rec.warnings || rec.reason_codes || [], 25),
  };
};

const runAttributeExtractionAi = async ({
  apiKey,
  modelCandidates,
  item,
  extractedPayload,
  timeoutMs = 12_000,
}) => {
  const models = toModels(modelCandidates);
  if (!apiKey || !models.length) {
    return { used: false, error: !apiKey ? "missing_api_key" : "missing_model" };
  }

  const extracted = extractedPayload?.extracted || {};
  const readableText = compactReadableText(extracted.readableText, {
    maxChars: 26_000,
    maxLines: 700,
  });
  const variantRows = summarizeVariantRows(extracted.variations);
  const productWeights = normalizeWeightList(extracted.weights);
  const titleHints = toTitleHints(item);

  if (!readableText && variantRows.length === 0 && productWeights.length === 0) {
    return { used: false, error: "no_input" };
  }

  const prompt = [
    "You are a strict JSON extractor for 1688 product sourcing data.",
    "Do not invent values. Use only supplied text/data.",
    "Ignore advertisement/navigation/store policy lines.",
    "Differentiate per-unit weight vs packaging/carton weight.",
    "Return JSON only.",
    "Output schema:",
    "{",
    '  "summary": "...",',
    '  "confidence": 0..1,',
    '  "unit_weight_candidates_grams": [number],',
    '  "packaging_weight_candidates_grams": [number],',
    '  "dimensions_cm_candidates": ["..."],',
    '  "materials": ["..."],',
    '  "product_name_cn": "...",',
    '  "product_name_en": "...",',
    '  "evidence_lines": ["..."],',
    '  "warnings": ["..."]',
    "}",
    "",
    "Input:",
    JSON.stringify(
      {
        detail_url: toDetailUrl(item),
        title_hints: titleHints,
        product_weights_1688: productWeights,
        variant_rows: variantRows,
        readable_text: readableText,
      },
      null,
      2
    ),
  ].join("\n");

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      const normalized = normalizeAttributeResult(parsed);
      if (!normalized) continue;
      return {
        used: true,
        model,
        ...normalized,
      };
    } catch {
      // try next model
    } finally {
      clearTimeout(timer);
    }
  }

  return { used: false, error: "model_failed" };
};

const appendUniqueNote = (item, note) => {
  const text = asText(note);
  if (!text) return item;
  const prev = Array.isArray(item?.notes) ? item.notes : [];
  const seen = new Set(prev.map((entry) => asText(entry)));
  if (seen.has(text)) return item;
  return { ...item, notes: [...prev, text] };
};

export const enhance1688ItemWithAi = async (item, options = {}) => {
  const base = item && typeof item === "object" ? { ...item } : null;
  if (!base) return item;

  const mode = asText(options.mode || process.env.NODEXO_1688_AI_MODE || "full").toLowerCase();
  const source = asText(options.source || "server_ai_pipeline") || "server_ai_pipeline";
  const enableWeightReview = toBool(
    options.enableWeightReview ?? process.env.NODEXO_1688_AI_WEIGHT_REVIEW ?? "1",
    true
  );
  const enableAttributeExtract = toBool(
    options.enableAttributeExtract ??
      (mode === "fast" ? "0" : process.env.NODEXO_1688_AI_ATTRIBUTE_EXTRACT ?? "1"),
    mode !== "fast"
  );
  const apiKey = asText(options.apiKey || process.env.OPENAI_API_KEY || "");
  const modelCandidates = toModels(options.modelCandidates || []);

  const extractedPayload = toExtractedPayload(base);
  const detailUrl = toDetailUrl(base);
  const competitor = toCompetitorHint(base);
  const existingWeightReview =
    base.weight_review_1688 && typeof base.weight_review_1688 === "object"
      ? base.weight_review_1688
      : null;

  let weightReview = existingWeightReview;
  if (!weightReview && enableWeightReview) {
    try {
      weightReview = await reviewSupplierWeightBestEffort({
        extractedPayload,
        competitor,
        detailUrl,
        apiKey,
      });
    } catch {
      weightReview = null;
    }
  }

  let attributeExtract = {
    used: false,
    error: "disabled",
  };
  if (enableAttributeExtract) {
    attributeExtract = await runAttributeExtractionAi({
      apiKey,
      modelCandidates,
      item: base,
      extractedPayload,
      timeoutMs: Number.isFinite(Number(options.attributeTimeoutMs))
        ? Math.max(4000, Math.trunc(Number(options.attributeTimeoutMs)))
        : 12000,
    });
  }

  let out = { ...base };
  if (weightReview && !out.weight_review_1688) {
    out.weight_review_1688 = weightReview;
  }
  if (weightReview?.needs_review) {
    const reasonTag = Array.isArray(weightReview.reason_codes)
      ? weightReview.reason_codes.map((entry) => asText(entry)).filter(Boolean).join(",")
      : "";
    out = appendUniqueNote(
      out,
      `ai_weight_review_warning:${reasonTag || "possible_weight_issue"}`
    );
  }

  out.ai_1688 = {
    version: 1,
    processed_at: new Date().toISOString(),
    source,
    mode,
    weight_review: weightReview
      ? {
          used: Boolean(weightReview?.ai?.used),
          needs_review: Boolean(weightReview.needs_review),
          confidence:
            typeof weightReview.confidence === "number"
              ? Number(weightReview.confidence)
              : null,
          reason_codes: Array.isArray(weightReview.reason_codes)
            ? weightReview.reason_codes.map((entry) => asText(entry)).filter(Boolean)
            : [],
          summary: asText(weightReview.summary).slice(0, 600),
          model: asText(weightReview?.ai?.model) || null,
        }
      : null,
    attribute_extract: attributeExtract,
  };

  return out;
};

export const enhance1688ItemsWithAi = async (items, options = {}) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const concurrency = Number.isFinite(Number(options.concurrency))
    ? Math.max(1, Math.min(6, Math.trunc(Number(options.concurrency))))
    : 2;
  const out = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= list.length) return;
      try {
        out[idx] = await enhance1688ItemWithAi(list[idx], options);
      } catch {
        out[idx] = list[idx];
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
};

