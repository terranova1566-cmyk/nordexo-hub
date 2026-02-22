import {
  asText,
  extractJsonFromText,
  toWeightGrams,
} from "./core.mjs";

const WEIGHT_TOKEN_RE = /(-?\d+(?:[.,]\d+)?)\s*(kg|g|公斤|千克|克)\b/gi;
const WEIGHT_KEYWORD_RE = /(重量|净重|毛重|单重|克重|每个|每件|规格|主机|片|套|pack|pcs?|kg|g)/i;
const MULTI_PACK_HINT_RE = /(主机|套|片|pcs?|pack|个|只|台|枚|张|组)/i;
const PACKAGING_WEIGHT_HINT_RE =
  /(整箱|外箱|箱规|箱装|装箱|毛重|包装重量|包装重|箱重|净含量|件\/箱|每箱|carton|ctn|master\s*carton|outer\s*box|gross\s*weight|shipping\s*weight)/i;

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPriceNumber = (value) => {
  const raw = asText(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".");
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
};

const normalizePackSignature = (value) => {
  const text = asText(value);
  if (!text) return "";
  const numbers = Array.from(text.matchAll(/\d+(?:[.,]\d+)?/g))
    .map((entry) => Number(entry[0]))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 500)
    .map((entry) => Math.round(entry));
  if (numbers.length === 0) return "";
  return Array.from(new Set(numbers)).sort((a, b) => a - b).join("+");
};

const buildVariantLabel = (row) => {
  const values = [
    row?.t1_zh,
    row?.t1,
    row?.t1_en,
    row?.name,
    row?.spec,
    row?.title,
  ];
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const collectVariantRows = (extracted) => {
  const variations =
    extracted && typeof extracted === "object" && extracted.variations && typeof extracted.variations === "object"
      ? extracted.variations
      : null;
  const combos = Array.isArray(variations?.combos) ? variations.combos : [];
  return combos.map((combo, index) => {
    const row = combo && typeof combo === "object" ? combo : {};
    const label = buildVariantLabel(row);
    const weightGrams =
      asNumber(row.weight_grams) ??
      toWeightGrams(row.weight_raw, { allowUnitless: true }) ??
      toWeightGrams(row.weightRaw, { allowUnitless: true }) ??
      toWeightGrams(row.weight, { allowUnitless: true }) ??
      null;
    const price =
      asNumber(row.price) ??
      toPriceNumber(row.price_raw) ??
      toPriceNumber(row.priceRaw) ??
      toPriceNumber(row.price) ??
      null;
    return {
      index,
      label,
      label_en: asText(row.t1_en) || "",
      weight_grams:
        typeof weightGrams === "number" && Number.isFinite(weightGrams) && weightGrams > 0
          ? Math.round(weightGrams)
          : null,
      weight_raw: asText(row.weight_raw || row.weightRaw || row.weight) || "",
      price,
      pack_signature: normalizePackSignature(label),
    };
  });
};

const extractWeightMentionsFromText = (value, options = {}) => {
  const maxMentions = Number.isFinite(Number(options.maxMentions))
    ? Math.max(5, Math.trunc(Number(options.maxMentions)))
    : 40;
  const text = asText(value).replace(/\r/g, "\n");
  if (!text) return [];

  const out = [];
  const seen = new Set();
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const matches = Array.from(line.matchAll(WEIGHT_TOKEN_RE));
    if (matches.length === 0) continue;
    for (const match of matches) {
      const token = asText(match[0]);
      if (!token) continue;
      const grams = toWeightGrams(token, { allowUnitless: false });
      if (!grams || !Number.isFinite(grams) || grams <= 0) continue;
      const key = `${grams}:${token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const packagingHint = PACKAGING_WEIGHT_HINT_RE.test(line);
      out.push({
        weight_grams: Math.round(grams),
        token,
        line: line.slice(0, 220),
        source_kind: packagingHint ? "packaging" : "unit_or_unknown",
      });
      if (out.length >= maxMentions) return out;
    }
  }

  return out;
};

const collectWeightFocusedText = (value, options = {}) => {
  const maxChars = Number.isFinite(Number(options.maxChars))
    ? Math.max(600, Math.trunc(Number(options.maxChars)))
    : 4_000;
  const maxLines = Number.isFinite(Number(options.maxLines))
    ? Math.max(20, Math.trunc(Number(options.maxLines)))
    : 160;

  const lines = String(value || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (!WEIGHT_KEYWORD_RE.test(line)) continue;
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
    if (out.length >= maxLines) break;
  }

  return out.join("\n").slice(0, maxChars);
};

const summarizeHeuristic = ({
  mode,
  reasonCodes,
  uniqueWeightCount,
  comboCount,
  distinctPackSignatures,
}) => {
  if (!reasonCodes.length) {
    if (mode === "multi_variant") {
      return `No obvious weight anomaly across ${comboCount} variants.`;
    }
    return "No obvious weight anomaly in current text/weight data.";
  }

  const parts = [];
  if (reasonCodes.includes("flat_variant_weights")) {
    parts.push("many variants share one weight");
  }
  if (reasonCodes.includes("pack_counts_differ_but_weight_flat")) {
    parts.push("pack/config counts differ while weight stays flat");
  }
  if (reasonCodes.includes("price_changes_without_weight_changes")) {
    parts.push("price changes but weight stays unchanged");
  }
  if (reasonCodes.includes("text_has_conflicting_weight_tokens")) {
    parts.push("text contains conflicting weight tokens");
  }
  if (reasonCodes.includes("single_weight_unusually_high_for_variant_set")) {
    parts.push("single shared weight is unusually high");
  }

  const lead = mode === "multi_variant" ? "Variant weight warning" : "Weight warning";
  return `${lead}: ${parts.join("; ")} (unique weights: ${uniqueWeightCount}, pack signatures: ${distinctPackSignatures}).`;
};

const buildHeuristicReview = ({
  variantRows,
  textWeightMentions,
  productWeights,
}) => {
  const weightedRows = variantRows.filter(
    (row) => typeof row.weight_grams === "number" && Number.isFinite(row.weight_grams) && row.weight_grams > 0
  );
  const comboCount = variantRows.length;
  const mode = comboCount >= 2 ? "multi_variant" : "single_product";

  const uniqueWeights = Array.from(
    new Set(weightedRows.map((row) => Math.round(Number(row.weight_grams))))
  ).sort((a, b) => a - b);
  const uniqueWeightCount = uniqueWeights.length;

  const distinctPackSignatures = Array.from(
    new Set(
      variantRows
        .map((row) => asText(row.pack_signature))
        .filter(Boolean)
    )
  );

  const pricedRows = variantRows.filter((row) => typeof row.price === "number" && Number.isFinite(row.price));
  const uniquePrices = Array.from(
    new Set(pricedRows.map((row) => Number(row.price).toFixed(4)))
  );

  const textWeights = Array.from(
    new Set(
      textWeightMentions
        .filter((entry) => asText(entry.source_kind).toLowerCase() !== "packaging")
        .map((entry) => Number(entry.weight_grams))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    )
  ).sort((a, b) => a - b);
  const packagingTextWeights = Array.from(
    new Set(
      textWeightMentions
        .map((entry) => Number(entry.weight_grams))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    )
  ).sort((a, b) => a - b);

  const productWeightCandidates = (Array.isArray(productWeights) ? productWeights : [])
    .map((entry) => toWeightGrams(entry, { allowUnitless: true }))
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.round(Number(entry)));

  const reasonCodes = [];
  let score = 0;

  if (mode === "multi_variant") {
    if (weightedRows.length >= 3 && uniqueWeightCount === 1) {
      reasonCodes.push("flat_variant_weights");
      score += 0.58;
    }
    if (
      weightedRows.length >= 2 &&
      uniqueWeightCount === 1 &&
      distinctPackSignatures.length >= 2 &&
      variantRows.some((row) => MULTI_PACK_HINT_RE.test(asText(row.label)))
    ) {
      reasonCodes.push("pack_counts_differ_but_weight_flat");
      score += 0.34;
    }
    if (weightedRows.length >= 2 && uniqueWeightCount === 1 && uniquePrices.length >= 2) {
      reasonCodes.push("price_changes_without_weight_changes");
      score += 0.12;
    }
    if (
      uniqueWeightCount === 1 &&
      weightedRows.length >= 5 &&
      uniqueWeights[0] >= 1200
    ) {
      reasonCodes.push("single_weight_unusually_high_for_variant_set");
      score += 0.2;
    }
  }

  if (textWeights.length >= 2) {
    const min = textWeights[0];
    const max = textWeights[textWeights.length - 1];
    if (min > 0 && max / min >= 3.2) {
      reasonCodes.push("text_has_conflicting_weight_tokens");
      score += mode === "multi_variant" ? 0.22 : 0.48;
    }
  }

  if (mode === "single_product" && productWeightCandidates.length > 0 && textWeights.length > 0) {
    const bestProductWeight = productWeightCandidates[0];
    const nearestDelta = Math.min(
      ...textWeights.map((entry) => Math.abs(entry - bestProductWeight))
    );
    if (nearestDelta > Math.max(120, bestProductWeight * 0.5)) {
      reasonCodes.push("table_weight_conflicts_with_text_weight");
      score += 0.28;
    }
  }

  const dedupReasonCodes = Array.from(new Set(reasonCodes));
  const normalizedScore = Math.min(1, Number(score.toFixed(4)));
  const needsReview = normalizedScore >= 0.55 || dedupReasonCodes.includes("pack_counts_differ_but_weight_flat");
  const severity = !needsReview
    ? "none"
    : normalizedScore >= 0.8
      ? "high"
      : "medium";

  return {
    mode,
    needs_review: needsReview,
    severity,
    score: normalizedScore,
    reason_codes: dedupReasonCodes,
    summary: summarizeHeuristic({
      mode,
      reasonCodes: dedupReasonCodes,
      uniqueWeightCount,
      comboCount,
      distinctPackSignatures: distinctPackSignatures.length,
    }),
    metrics: {
      combo_count: comboCount,
      combos_with_weight: weightedRows.length,
      unique_weight_count: uniqueWeightCount,
      unique_weights_grams: uniqueWeights,
      distinct_pack_signatures: distinctPackSignatures.length,
      unique_price_count: uniquePrices.length,
      text_weight_candidates_grams: textWeights,
      packaging_weight_candidates_grams: packagingTextWeights,
      product_weight_candidates_grams: Array.from(new Set(productWeightCandidates)).sort((a, b) => a - b),
    },
  };
};

const parseAiReview = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const reasonCodes = Array.isArray(parsed.reason_codes)
    ? parsed.reason_codes.map((entry) => asText(entry)).filter(Boolean)
    : [];
  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;

  return {
    needs_review: Boolean(parsed.needs_review),
    confidence,
    summary: asText(parsed.summary).slice(0, 500),
    reason_codes: reasonCodes,
  };
};

const runAiReview = async ({
  apiKey,
  modelCandidates,
  context,
  timeoutMs = 12_000,
}) => {
  if (!apiKey) {
    return {
      used: false,
      error: "missing_api_key",
    };
  }

  const prompt = [
    "You are validating 1688 scraped weight data.",
    "Do not fix or change any weight values.",
    "Only decide whether the weight data is likely unreliable and should be manually reviewed.",
    "Ignore carton/export-box/master-carton/gross/shipping packaging weights.",
    "Prioritize per-unit or per-variant product weight.",
    "Return JSON only.",
    "Output schema:",
    '{"needs_review": true|false, "confidence": 0..1, "reason_codes": ["..."], "summary": "..."}',
    "Reason code examples: flat_variant_weights, pack_counts_differ_but_weight_flat, text_has_conflicting_weight_tokens, table_weight_conflicts_with_text_weight, plausible",
    "If uncertain, keep needs_review=true when there are clear inconsistencies.",
    "Never output corrected weights.",
    "",
    "Input JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const models = Array.from(
    new Set(
      (Array.isArray(modelCandidates) ? modelCandidates : [])
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );
  if (models.length === 0) {
    return {
      used: false,
      error: "missing_model",
    };
  }

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
      const ai = parseAiReview(parsed);
      if (!ai) continue;
      return {
        used: true,
        model,
        ...ai,
      };
    } catch {
      // try next model
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    used: false,
    error: "model_failed",
  };
};

export const reviewSupplierWeightBestEffort = async ({
  extractedPayload,
  competitor,
  detailUrl,
  apiKey = process.env.OPENAI_API_KEY,
  enableAi = process.env.NODEXO_WEIGHT_REVIEW_ENABLE_AI,
} = {}) => {
  const extracted =
    extractedPayload && typeof extractedPayload === "object" && extractedPayload.extracted && typeof extractedPayload.extracted === "object"
      ? extractedPayload.extracted
      : {};

  const variantRows = collectVariantRows(extracted);
  const readableText = asText(extracted?.readableText);
  const textWeightMentions = extractWeightMentionsFromText(readableText, {
    maxMentions: 50,
  });
  const productWeights = Array.isArray(extracted?.weights) ? extracted.weights : [];

  const heuristic = buildHeuristicReview({
    variantRows,
    textWeightMentions,
    productWeights,
  });

  const aiAllowed = String(enableAi ?? "1").trim() !== "0";
  const aiContext = {
    detail_url: asText(detailUrl),
    competitor_title: asText(competitor?.title).slice(0, 180),
    competitor_description: asText(competitor?.description).slice(0, 380),
    mode: heuristic.mode,
    heuristic: {
      score: heuristic.score,
      reason_codes: heuristic.reason_codes,
      metrics: heuristic.metrics,
    },
    rules: {
      ignore_packaging_carton_weights: true,
    },
    variant_rows: variantRows.slice(0, 25),
    product_weights_1688: productWeights,
    text_weight_mentions: textWeightMentions.slice(0, 30),
    weight_focused_text: collectWeightFocusedText(readableText, {
      maxChars: 4200,
      maxLines: 180,
    }),
  };

  const aiModelCandidates = [
    process.env.SUPPLIER_WEIGHT_REVIEW_MODEL,
    "gpt-4o-mini",
    "gpt-5-nano",
    process.env.SUPPLIER_TRANSLATE_MODEL,
    process.env.OPENAI_EDIT_MODEL,
  ];

  const shouldRunAi = aiAllowed && asText(apiKey) && (variantRows.length > 0 || productWeights.length > 0);
  const ai = shouldRunAi
    ? await runAiReview({
        apiKey: asText(apiKey),
        modelCandidates: aiModelCandidates,
        context: aiContext,
        timeoutMs: 11_000,
      })
    : { used: false, error: shouldRunAi ? "unknown" : "disabled" };

  const aiNeedsReview = Boolean(ai?.used && ai?.needs_review);
  const needsReview = heuristic.needs_review || aiNeedsReview;
  const reasonCodes = Array.from(
    new Set([
      ...heuristic.reason_codes,
      ...(Array.isArray(ai?.reason_codes) ? ai.reason_codes.map((entry) => asText(entry)).filter(Boolean) : []),
    ])
  );

  const confidenceFromAi =
    typeof ai?.confidence === "number" && Number.isFinite(ai.confidence)
      ? Math.max(0, Math.min(1, Number(ai.confidence)))
      : null;
  const confidence =
    confidenceFromAi !== null
      ? confidenceFromAi
      : needsReview
        ? Math.max(0.45, Math.min(0.92, heuristic.score))
        : Math.max(0.08, 1 - heuristic.score);

  const summary = asText(ai?.summary) || heuristic.summary;

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: heuristic.mode,
    needs_review: needsReview,
    trigger_next_supplier: needsReview,
    confidence: Number(confidence.toFixed(4)),
    reason_codes: reasonCodes,
    summary,
    heuristic,
    ai: {
      used: Boolean(ai?.used),
      model: asText(ai?.model) || null,
      error: ai?.error ? asText(ai.error) : null,
      needs_review: Boolean(ai?.used && ai?.needs_review),
      confidence:
        typeof ai?.confidence === "number" && Number.isFinite(ai.confidence)
          ? Number(ai.confidence)
          : null,
      reason_codes: Array.isArray(ai?.reason_codes)
        ? ai.reason_codes.map((entry) => asText(entry)).filter(Boolean)
        : [],
      summary: asText(ai?.summary) || null,
    },
    evidence: {
      combo_count: heuristic.metrics.combo_count,
      combos_with_weight: heuristic.metrics.combos_with_weight,
      unique_weights_grams: heuristic.metrics.unique_weights_grams,
      text_weight_mentions: textWeightMentions.slice(0, 20),
      variant_snapshot: variantRows.slice(0, 20),
    },
  };
};

export const __testables = {
  collectVariantRows,
  extractWeightMentionsFromText,
  buildHeuristicReview,
  collectWeightFocusedText,
};
