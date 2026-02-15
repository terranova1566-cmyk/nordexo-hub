const parseNumber = (raw: string): number | null => {
  const cleaned = String(raw || "")
    .replace(/[^\d.,-]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    normalized = cleaned.replace(/,/g, ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatCm = (cm: number) => cm.toFixed(1);

const formatWeight = (grams: number) => {
  const g = Math.round(grams);
  if (!Number.isFinite(g)) return "";
  if (g >= 1000) {
    const kg = g / 1000;
    return `${kg.toFixed(1)} kg`;
  }
  return `${g} g`;
};

const formatVolume = (ml: number) => {
  const mL = Math.round(ml);
  if (!Number.isFinite(mL)) return "";
  if (mL >= 1000) {
    const l = mL / 1000;
    return `${l.toFixed(1)} L`;
  }
  return `${mL} mL`;
};

const convertDimSequenceToCm = (match: string, factor: number) => {
  const nums = match.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  if (nums.length < 2) return match;
  const converted = nums
    .map((n) => parseNumber(n))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => formatCm(v * factor));
  if (converted.length < 2) return match;
  return `${converted.join(" x ")} cm`;
};

const replaceSingleLength = (input: string, re: RegExp, factorToCm: number) =>
  input.replace(re, (full, nRaw: string) => {
    const n = parseNumber(nRaw);
    if (n === null) return full;
    return `${formatCm(n * factorToCm)} cm`;
  });

const replaceSingleWeight = (input: string, re: RegExp, gramsPerUnit: number) =>
  input.replace(re, (full, nRaw: string) => {
    const n = parseNumber(nRaw);
    if (n === null) return full;
    const out = formatWeight(n * gramsPerUnit);
    return out ? out : full;
  });

const replaceSingleVolume = (input: string, re: RegExp, mlPerUnit: number) =>
  input.replace(re, (full, nRaw: string) => {
    const n = parseNumber(nRaw);
    if (n === null) return full;
    const out = formatVolume(n * mlPerUnit);
    return out ? out : full;
  });

// Best-effort text normalization: only replaces patterns that contain explicit units.
export function normalizeMeasurementsToMetric(text: string) {
  let out = String(text || "");
  if (!out) return out;

  // Dimensions: handle "A x B x C inches" where the unit appears once at the end.
  out = out.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)*\s*(?:inches|inch|in\.|")\b/gi,
    (m) => convertDimSequenceToCm(m, 2.54)
  );
  out = out.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)*\s*(?:feet|foot|ft)\b/gi,
    (m) => convertDimSequenceToCm(m, 30.48)
  );
  out = out.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)*\s*(?:millimeters|millimeter|mm)\b/gi,
    (m) => convertDimSequenceToCm(m, 0.1)
  );
  out = out.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)*\s*(?:centimeters|centimeter|cm)\b/gi,
    (m) => convertDimSequenceToCm(m, 1)
  );
  out = out.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)*\s*(?:meters|meter|m)\b/gi,
    (m) => convertDimSequenceToCm(m, 100)
  );

  // Single lengths to centimeters (1 decimal). Avoid bare "in" to prevent false positives.
  out = replaceSingleLength(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:inches|inch|in\.|")\b/gi, 2.54);
  out = replaceSingleLength(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:feet|foot|ft)\b/gi, 30.48);
  out = replaceSingleLength(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:millimeters|millimeter|mm)\b/gi, 0.1);
  out = replaceSingleLength(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:meters|meter|m)\b/gi, 100);

  // Normalize centimeters to always have 1 decimal.
  out = out.replace(
    /(\d+(?:[.,]\d+)?)\s*-?\s*(?:centimeters|centimeter|cm)\b/gi,
    (full, nRaw: string) => {
      const n = parseNumber(nRaw);
      if (n === null) return full;
      return `${formatCm(n)} cm`;
    }
  );

  // Volume: fluid ounces first (otherwise "oz" would match).
  out = replaceSingleVolume(
    out,
    /(\d+(?:[.,]\d+)?)\s*-?\s*(?:fluid\s*ounces?|fl\s*oz)\b/gi,
    29.5735295625
  );
  // Normalize metric volumes.
  out = out.replace(
    /(\d+(?:[.,]\d+)?)\s*-?\s*(?:milliliters|milliliter|ml)\b/gi,
    (full, nRaw: string) => {
      const n = parseNumber(nRaw);
      if (n === null) return full;
      return formatVolume(n);
    }
  );
  out = out.replace(
    /(\d+(?:[.,]\d+)?)\s*-?\s*(?:liters|liter|l)\b/gi,
    (full, nRaw: string) => {
      const n = parseNumber(nRaw);
      if (n === null) return full;
      return formatVolume(n * 1000);
    }
  );

  // Weight.
  out = replaceSingleWeight(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:ounces|ounce|oz)\b/gi, 28.349523125);
  out = replaceSingleWeight(out, /(\d+(?:[.,]\d+)?)\s*-?\s*(?:pounds|pound|lbs|lb)\b/gi, 453.59237);

  return out;
}

export function normalizeMeasurementRecordToMetric(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, normalizeMeasurementsToMetric(v)])
  );
}

