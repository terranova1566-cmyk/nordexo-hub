import type { CampaignFingerprint, CampaignFingerprintSegment } from "@/lib/campaign-search/types";

const MAX_SEGMENTS = 6;
const MAX_LABEL_LENGTH = 120;
const MAX_NOTES_LENGTH = 320;
const MAX_SUMMARY_LENGTH = 400;
const MAX_TERM_LENGTH = 80;
const MAX_QUERY_LENGTH = 120;
const MAX_TUNING_REASON_LENGTH = 240;
const MAX_TUNING_NOTES = 12;

const SEGMENT_TERM_LIMITS = {
  taxonomyHints: 8,
  coreTermsSv: 10,
  synonymsSv: 12,
  joinedVariants: 8,
  splitVariants: 8,
  mustHave: 8,
  niceToHave: 10,
  negativeTerms: 10,
  brandTerms: 8,
  strictQueries: 8,
  balancedQueries: 8,
  broadQueries: 10,
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown, field: string, maxLength: number) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Campaign fingerprint field "${field}" must be a non-empty string.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`Campaign fingerprint field "${field}" exceeds ${maxLength} characters.`);
  }
  return normalized;
};

const readOptionalString = (value: unknown, maxLength: number) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
};

const readStringArray = (
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number
) => {
  if (!Array.isArray(value)) {
    throw new Error(`Campaign fingerprint field "${field}" must be an array.`);
  }

  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((entry) => {
    const text = String(entry ?? "").trim();
    if (!text) return;
    if (text.length > maxLength) {
      throw new Error(`Campaign fingerprint term "${field}" exceeds ${maxLength} characters.`);
    }
    if (seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });

  return output.slice(0, maxItems);
};

const readConfidence = (value: unknown, field: string) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`Campaign fingerprint field "${field}" must be a number between 0 and 1.`);
  }
  return numeric;
};

const readSourceLanguage = (value: unknown): CampaignFingerprint["sourceLanguage"] => {
  const normalized = String(value ?? "").trim();
  if (normalized === "sv" || normalized === "en" || normalized === "mixed" || normalized === "unknown") {
    return normalized;
  }
  throw new Error('Campaign fingerprint field "sourceLanguage" is invalid.');
};

const readTaxonomyMode = (
  value: unknown
): CampaignFingerprintSegment["taxonomyMode"] => {
  const normalized = String(value ?? "").trim();
  if (normalized === "boost" || normalized === "prefer" || normalized === "require") {
    return normalized;
  }
  throw new Error('Campaign fingerprint field "taxonomyMode" is invalid.');
};

const readConfidenceLabel = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (normalized === "high" || normalized === "medium" || normalized === "speculative") {
    return normalized;
  }
  throw new Error('Tuning analyst field "confidence" is invalid.');
};

const readDirection = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (normalized === "increase" || normalized === "decrease" || normalized === "test") {
    return normalized;
  }
  throw new Error('Tuning analyst field "direction" is invalid.');
};

const readSegment = (value: unknown): CampaignFingerprintSegment => {
  if (!isPlainObject(value)) {
    throw new Error("Campaign fingerprint segments must be objects.");
  }

  const segment: CampaignFingerprintSegment = {
    key: readString(value.key, "segments[].key", 40),
    label: readString(value.label, "segments[].label", MAX_LABEL_LENGTH),
    confidence: readConfidence(value.confidence, "segments[].confidence"),
    taxonomyHints: readStringArray(
      value.taxonomyHints,
      "segments[].taxonomyHints",
      SEGMENT_TERM_LIMITS.taxonomyHints,
      MAX_TERM_LENGTH
    ),
    taxonomyMode: readTaxonomyMode(value.taxonomyMode),
    coreTermsSv: readStringArray(
      value.coreTermsSv,
      "segments[].coreTermsSv",
      SEGMENT_TERM_LIMITS.coreTermsSv,
      MAX_TERM_LENGTH
    ),
    synonymsSv: readStringArray(
      value.synonymsSv,
      "segments[].synonymsSv",
      SEGMENT_TERM_LIMITS.synonymsSv,
      MAX_TERM_LENGTH
    ),
    joinedVariants: readStringArray(
      value.joinedVariants,
      "segments[].joinedVariants",
      SEGMENT_TERM_LIMITS.joinedVariants,
      MAX_TERM_LENGTH
    ),
    splitVariants: readStringArray(
      value.splitVariants,
      "segments[].splitVariants",
      SEGMENT_TERM_LIMITS.splitVariants,
      MAX_TERM_LENGTH
    ),
    mustHave: readStringArray(
      value.mustHave,
      "segments[].mustHave",
      SEGMENT_TERM_LIMITS.mustHave,
      MAX_TERM_LENGTH
    ),
    niceToHave: readStringArray(
      value.niceToHave,
      "segments[].niceToHave",
      SEGMENT_TERM_LIMITS.niceToHave,
      MAX_TERM_LENGTH
    ),
    negativeTerms: readStringArray(
      value.negativeTerms,
      "segments[].negativeTerms",
      SEGMENT_TERM_LIMITS.negativeTerms,
      MAX_TERM_LENGTH
    ),
    brandTerms: readStringArray(
      value.brandTerms,
      "segments[].brandTerms",
      SEGMENT_TERM_LIMITS.brandTerms,
      MAX_TERM_LENGTH
    ),
    strictQueries: readStringArray(
      value.strictQueries,
      "segments[].strictQueries",
      SEGMENT_TERM_LIMITS.strictQueries,
      MAX_QUERY_LENGTH
    ),
    balancedQueries: readStringArray(
      value.balancedQueries,
      "segments[].balancedQueries",
      SEGMENT_TERM_LIMITS.balancedQueries,
      MAX_QUERY_LENGTH
    ),
    broadQueries: readStringArray(
      value.broadQueries,
      "segments[].broadQueries",
      SEGMENT_TERM_LIMITS.broadQueries,
      MAX_QUERY_LENGTH
    ),
    notes: readOptionalString(value.notes, MAX_NOTES_LENGTH),
  };

  if (segment.coreTermsSv.length === 0 && segment.strictQueries.length === 0) {
    throw new Error(`Campaign fingerprint segment "${segment.key}" is empty.`);
  }

  return segment;
};

export const CAMPAIGN_FINGERPRINT_JSON_SCHEMA = {
  name: "campaign_fingerprint",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sourceLanguage", "campaignSummarySv", "globalNegativeTerms", "segments"],
    properties: {
      sourceLanguage: {
        type: "string",
        enum: ["sv", "en", "mixed", "unknown"],
      },
      campaignSummarySv: {
        type: "string",
        minLength: 1,
        maxLength: MAX_SUMMARY_LENGTH,
      },
      globalNegativeTerms: {
        type: "array",
        maxItems: 12,
        items: { type: "string", maxLength: MAX_TERM_LENGTH },
      },
      segments: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SEGMENTS,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "key",
            "label",
            "confidence",
            "taxonomyHints",
            "taxonomyMode",
            "coreTermsSv",
            "synonymsSv",
            "joinedVariants",
            "splitVariants",
            "mustHave",
            "niceToHave",
            "negativeTerms",
            "brandTerms",
            "strictQueries",
            "balancedQueries",
            "broadQueries",
            "notes",
          ],
          properties: {
            key: { type: "string", minLength: 1, maxLength: 40 },
            label: { type: "string", minLength: 1, maxLength: MAX_LABEL_LENGTH },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            taxonomyHints: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.taxonomyHints,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            taxonomyMode: {
              type: "string",
              enum: ["boost", "prefer", "require"],
            },
            coreTermsSv: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.coreTermsSv,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            synonymsSv: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.synonymsSv,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            joinedVariants: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.joinedVariants,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            splitVariants: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.splitVariants,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            mustHave: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.mustHave,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            niceToHave: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.niceToHave,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            negativeTerms: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.negativeTerms,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            brandTerms: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.brandTerms,
              items: { type: "string", maxLength: MAX_TERM_LENGTH },
            },
            strictQueries: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.strictQueries,
              items: { type: "string", maxLength: MAX_QUERY_LENGTH },
            },
            balancedQueries: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.balancedQueries,
              items: { type: "string", maxLength: MAX_QUERY_LENGTH },
            },
            broadQueries: {
              type: "array",
              maxItems: SEGMENT_TERM_LIMITS.broadQueries,
              items: { type: "string", maxLength: MAX_QUERY_LENGTH },
            },
            notes: { type: "string", maxLength: MAX_NOTES_LENGTH },
          },
        },
      },
    },
  },
} as const;

export type CampaignSearchTuningAnalystOutput = {
  synonymSuggestions: Array<{
    segmentKey: string;
    canonical: string;
    alias: string;
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  compoundSuggestions: Array<{
    segmentKey: string;
    joined: string;
    split: string;
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  taxonomySuggestions: Array<{
    segmentKey: string;
    taxonomyHint: string;
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  negativeTerms: Array<{
    segmentKey: string;
    term: string;
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  scoreAdjustments: Array<{
    component: string;
    direction: "increase" | "decrease" | "test";
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  segmentationAdvice: Array<{
    segmentKey: string;
    action: "keep" | "split" | "merge" | "retarget";
    reason: string;
    confidence: "high" | "medium" | "speculative";
  }>;
  notes: string[];
};

export const CAMPAIGN_SEARCH_TUNING_ANALYST_JSON_SCHEMA = {
  name: "campaign_search_tuning_analyst",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "synonymSuggestions",
      "compoundSuggestions",
      "taxonomySuggestions",
      "negativeTerms",
      "scoreAdjustments",
      "segmentationAdvice",
      "notes",
    ],
    properties: {
      synonymSuggestions: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["segmentKey", "canonical", "alias", "reason", "confidence"],
          properties: {
            segmentKey: { type: "string", maxLength: 40 },
            canonical: { type: "string", maxLength: MAX_TERM_LENGTH },
            alias: { type: "string", maxLength: MAX_TERM_LENGTH },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      compoundSuggestions: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["segmentKey", "joined", "split", "reason", "confidence"],
          properties: {
            segmentKey: { type: "string", maxLength: 40 },
            joined: { type: "string", maxLength: MAX_TERM_LENGTH },
            split: { type: "string", maxLength: MAX_TERM_LENGTH },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      taxonomySuggestions: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["segmentKey", "taxonomyHint", "reason", "confidence"],
          properties: {
            segmentKey: { type: "string", maxLength: 40 },
            taxonomyHint: { type: "string", maxLength: MAX_LABEL_LENGTH },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      negativeTerms: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["segmentKey", "term", "reason", "confidence"],
          properties: {
            segmentKey: { type: "string", maxLength: 40 },
            term: { type: "string", maxLength: MAX_TERM_LENGTH },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      scoreAdjustments: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["component", "direction", "reason", "confidence"],
          properties: {
            component: { type: "string", maxLength: 80 },
            direction: { type: "string", enum: ["increase", "decrease", "test"] },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      segmentationAdvice: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["segmentKey", "action", "reason", "confidence"],
          properties: {
            segmentKey: { type: "string", maxLength: 40 },
            action: { type: "string", enum: ["keep", "split", "merge", "retarget"] },
            reason: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
            confidence: { type: "string", enum: ["high", "medium", "speculative"] },
          },
        },
      },
      notes: {
        type: "array",
        maxItems: MAX_TUNING_NOTES,
        items: { type: "string", maxLength: MAX_TUNING_REASON_LENGTH },
      },
    },
  },
} as const;

export function parseCampaignFingerprint(input: unknown): CampaignFingerprint {
  if (!isPlainObject(input)) {
    throw new Error("Campaign fingerprint must be an object.");
  }

  const segmentsValue = input.segments;
  if (!Array.isArray(segmentsValue) || segmentsValue.length === 0) {
    throw new Error("Campaign fingerprint must contain at least one segment.");
  }

  if (segmentsValue.length > MAX_SEGMENTS) {
    throw new Error(`Campaign fingerprint cannot contain more than ${MAX_SEGMENTS} segments.`);
  }

  return {
    sourceLanguage: readSourceLanguage(input.sourceLanguage),
    campaignSummarySv: readString(input.campaignSummarySv, "campaignSummarySv", MAX_SUMMARY_LENGTH),
    globalNegativeTerms: readStringArray(
      input.globalNegativeTerms,
      "globalNegativeTerms",
      12,
      MAX_TERM_LENGTH
    ),
    segments: segmentsValue.map(readSegment),
  };
}

function readSuggestionArray<T>(
  value: unknown,
  field: string,
  mapper: (entry: Record<string, unknown>) => T
) {
  if (!Array.isArray(value)) {
    throw new Error(`Tuning analyst field "${field}" must be an array.`);
  }

  return value.map((entry) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Tuning analyst field "${field}" must contain objects.`);
    }
    return mapper(entry);
  });
}

export function parseCampaignSearchTuningAnalystOutput(
  input: unknown
): CampaignSearchTuningAnalystOutput {
  if (!isPlainObject(input)) {
    throw new Error("Tuning analyst output must be an object.");
  }

  return {
    synonymSuggestions: readSuggestionArray(input.synonymSuggestions, "synonymSuggestions", (entry) => ({
      segmentKey: readString(entry.segmentKey, "synonymSuggestions[].segmentKey", 40),
      canonical: readString(entry.canonical, "synonymSuggestions[].canonical", MAX_TERM_LENGTH),
      alias: readString(entry.alias, "synonymSuggestions[].alias", MAX_TERM_LENGTH),
      reason: readString(entry.reason, "synonymSuggestions[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    compoundSuggestions: readSuggestionArray(input.compoundSuggestions, "compoundSuggestions", (entry) => ({
      segmentKey: readString(entry.segmentKey, "compoundSuggestions[].segmentKey", 40),
      joined: readString(entry.joined, "compoundSuggestions[].joined", MAX_TERM_LENGTH),
      split: readString(entry.split, "compoundSuggestions[].split", MAX_TERM_LENGTH),
      reason: readString(entry.reason, "compoundSuggestions[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    taxonomySuggestions: readSuggestionArray(input.taxonomySuggestions, "taxonomySuggestions", (entry) => ({
      segmentKey: readString(entry.segmentKey, "taxonomySuggestions[].segmentKey", 40),
      taxonomyHint: readString(entry.taxonomyHint, "taxonomySuggestions[].taxonomyHint", MAX_LABEL_LENGTH),
      reason: readString(entry.reason, "taxonomySuggestions[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    negativeTerms: readSuggestionArray(input.negativeTerms, "negativeTerms", (entry) => ({
      segmentKey: readString(entry.segmentKey, "negativeTerms[].segmentKey", 40),
      term: readString(entry.term, "negativeTerms[].term", MAX_TERM_LENGTH),
      reason: readString(entry.reason, "negativeTerms[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    scoreAdjustments: readSuggestionArray(input.scoreAdjustments, "scoreAdjustments", (entry) => ({
      component: readString(entry.component, "scoreAdjustments[].component", 80),
      direction: readDirection(entry.direction),
      reason: readString(entry.reason, "scoreAdjustments[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    segmentationAdvice: readSuggestionArray(input.segmentationAdvice, "segmentationAdvice", (entry) => ({
      segmentKey: readString(entry.segmentKey, "segmentationAdvice[].segmentKey", 40),
      action: (() => {
        const normalized = String(entry.action ?? "").trim();
        if (normalized === "keep" || normalized === "split" || normalized === "merge" || normalized === "retarget") {
          return normalized;
        }
        throw new Error('Tuning analyst field "action" is invalid.');
      })(),
      reason: readString(entry.reason, "segmentationAdvice[].reason", MAX_TUNING_REASON_LENGTH),
      confidence: readConfidenceLabel(entry.confidence),
    })),
    notes: readStringArray(input.notes, "notes", MAX_TUNING_NOTES, MAX_TUNING_REASON_LENGTH),
  };
}
