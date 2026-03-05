import { asText, extractJsonFromText } from "./core.mjs";
import { reviewSupplierWeightBestEffort } from "./weight-review.mjs";

const DEFAULT_MODELS = [
  process.env.NODEXO_1688_AI_MODEL,
  process.env.SUPPLIER_WEIGHT_REVIEW_MODEL,
  "gpt-5.2",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
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
    item?.text_1688?.readable_ai_clean ||
      item?.readable_1688 ||
      item?.text_1688?.readable_compact ||
      item?.readable_1688_full ||
      item?.text_1688?.readable_full ||
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

const summarizeVariantRows = (variations, maxRows = 35) => {
  const combos = Array.isArray(variations?.combos) ? variations.combos : [];
  const limit = Number.isFinite(Number(maxRows))
    ? Math.max(1, Math.trunc(Number(maxRows)))
    : 35;
  return combos.slice(0, limit).map((combo, index) => ({
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

const toRoundedPositiveInt = (value, options = {}) => {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 1;
  const max = Number.isFinite(Number(options.max))
    ? Number(options.max)
    : Number.MAX_SAFE_INTEGER;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
};

const parseWeightGramsLoose = (value) => {
  const raw = asText(value).replace(/,/g, ".").toLowerCase();
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (/kg|公斤|千克/.test(raw)) return Math.round(num * 1000);
  if (/g|克/.test(raw)) return Math.round(num);
  if (raw.includes(".") && num <= 20) return Math.round(num * 1000);
  return Math.round(num);
};

const normalizeVariantLabelKey = (value) =>
  asText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\/|,;:()（）【】\[\]{}<>._-]+/g, "");

const toVariantDisplayLabel = (row) =>
  asText(
    row?.t1 ||
      row?.t1_zh ||
      row?.t1_en ||
      row?.name ||
      row?.title ||
      row?.spec ||
      ""
  );

const SIZE_TOKEN_RE =
  /\b(?:xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|one\s*size|free\s*size|size)\b|尺码|均码/i;

const analyzeVariantWeightQuality = (variations, options = {}) => {
  const combos = Array.isArray(variations?.combos) ? variations.combos : [];
  const comboCount = combos.length;
  const weights = [];
  let weightedCount = 0;
  let sizeLikeCount = 0;

  combos.forEach((combo) => {
    const row = combo && typeof combo === "object" ? combo : {};
    const grams =
      toRoundedPositiveInt(row?.weight_grams, { min: 1, max: 500_000 }) ??
      parseWeightGramsLoose(row?.weight_raw ?? row?.weightRaw ?? row?.weight);
    if (grams) {
      weightedCount += 1;
      weights.push(grams);
    }
    const label = [
      row?.t1,
      row?.t2,
      row?.t3,
      row?.t1_zh,
      row?.t2_zh,
      row?.t3_zh,
      row?.t1_en,
      row?.t2_en,
      row?.t3_en,
      row?.name,
      row?.title,
      row?.spec,
    ]
      .map((entry) => asText(entry))
      .filter(Boolean)
      .join(" ");
    if (SIZE_TOKEN_RE.test(label)) sizeLikeCount += 1;
  });

  const uniqueWeights = Array.from(new Set(weights)).sort((a, b) => a - b);
  const coverage = comboCount > 0 ? weightedCount / comboCount : 0;
  const min = uniqueWeights.length ? uniqueWeights[0] : null;
  const max = uniqueWeights.length ? uniqueWeights[uniqueWeights.length - 1] : null;
  const spreadRatio =
    min && max && min > 0 ? Number((max / min).toFixed(4)) : null;

  const zeroWeights = weightedCount === 0 && comboCount > 0;
  const mostlyMissing = comboCount >= 2 && coverage < 0.5;
  const flatHigh =
    weightedCount >= 5 && uniqueWeights.length === 1 && uniqueWeights[0] >= 1500;
  const hugeSpread = Boolean(spreadRatio && weightedCount >= 4 && spreadRatio >= 8);
  const flatAcrossSizes =
    sizeLikeCount >= 3 && weightedCount >= 3 && uniqueWeights.length === 1;
  const hasStrongStructuredTable = Boolean(options.hasStrongStructuredTable);

  const shouldRun = Boolean(
    comboCount > 0 &&
      !hasStrongStructuredTable &&
      (zeroWeights || mostlyMissing || flatHigh || hugeSpread || flatAcrossSizes)
  );
  const allowOverwrite = Boolean(flatHigh || hugeSpread || flatAcrossSizes);

  return {
    combo_count: comboCount,
    combos_with_weight: weightedCount,
    unique_weights_grams: uniqueWeights,
    coverage_ratio: Number(coverage.toFixed(4)),
    spread_ratio: spreadRatio,
    size_like_count: sizeLikeCount,
    zero_weights: zeroWeights,
    mostly_missing: mostlyMissing,
    flat_high_weights: flatHigh,
    huge_spread: hugeSpread,
    flat_across_sizes: flatAcrossSizes,
    has_strong_structured_table: hasStrongStructuredTable,
    should_run: shouldRun,
    allow_overwrite: allowOverwrite,
  };
};

const normalizeInferenceRows = (parsed) => {
  const candidates = [];
  const lists = [
    parsed?.combo_weights,
    parsed?.variant_weights,
    parsed?.size_weights,
    parsed?.size_weights_grams,
    parsed?.weights,
  ];
  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => candidates.push(entry));
  });

  const objectWeights =
    parsed?.weights_by_label && typeof parsed.weights_by_label === "object"
      ? parsed.weights_by_label
      : null;
  if (objectWeights) {
    Object.entries(objectWeights).forEach(([label, grams]) => {
      candidates.push({ label, weight_grams: grams });
    });
  }

  const out = [];
  const seen = new Set();
  candidates.forEach((entry) => {
    const rec = entry && typeof entry === "object" ? entry : {};
    const index =
      Number.isInteger(Number(rec.index)) && Number(rec.index) >= 0
        ? Number(rec.index)
        : Number.isInteger(Number(rec.idx)) && Number(rec.idx) >= 0
          ? Number(rec.idx)
          : null;
    const label = asText(
      rec.label || rec.size || rec.variant || rec.name || rec.title || rec.t1 || ""
    );
    const weightGrams = toRoundedPositiveInt(
      rec.weight_grams || rec.weightGrams || rec.grams || rec.weight,
      { min: 1, max: 500_000 }
    );
    if (!weightGrams) return;
    if (index === null && !label) return;
    const confidence = toRoundedPositiveInt(
      rec.confidence_0_to_10 || rec.confidence || rec.score,
      { min: 0, max: 10 }
    );
    const key = `${index ?? ""}::${label.toLowerCase()}::${weightGrams}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      index,
      label,
      weight_grams: weightGrams,
      confidence_0_to_10: confidence,
    });
  });
  return out;
};

const normalizeWeightInferenceResult = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const decisionRaw = asText(parsed.decision || parsed.result || parsed.action).toLowerCase();
  const decision = decisionRaw === "go" ? "go" : decisionRaw === "skip" ? "skip" : "skip";
  const confidence = toRoundedPositiveInt(
    parsed.confidence_0_to_10 || parsed.confidence || parsed.score,
    { min: 0, max: 10 }
  );
  return {
    decision,
    confidence_0_to_10: confidence ?? 0,
    summary: asText(parsed.summary || parsed.reason || parsed.analysis).slice(0, 600),
    reason_codes: uniq(parsed.reason_codes || parsed.warnings || [], 20),
    combo_weights: normalizeInferenceRows(parsed),
    evidence_lines: uniq(parsed.evidence_lines || parsed.evidence || [], 20),
  };
};

const runWeightInferenceAi = async ({
  apiKey,
  modelCandidates,
  item,
  extractedPayload,
  timeoutMs = 14_000,
}) => {
  const models = toModels(modelCandidates);
  if (!apiKey || !models.length) {
    return { used: false, error: !apiKey ? "missing_api_key" : "missing_model" };
  }
  const extracted = extractedPayload?.extracted || {};
  const variations = normalizeVariations(extracted.variations);
  const variantRows = summarizeVariantRows(variations, 120).map((row) => ({
    ...row,
    label: toVariantDisplayLabel(row),
  }));
  if (!variantRows.length) {
    return { used: false, error: "no_variants" };
  }

  const readableText = compactReadableText(extracted.readableText, {
    maxChars: 16_000,
    maxLines: 500,
  });
  const weightFocusedText = String(readableText || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /(重量|净重|毛重|克重|kg|g|斤|千克|公斤|size|尺码|XS|XL|XXL)/i.test(line))
    .slice(0, 220)
    .join("\n")
    .slice(0, 8_000);
  const productWeights = normalizeWeightList(extracted.weights);
  const titleHints = toTitleHints(item);

  const prompt = [
    "You infer PER-UNIT variant product weights for a 1688 supplier page.",
    "Use only provided data. Never use carton/shipping/packaging weights.",
    "If evidence is weak, return decision=skip.",
    "When variants are clothing sizes and anchors exist (e.g., XS/3XL), infer a smooth monotonic size-to-weight progression.",
    "Do not output unrealistic outliers unless strongly supported by text.",
    "Return JSON only.",
    "Schema:",
    "{",
    '  "decision":"go|skip",',
    '  "confidence_0_to_10":0-10,',
    '  "summary":"...",',
    '  "reason_codes":["..."],',
    '  "combo_weights":[{"index":0,"label":"...","weight_grams":520,"confidence_0_to_10":7}],',
    '  "evidence_lines":["..."]',
    "}",
    "",
    "Input:",
    JSON.stringify(
      {
        detail_url: toDetailUrl(item),
        title_hints: titleHints,
        product_weights_1688: productWeights,
        variant_rows: variantRows,
        weight_focused_text: weightFocusedText,
        readable_excerpt: readableText,
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
      const normalized = normalizeWeightInferenceResult(parsed);
      if (!normalized) continue;
      return {
        used: true,
        model,
        error: null,
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

const applyWeightInferenceToVariations = ({
  variations,
  inferenceRows,
  allowOverwrite = false,
}) => {
  const next = normalizeVariations(variations);
  if (!next || !Array.isArray(next.combos) || !next.combos.length) {
    return { variations: next, applied_count: 0, matched_count: 0 };
  }

  const combos = next.combos.map((combo) =>
    combo && typeof combo === "object" ? { ...combo } : {}
  );
  const keyToIndexes = new Map();
  combos.forEach((combo, idx) => {
    const labels = uniq(
      [
        combo?.t1,
        combo?.t1_zh,
        combo?.t1_en,
        combo?.name,
        combo?.title,
        combo?.spec,
      ],
      12
    );
    labels.forEach((label) => {
      const key = normalizeVariantLabelKey(label);
      if (!key) return;
      if (!keyToIndexes.has(key)) keyToIndexes.set(key, []);
      keyToIndexes.get(key).push(idx);
    });
  });

  let matched = 0;
  let applied = 0;

  (Array.isArray(inferenceRows) ? inferenceRows : []).forEach((row) => {
    const targetIndexes = [];
    if (
      Number.isInteger(Number(row?.index)) &&
      Number(row.index) >= 0 &&
      Number(row.index) < combos.length
    ) {
      targetIndexes.push(Number(row.index));
    } else {
      const key = normalizeVariantLabelKey(row?.label);
      if (key && keyToIndexes.has(key)) {
        targetIndexes.push(...keyToIndexes.get(key));
      }
    }
    if (!targetIndexes.length) return;
    matched += 1;

    const inferredWeight = toRoundedPositiveInt(row?.weight_grams, {
      min: 1,
      max: 500_000,
    });
    if (!inferredWeight) return;

    targetIndexes.forEach((idx) => {
      const combo = combos[idx] || {};
      const existingWeight =
        toRoundedPositiveInt(combo?.weight_grams, { min: 1, max: 500_000 }) ??
        parseWeightGramsLoose(combo?.weight_raw ?? combo?.weightRaw ?? combo?.weight);
      if (existingWeight && !allowOverwrite) return;
      if (existingWeight && allowOverwrite && Math.abs(existingWeight - inferredWeight) <= 2) return;
      combo.weight_grams = inferredWeight;
      if (!asText(combo.weight_raw)) combo.weight_raw = `${inferredWeight}g`;
      combos[idx] = combo;
      applied += 1;
    });
  });

  return {
    variations: {
      ...next,
      combos,
    },
    matched_count: matched,
    applied_count: applied,
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
  const enableWeightInference = toBool(
    options.enableWeightInference ??
      process.env.NODEXO_1688_AI_WEIGHT_INFERENCE ??
      "1",
    true
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

  const baseVariations = normalizeVariations(
    base?.variations_enriched_1688 && typeof base.variations_enriched_1688 === "object"
      ? base.variations_enriched_1688
      : base?.variations
  );
  const hasStrongStructuredTable = Boolean(
    weightReview?.heuristic?.metrics?.structured_table?.strong_table_pass
  );
  const weightQuality = analyzeVariantWeightQuality(baseVariations, {
    hasStrongStructuredTable,
  });

  let weightInference = {
    used: false,
    error: "disabled",
    decision: "skip",
    confidence_0_to_10: 0,
    summary: "",
    reason_codes: [],
    combo_weights: [],
    evidence_lines: [],
    analysis: weightQuality,
    applied_count: 0,
    matched_count: 0,
    applied: false,
    model: null,
  };
  let inferredVariations = null;
  if (enableWeightInference) {
    if (!apiKey) {
      weightInference = { ...weightInference, error: "missing_api_key" };
    } else if (!weightQuality.should_run) {
      weightInference = {
        ...weightInference,
        error: hasStrongStructuredTable ? "strong_structured_table" : "not_needed",
      };
    } else {
      const inference = await runWeightInferenceAi({
        apiKey,
        modelCandidates,
        item: base,
        extractedPayload,
        timeoutMs: Number.isFinite(Number(options.weightInferenceTimeoutMs))
          ? Math.max(4_000, Math.trunc(Number(options.weightInferenceTimeoutMs)))
          : 14_000,
      });
      weightInference = {
        ...weightInference,
        ...inference,
        analysis: weightQuality,
        model: asText(inference?.model) || null,
      };

      if (
        inference?.used &&
        inference?.decision === "go" &&
        Number(inference?.confidence_0_to_10) >= 5
      ) {
        const applied = applyWeightInferenceToVariations({
          variations: baseVariations,
          inferenceRows: inference.combo_weights,
          allowOverwrite: weightQuality.allow_overwrite,
        });
        if (applied?.variations && applied.applied_count > 0) {
          inferredVariations = applied.variations;
          weightInference.applied = true;
          weightInference.applied_count = Number(applied.applied_count) || 0;
          weightInference.matched_count = Number(applied.matched_count) || 0;
        } else {
          weightInference.error = "no_applicable_matches";
        }
      } else if (inference?.used && inference?.decision !== "go") {
        weightInference.error = "model_skip";
      } else if (inference?.used && Number(inference?.confidence_0_to_10) < 5) {
        weightInference.error = "low_confidence";
      }
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
  const weightReviewWithInference =
    weightReview && typeof weightReview === "object"
      ? {
          ...weightReview,
          inference: {
            used: Boolean(weightInference.used),
            model: asText(weightInference.model) || null,
            decision: asText(weightInference.decision || "skip") || "skip",
            confidence_0_to_10: toRoundedPositiveInt(
              weightInference.confidence_0_to_10,
              { min: 0, max: 10 }
            ),
            applied: Boolean(weightInference.applied),
            applied_count: Number(weightInference.applied_count) || 0,
            matched_count: Number(weightInference.matched_count) || 0,
            reason_codes: Array.isArray(weightInference.reason_codes)
              ? weightInference.reason_codes.map((entry) => asText(entry)).filter(Boolean)
              : [],
            summary: asText(weightInference.summary).slice(0, 600),
            error: asText(weightInference.error) || null,
            evidence_lines: Array.isArray(weightInference.evidence_lines)
              ? weightInference.evidence_lines.map((entry) => asText(entry)).filter(Boolean)
              : [],
            analysis: weightQuality,
          },
        }
      : weightReview;
  if (weightReviewWithInference) {
    out.weight_review_1688 = weightReviewWithInference;
  }
  if (!out.weight_review_1688 && enableWeightInference) {
    out.weight_review_1688 = {
      version: 1,
      generated_at: new Date().toISOString(),
      mode: "multi_variant",
      needs_review: false,
      trigger_next_supplier: false,
      confidence: 0.5,
      reason_codes: [],
      summary: "Weight review unavailable.",
      heuristic: null,
      ai: null,
      inference: {
        used: Boolean(weightInference.used),
        model: asText(weightInference.model) || null,
        decision: asText(weightInference.decision || "skip") || "skip",
        confidence_0_to_10: toRoundedPositiveInt(weightInference.confidence_0_to_10, {
          min: 0,
          max: 10,
        }),
        applied: Boolean(weightInference.applied),
        applied_count: Number(weightInference.applied_count) || 0,
        matched_count: Number(weightInference.matched_count) || 0,
        reason_codes: Array.isArray(weightInference.reason_codes)
          ? weightInference.reason_codes.map((entry) => asText(entry)).filter(Boolean)
          : [],
        summary: asText(weightInference.summary).slice(0, 600),
        error: asText(weightInference.error) || null,
        evidence_lines: Array.isArray(weightInference.evidence_lines)
          ? weightInference.evidence_lines.map((entry) => asText(entry)).filter(Boolean)
          : [],
        analysis: weightQuality,
      },
    };
  }
  if (inferredVariations && Array.isArray(inferredVariations.combos)) {
    out.variations_enriched_1688 = inferredVariations;
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
    weight_inference: {
      used: Boolean(weightInference.used),
      model: asText(weightInference.model) || null,
      decision: asText(weightInference.decision || "skip") || "skip",
      confidence_0_to_10: toRoundedPositiveInt(weightInference.confidence_0_to_10, {
        min: 0,
        max: 10,
      }),
      applied: Boolean(weightInference.applied),
      applied_count: Number(weightInference.applied_count) || 0,
      matched_count: Number(weightInference.matched_count) || 0,
      reason_codes: Array.isArray(weightInference.reason_codes)
        ? weightInference.reason_codes.map((entry) => asText(entry)).filter(Boolean)
        : [],
      summary: asText(weightInference.summary).slice(0, 600),
      error: asText(weightInference.error) || null,
      analysis: weightQuality,
    },
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
