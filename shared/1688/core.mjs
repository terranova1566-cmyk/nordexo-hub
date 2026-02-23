export const asText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

export const toOfferId = (offer) => {
  const raw = offer?.offerId;
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  return text || null;
};

export const canonical1688OfferUrlText = (value) => {
  const raw = asText(value);
  if (!raw) return "";

  const idMatch = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (idMatch?.[1]) {
    return `https://detail.1688.com/offer/${idMatch[1]}.html`;
  }

  if (/1688\.com/i.test(raw) && /\.html(?:[?#].*)$/i.test(raw)) {
    return raw.replace(/(\.html)(?:[?#].*)+$/i, "$1");
  }

  return raw;
};

export const canonical1688OfferUrl = (offer) => {
  const id = toOfferId(offer);
  if (id && /^\d{6,}$/.test(id)) {
    return `https://detail.1688.com/offer/${id}.html`;
  }
  const raw = asText(
    offer?.detailUrl ||
      offer?.detail_url ||
      offer?.url_1688 ||
      offer?.url ||
      offer?.link
  );
  if (!raw) return null;
  const canonical = canonical1688OfferUrlText(raw);
  return canonical || null;
};

export const extractJsonFromText = (text) => {
  const raw = String(text || "").trim();
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

export const isImageFetchError = (error) => {
  const msg = String(error || "").toLowerCase();
  return (
    msg.includes("handle image error") ||
    msg.includes("image_fetch_error") ||
    msg.includes("image fetch error") ||
    msg.includes("invalid image url")
  );
};

export const hasCjk = (value) => /[\u3400-\u9fff]/.test(String(value || ""));

export const toWeightGrams = (value, options = {}) => {
  const { allowUnitless = false } = options || {};
  const raw = asText(value);
  if (!raw) return null;

  const normalized = raw.replace(/,/g, ".").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null;

  const unit = normalized.toLowerCase();
  if (unit.includes("kg") || unit.includes("公斤") || unit.includes("千克")) {
    return Math.round(num * 1000);
  }
  if (unit.includes("g") || unit.includes("克")) {
    return Math.round(num);
  }
  if (unit.includes("斤")) {
    return null;
  }
  if (allowUnitless && num <= 20 && normalized.includes(".")) {
    return Math.round(num * 1000);
  }
  if (allowUnitless) {
    return Math.round(num);
  }
  return null;
};

export const normalizeNameStrict = (value) =>
  asText(value)
    .toLowerCase()
    .replace(/\s+/g, "");

export const normalizeNameLoose = (value) =>
  normalizeNameStrict(value).replace(/[（(].*?[）)]/g, "");

export const parseVariantWeightTableFromReadableText = (value, options = {}) => {
  const maxScanLines = Number.isFinite(Number(options.maxScanLines))
    ? Math.max(1, Math.trunc(Number(options.maxScanLines)))
    : 45;
  const text = asText(value).replace(/\r/g, "\n");
  const out = { weightByName: new Map(), weights: [] };
  if (!text) return out;

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return out;

  const toGramsFromHeaderUnit = (rawCell, unit) => {
    const cell = asText(rawCell);
    if (!cell) return null;
    const match = cell.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (unit === "kg") return Math.round(num * 1000);
    return Math.round(num);
  };

  for (let headerIndex = 0; headerIndex < lines.length; headerIndex += 1) {
    const headerLine = lines[headerIndex];
    if (!headerLine) continue;
    if (!/(重量|weight)/i.test(headerLine)) continue;
    const unitMatch = headerLine.match(/(?:重量|weight)\s*[（(]?\s*(kg|g)\s*[)）]?/i);
    if (!unitMatch?.[1]) continue;
    const unit = String(unitMatch[1] || "").toLowerCase();

    const hasTabs = headerLine.includes("\t");
    const headerCells = hasTabs
      ? headerLine.split("\t").map((part) => part.trim()).filter(Boolean)
      : headerLine.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    const weightIdx = Math.max(
      0,
      headerCells.findIndex((cell) => /(重量|weight)/i.test(cell))
    );

    let started = false;
    for (
      let i = headerIndex + 1;
      i < Math.min(lines.length, headerIndex + maxScanLines);
      i += 1
    ) {
      const line = lines[i];
      if (!line) break;
      if (/^【/.test(line)) break;
      if (/登录查看全部|展开全部|内容声明/i.test(line)) break;

      if (hasTabs && !line.includes("\t")) {
        if (started) break;
        continue;
      }
      if (
        !hasTabs &&
        !/^-?\d+(?:[.,]\d+)?(?:\s*(?:kg|g|公斤|千克|克))?$/i.test(line)
      ) {
        if (started) break;
        continue;
      }

      const parts = hasTabs
        ? line.split(/\t+/).map((part) => part.trim())
        : line.split(/\s+/).map((part) => part.trim());
      if (parts.length <= weightIdx) continue;

      const grams = toGramsFromHeaderUnit(parts[weightIdx], unit);
      if (!grams) continue;

      started = true;
      out.weights.push(grams);
      const name = hasTabs ? asText(parts[0]) : "";
      const strictName = normalizeNameStrict(name);
      const looseName = normalizeNameLoose(name);
      if (strictName && !out.weightByName.has(strictName)) out.weightByName.set(strictName, grams);
      if (looseName && !out.weightByName.has(looseName)) out.weightByName.set(looseName, grams);
    }
  }

  return out;
};

export const pickFallbackWeightGrams = (candidates, options = {}) => {
  const allowUnitless = Boolean(options.allowUnitless);
  const minPlausible = Number.isFinite(Number(options.minPlausible))
    ? Number(options.minPlausible)
    : 20;
  const maxPlausible = Number.isFinite(Number(options.maxPlausible))
    ? Number(options.maxPlausible)
    : 200_000;

  const values = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => toWeightGrams(candidate, { allowUnitless }))
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0);
  if (values.length === 0) return null;

  const plausible = values.filter((entry) => entry >= minPlausible && entry <= maxPlausible);
  if (plausible.length === 0) return null;

  const sorted = [...plausible].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (
    sorted.length >= 3 &&
    min > 0 &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    max / min >= 8
  ) {
    return sorted[Math.floor(sorted.length / 2)];
  }
  return max;
};
