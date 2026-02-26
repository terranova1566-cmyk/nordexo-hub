const PARSER_VERSION = '2026-02-22.enriched.v1';
const WEIGHT_TOKEN_RE = /(-?\d+(?:[.,]\d+)?)\s*(kg|g|公斤|千克|克)\b/gi;
const WEIGHT_KEYWORD_RE = /(重量|净重|毛重|单重|克重|规格|尺寸|体积|pack|pcs?|kg|g|公斤|千克|克)/i;
const PACKAGING_HINT_RE =
  /(整箱|外箱|箱规|箱装|装箱|毛重|包装重量|包装重|箱重|净含量|件\/箱|每箱|carton|ctn|master\s*carton|outer\s*box|gross\s*weight|shipping\s*weight|包装清单)/i;
const CAPACITY_HINT_RE = /(承重|负重|载重|load\s*capacity|max\s*load)/i;

const asText = (value) => (value === null || value === undefined ? '' : String(value).trim());

export function toWeightGrams(value, options = {}) {
  const { allowUnitless = false } = options || {};
  const raw = asText(value);
  if (!raw) return null;

  const normalized = raw.replace(/,/g, '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;

  const unitText = normalized.toLowerCase();
  if (unitText.includes('kg') || unitText.includes('公斤') || unitText.includes('千克')) return Math.round(num * 1000);
  if (unitText.includes('g') || unitText.includes('克')) return Math.round(num);
  if (!allowUnitless) return null;
  if (num <= 20 && normalized.includes('.')) return Math.round(num * 1000);
  return Math.round(num);
}

const normalizeNameStrict = (value) =>
  asText(value)
    .toLowerCase()
    .replace(/\s+/g, '');

const normalizeNameLoose = (value) => normalizeNameStrict(value).replace(/[（(].*?[）)]/g, '');

const inferWeightScope = (raw, line) => {
  const text = `${asText(raw)} ${asText(line)}`.trim();
  if (!text) return 'unknown';
  if (PACKAGING_HINT_RE.test(text)) return 'packaging';
  if (CAPACITY_HINT_RE.test(text)) return 'capacity';
  return 'unit';
};

const collectWeightFocusedText = (value, options = {}) => {
  const maxChars = Number.isFinite(Number(options.maxChars))
    ? Math.max(800, Math.trunc(Number(options.maxChars)))
    : 4200;
  const maxLines = Number.isFinite(Number(options.maxLines))
    ? Math.max(20, Math.trunc(Number(options.maxLines)))
    : 180;
  const lines = String(value || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (!WEIGHT_KEYWORD_RE.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out.join('\n').slice(0, maxChars);
};

const extractTextWeightMentions = (value, options = {}) => {
  const maxMentions = Number.isFinite(Number(options.maxMentions))
    ? Math.max(5, Math.trunc(Number(options.maxMentions)))
    : 60;
  const text = asText(value).replace(/\r/g, '\n');
  if (!text) return [];

  const out = [];
  const seen = new Set();
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const line of lines) {
    const matches = Array.from(line.matchAll(WEIGHT_TOKEN_RE));
    if (!matches.length) continue;
    for (const match of matches) {
      const raw = asText(match[0]);
      if (!raw) continue;
      const grams = toWeightGrams(raw, { allowUnitless: false });
      if (!grams || !Number.isFinite(grams) || grams <= 0) continue;
      const scope = inferWeightScope(raw, line);
      const key = `${scope}:${grams}:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        raw,
        grams: Math.round(grams),
        scope,
        source: 'text_token',
        line_excerpt: line.slice(0, 220),
        confidence: scope === 'unit' ? 0.72 : 0.5,
      });
      if (out.length >= maxMentions) return out;
    }
  }
  return out;
};

const parseWeightCellByUnit = (cell, unitHint) => {
  const text = asText(cell);
  if (!text) return null;
  const numMatch = text.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return null;
  const num = Number(numMatch[0]);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (unitHint === 'kg') return Math.round(num * 1000);
  if (unitHint === 'g') return Math.round(num);
  return toWeightGrams(text, { allowUnitless: true });
};

const parseVariantWeightTableFromReadableText = (value, options = {}) => {
  const maxScanLines = Number.isFinite(Number(options.maxScanLines))
    ? Math.max(30, Math.trunc(Number(options.maxScanLines)))
    : 220;
  const maxRows = Number.isFinite(Number(options.maxRows))
    ? Math.max(20, Math.trunc(Number(options.maxRows)))
    : 120;
  const lines = asText(value)
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return { has_table: false, headers: [], rows: [], row_count: 0, unique_weights_grams: [], weight_by_name: new Map() };
  }

  const headerNameRe = /(颜色|规格|型号|款式|选项|名称|name|variant|spec)/i;
  let best = { headers: [], rows: [], weight_idx: -1, name_idx: 0 };

  for (let i = 0; i < lines.length; i += 1) {
    const headerLine = lines[i];
    if (!headerLine || !headerLine.includes('\t')) continue;
    if (!/(重量|weight)/i.test(headerLine)) continue;

    const headers = headerLine.split('\t').map((cell) => cell.trim());
    const weightIdx = headers.findIndex((cell) => /(重量|weight)/i.test(cell));
    if (weightIdx < 0) continue;
    const nameIdx = Math.max(0, headers.findIndex((cell) => headerNameRe.test(cell)));
    const unitMatch = headerLine.match(/(?:重量|weight)\s*[（(]?\s*(kg|g)\s*[)）]?/i);
    const unitHint = unitMatch && unitMatch[1] ? String(unitMatch[1]).toLowerCase() : '';

    const rows = [];
    for (let j = i + 1; j < Math.min(lines.length, i + maxScanLines); j += 1) {
      const rowLine = lines[j];
      if (!rowLine) break;
      if (/^(登录查看全部|展开全部|内容声明)/i.test(rowLine)) break;
      if (/^【/.test(rowLine) && rows.length) break;
      if (!rowLine.includes('\t')) {
        if (rows.length && /^(参数|详情|商品|颜色|规格|型号)/i.test(rowLine)) break;
        if (rows.length) continue;
        continue;
      }
      const cells = rowLine.split('\t').map((cell) => cell.trim());
      if (cells.length <= weightIdx) continue;
      const grams = parseWeightCellByUnit(cells[weightIdx], unitHint);
      if (!grams || !Number.isFinite(grams) || grams <= 0) continue;
      const name = asText(cells[nameIdx] || cells[0]);
      if (!name) continue;
      rows.push({
        name,
        weight_grams: Math.round(grams),
        cells: cells.slice(0, 10),
      });
      if (rows.length >= maxRows) break;
    }
    if (rows.length > best.rows.length) {
      best = {
        headers: headers.filter(Boolean).slice(0, 20),
        rows,
        weight_idx: weightIdx,
        name_idx: nameIdx,
      };
    }
  }

  const weightByName = new Map();
  for (const row of best.rows) {
    const strict = normalizeNameStrict(row.name);
    const loose = normalizeNameLoose(row.name);
    if (strict && !weightByName.has(strict)) weightByName.set(strict, row.weight_grams);
    if (loose && !weightByName.has(loose)) weightByName.set(loose, row.weight_grams);
  }
  const uniqueWeights = Array.from(new Set(best.rows.map((row) => row.weight_grams))).sort((a, b) => a - b);
  return {
    has_table: best.rows.length >= 3,
    headers: best.headers,
    rows: best.rows,
    row_count: best.rows.length,
    unique_weights_grams: uniqueWeights,
    weight_by_name: weightByName,
  };
};

const buildVariantLabel = (combo) => {
  const t1 = asText(combo?.t1_zh || combo?.t1 || combo?.name);
  const t2 = asText(combo?.t2_zh || combo?.t2);
  const t3 = asText(combo?.t3_zh || combo?.t3);
  return [t1, t2, t3].filter(Boolean).join(' / ');
};

const findTableWeightForLabel = (label, weightByName) => {
  const keys = Array.from(
    new Set([
      normalizeNameStrict(label),
      normalizeNameLoose(label),
    ].filter(Boolean))
  );
  for (const key of keys) {
    const v = Number(weightByName.get(key));
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
};

const enrichVariationsFromTable = (variations, parsedTable) => {
  if (!variations || typeof variations !== 'object') {
    return {
      variations_enriched: null,
      autofill_count: 0,
    };
  }
  const combos = Array.isArray(variations.combos) ? variations.combos : [];
  if (!combos.length || !(parsedTable?.weight_by_name instanceof Map) || !parsedTable.weight_by_name.size) {
    return {
      variations_enriched: variations,
      autofill_count: 0,
    };
  }

  let autofillCount = 0;
  const nextCombos = combos.map((combo) => {
    const row = combo && typeof combo === 'object' ? { ...combo } : {};
    const existing =
      (Number.isFinite(Number(row.weight_grams)) && Number(row.weight_grams) > 0
        ? Math.round(Number(row.weight_grams))
        : null) ||
      toWeightGrams(row.weightRaw, { allowUnitless: true }) ||
      toWeightGrams(row.weight_raw, { allowUnitless: true }) ||
      toWeightGrams(row.weight, { allowUnitless: true }) ||
      null;
    if (existing) {
      if (!Number.isFinite(Number(row.weight_grams))) row.weight_grams = existing;
      if (!asText(row.weightRaw)) row.weightRaw = `${existing}g`;
      if (!asText(row.weight_raw)) row.weight_raw = `${existing}g`;
      return row;
    }

    const label = buildVariantLabel(row);
    const tableWeight = findTableWeightForLabel(label, parsedTable.weight_by_name);
    if (!tableWeight) return row;
    row.weight_grams = tableWeight;
    row.weightRaw = `${tableWeight}g`;
    row.weight_raw = `${tableWeight}g`;
    autofillCount += 1;
    return row;
  });

  return {
    variations_enriched: {
      ...variations,
      combos: nextCombos,
    },
    autofill_count: autofillCount,
  };
};

const collectVariantRows = (variations) => {
  const combos = variations && typeof variations === 'object' && Array.isArray(variations.combos) ? variations.combos : [];
  return combos.map((combo, index) => {
    const row = combo && typeof combo === 'object' ? combo : {};
    const weightGrams =
      (Number.isFinite(Number(row.weight_grams)) && Number(row.weight_grams) > 0
        ? Math.round(Number(row.weight_grams))
        : null) ||
      toWeightGrams(row.weightRaw, { allowUnitless: true }) ||
      toWeightGrams(row.weight_raw, { allowUnitless: true }) ||
      toWeightGrams(row.weight, { allowUnitless: true }) ||
      null;
    return {
      index,
      label: buildVariantLabel(row),
      label_zh: asText(row.t1_zh || row.t1),
      label_en: asText(row.t1_en),
      weight_grams: typeof weightGrams === 'number' && Number.isFinite(weightGrams) && weightGrams > 0
        ? Math.round(weightGrams)
        : null,
      weight_raw: asText(row.weightRaw || row.weight_raw || row.weight),
      price: Number.isFinite(Number(row.price)) ? Number(row.price) : null,
    };
  });
};

const buildStructuredVariantSignal = (variantRows, parsedTable) => {
  const rows = Array.isArray(variantRows) ? variantRows : [];
  const comboCount = rows.length;
  const map = parsedTable && parsedTable.weight_by_name instanceof Map ? parsedTable.weight_by_name : new Map();
  let comboLookupCount = 0;
  let comboComparableCount = 0;
  let comboMatchCount = 0;
  let comboMismatchCount = 0;
  const mismatchExamples = [];

  for (const row of rows) {
    const keys = Array.from(
      new Set([
        normalizeNameStrict(row.label),
        normalizeNameLoose(row.label),
        normalizeNameStrict(row.label_zh),
        normalizeNameLoose(row.label_zh),
        normalizeNameStrict(row.label_en),
        normalizeNameLoose(row.label_en),
      ].filter(Boolean))
    );
    if (!keys.length) continue;
    let tableWeight = null;
    for (const key of keys) {
      const v = Number(map.get(key));
      if (Number.isFinite(v) && v > 0) {
        tableWeight = Math.round(v);
        break;
      }
    }
    if (!tableWeight) continue;
    comboLookupCount += 1;
    if (!row.weight_grams || !Number.isFinite(row.weight_grams)) continue;

    comboComparableCount += 1;
    if (Math.abs(Math.round(row.weight_grams) - tableWeight) <= 2) {
      comboMatchCount += 1;
    } else {
      comboMismatchCount += 1;
      if (mismatchExamples.length < 6) {
        mismatchExamples.push({
          label: asText(row.label).slice(0, 120),
          row_weight_grams: Math.round(row.weight_grams),
          table_weight_grams: tableWeight,
        });
      }
    }
  }

  const coverageRatio = comboCount > 0 ? comboLookupCount / comboCount : 0;
  const matchRatio = comboComparableCount > 0 ? comboMatchCount / comboComparableCount : 0;
  const strongTablePass = Boolean(
    comboCount >= 5 &&
      parsedTable?.has_table &&
      coverageRatio >= 0.65 &&
      comboComparableCount >= Math.max(3, Math.floor(comboCount * 0.6)) &&
      matchRatio >= 0.85 &&
      parsedTable.unique_weights_grams.length >= 2 &&
      comboMismatchCount <= Math.max(1, Math.round(comboComparableCount * 0.1))
  );

  return {
    combo_count: comboCount,
    combo_lookup_count: comboLookupCount,
    combo_comparable_count: comboComparableCount,
    combo_match_count: comboMatchCount,
    combo_mismatch_count: comboMismatchCount,
    coverage_ratio: Number(coverageRatio.toFixed(4)),
    match_ratio: Number(matchRatio.toFixed(4)),
    strong_table_pass: strongTablePass,
    mismatch_examples: mismatchExamples,
  };
};

const normalizePackSignature = (value) => {
  const text = asText(value);
  if (!text) return '';
  const numbers = Array.from(text.matchAll(/\d+(?:[.,]\d+)?/g))
    .map((entry) => Number(entry[0]))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 500)
    .map((entry) => Math.round(entry));
  if (!numbers.length) return '';
  return Array.from(new Set(numbers)).sort((a, b) => a - b).join('+');
};

const buildWeightCandidates = ({ productWeights, textMentions, parsedTable, variantRows }) => {
  const out = [];
  const seen = new Set();

  const push = (entry) => {
    const grams = Number(entry?.grams);
    if (!Number.isFinite(grams) || grams <= 0) return;
    const raw = asText(entry?.raw || `${Math.round(grams)}g`);
    const scope = asText(entry?.scope) || 'unknown';
    const source = asText(entry?.source) || 'unknown';
    const key = `${scope}:${Math.round(grams)}:${source}:${raw.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      raw,
      grams: Math.round(grams),
      scope,
      source,
      line_excerpt: asText(entry?.line_excerpt).slice(0, 220),
      confidence:
        typeof entry?.confidence === 'number' && Number.isFinite(entry.confidence)
          ? Math.max(0, Math.min(1, Number(entry.confidence)))
          : 0.5,
    });
  };

  for (const entry of Array.isArray(textMentions) ? textMentions : []) push(entry);
  for (const raw of Array.isArray(productWeights) ? productWeights : []) {
    const grams = toWeightGrams(raw, { allowUnitless: true });
    if (!grams) continue;
    push({
      raw,
      grams,
      scope: inferWeightScope(raw, raw),
      source: 'product_weight_list',
      confidence: 0.68,
    });
  }
  for (const row of parsedTable?.rows || []) {
    push({
      raw: `${row.weight_grams}g`,
      grams: row.weight_grams,
      scope: 'unit',
      source: 'variant_table_row',
      confidence: 0.92,
      line_excerpt: row.name,
    });
  }
  for (const row of Array.isArray(variantRows) ? variantRows : []) {
    const grams = Number(row?.weight_grams);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    push({
      raw: asText(row.weight_raw || `${grams}g`) || `${grams}g`,
      grams,
      scope: 'unit',
      source: 'variant_combo_weight',
      confidence: 0.8,
      line_excerpt: asText(row.label).slice(0, 180),
    });
  }

  out.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.grams - b.grams;
  });
  return out;
};

const buildQualityBlock = (variantRows, structuredSignal, weightsBlock) => {
  const rows = Array.isArray(variantRows) ? variantRows : [];
  const comboWeights = rows
    .map((row) => (Number.isFinite(Number(row.weight_grams)) ? Math.round(Number(row.weight_grams)) : null))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  const uniqueComboWeights = Array.from(new Set(comboWeights)).sort((a, b) => a - b);
  const packSignatures = Array.from(
    new Set(
      rows
        .map((row) => normalizePackSignature(row.label))
        .filter(Boolean)
    )
  );

  const flags = [];
  let variantWeightSignal = 'unknown';
  if (structuredSignal.strong_table_pass) {
    variantWeightSignal = 'strong_table';
    flags.push('structured_variant_weight_table_matched');
  } else if (rows.length >= 3 && comboWeights.length >= 3 && uniqueComboWeights.length === 1) {
    variantWeightSignal = 'flat_variant_weights';
    flags.push('flat_variant_weights');
    if (packSignatures.length >= 2) flags.push('pack_signatures_differ_but_weight_flat');
  } else if (comboWeights.length >= 2 && uniqueComboWeights.length >= 2) {
    variantWeightSignal = 'multi_weight_variants';
  } else if (comboWeights.length >= 1) {
    variantWeightSignal = 'single_weight_signal';
  } else {
    variantWeightSignal = 'missing_variant_weights';
    flags.push('missing_variant_weight_values');
  }

  if ((weightsBlock.unit_candidates_grams || []).length === 0) {
    flags.push('missing_unit_weight_candidates');
  }

  const needsManualWeightReview = Boolean(
    variantWeightSignal === 'flat_variant_weights' ||
      variantWeightSignal === 'missing_variant_weights' ||
      (weightsBlock.unit_candidates_grams || []).length === 0
  );

  const weightConfidenceScore = structuredSignal.strong_table_pass
    ? 0.95
    : variantWeightSignal === 'multi_weight_variants'
      ? 0.78
      : variantWeightSignal === 'single_weight_signal'
        ? 0.63
        : variantWeightSignal === 'flat_variant_weights'
          ? 0.38
          : 0.28;

  return {
    variant_weight_signal: variantWeightSignal,
    needs_manual_weight_review: needsManualWeightReview,
    weight_confidence_score: Number(weightConfidenceScore.toFixed(4)),
    flags,
  };
};

export function build1688Enhancements(input = {}) {
  const readableText = asText(input.readableText);
  const productWeights = Array.isArray(input.productWeights) ? input.productWeights : [];
  const variations = input.variations && typeof input.variations === 'object' ? input.variations : null;
  const source = asText(input.source) || 'chrome_extension';
  const parserVersion = asText(input.parserVersion) || PARSER_VERSION;

  const textMentions = extractTextWeightMentions(readableText, { maxMentions: 80 });
  const parsedTable = parseVariantWeightTableFromReadableText(readableText, {
    maxScanLines: 260,
    maxRows: 140,
  });
  const enrichedVariationRes = enrichVariationsFromTable(variations, parsedTable);
  const enrichedVariations = enrichedVariationRes.variations_enriched || variations;
  const variantRows = collectVariantRows(enrichedVariations);
  const structuredSignal = buildStructuredVariantSignal(variantRows, parsedTable);
  const weightCandidates = buildWeightCandidates({
    productWeights,
    textMentions,
    parsedTable,
    variantRows,
  });

  const unitCandidates = Array.from(
    new Set(
      weightCandidates
        .filter((row) => row.scope === 'unit' || row.scope === 'unknown')
        .map((row) => Math.round(row.grams))
        .filter((grams) => Number.isFinite(grams) && grams > 0)
    )
  ).sort((a, b) => a - b);
  const packagingCandidates = Array.from(
    new Set(
      weightCandidates
        .filter((row) => row.scope === 'packaging')
        .map((row) => Math.round(row.grams))
        .filter((grams) => Number.isFinite(grams) && grams > 0)
    )
  ).sort((a, b) => a - b);
  const capacityCandidates = Array.from(
    new Set(
      weightCandidates
        .filter((row) => row.scope === 'capacity')
        .map((row) => Math.round(row.grams))
        .filter((grams) => Number.isFinite(grams) && grams > 0)
    )
  ).sort((a, b) => a - b);

  const selectedUnitWeight =
    structuredSignal.strong_table_pass && parsedTable.unique_weights_grams.length === 1
      ? parsedTable.unique_weights_grams[0]
      : unitCandidates.length === 1
        ? unitCandidates[0]
        : null;
  const selectedUnitWeightRule =
    structuredSignal.strong_table_pass && parsedTable.unique_weights_grams.length === 1
      ? 'structured_table_single_weight'
      : unitCandidates.length === 1
        ? 'single_unit_candidate'
        : 'none';

  const textLines = readableText
    ? readableText.replace(/\r/g, '\n').split(/\n+/).map((line) => line.trim()).filter(Boolean)
    : [];
  const variantTableBlock = {
    has_structured_table: Boolean(parsedTable.has_table),
    strong_table_pass: structuredSignal.strong_table_pass,
    headers: parsedTable.headers || [],
    row_count: parsedTable.row_count || 0,
    rows: (parsedTable.rows || []).map((row) => ({
      name: row.name,
      weight_grams: row.weight_grams,
      cells: Array.isArray(row.cells) ? row.cells.slice(0, 10) : [],
    })),
    unique_weights_grams: parsedTable.unique_weights_grams || [],
    combo_count: structuredSignal.combo_count,
    combo_lookup_count: structuredSignal.combo_lookup_count,
    combo_comparable_count: structuredSignal.combo_comparable_count,
    combo_match_count: structuredSignal.combo_match_count,
    combo_mismatch_count: structuredSignal.combo_mismatch_count,
    coverage_ratio: structuredSignal.coverage_ratio,
    match_ratio: structuredSignal.match_ratio,
    mismatch_examples: structuredSignal.mismatch_examples || [],
    autofill_applied_count: enrichedVariationRes.autofill_count || 0,
  };

  const weightsBlock = {
    candidates: weightCandidates,
    unit_candidates_grams: unitCandidates,
    packaging_candidates_grams: packagingCandidates,
    capacity_candidates_grams: capacityCandidates,
    selected_unit_weight_grams: selectedUnitWeight,
    selected_unit_weight_rule: selectedUnitWeightRule,
  };

  const qualityBlock = buildQualityBlock(variantRows, structuredSignal, weightsBlock);
  const weightFocusedText = collectWeightFocusedText(readableText, {
    maxChars: 4200,
    maxLines: 180,
  });

  return {
    schema_version: 2,
    extraction_meta_1688: {
      generated_at: new Date().toISOString(),
      source,
      parser_version: parserVersion,
      readable_text_chars: readableText.length,
      readable_text_lines: textLines.length,
      product_weight_count: productWeights.length,
      variant_combo_count: variantRows.length,
      variant_combos_with_weight: variantRows.filter((row) => Number.isFinite(row.weight_grams)).length,
      variant_weight_autofill_count: enrichedVariationRes.autofill_count || 0,
      text_weight_token_count: textMentions.length,
    },
    text_1688: {
      readable_full: readableText,
      readable_compact: textLines.slice(0, 900).join('\n').slice(0, 140000),
      weight_focused_excerpt: weightFocusedText,
      stats: {
        line_count: textLines.length,
        char_count: readableText.length,
        weight_keyword_lines: weightFocusedText ? weightFocusedText.split('\n').filter(Boolean).length : 0,
      },
    },
    weights_1688: weightsBlock,
    variant_table_1688: variantTableBlock,
    quality_1688: qualityBlock,
    variations_enriched_1688: enrichedVariations || null,
  };
}
