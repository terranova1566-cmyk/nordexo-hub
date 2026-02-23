import * as weightReview from "./weight-review.mjs";

export type WeightReviewResult = {
  version: number;
  generated_at: string;
  mode: "multi_variant" | "single_product" | string;
  needs_review: boolean;
  trigger_next_supplier: boolean;
  confidence: number;
  reason_codes: string[];
  summary: string;
  heuristic: {
    mode: string;
    needs_review: boolean;
    severity: "none" | "medium" | "high" | string;
    score: number;
    reason_codes: string[];
    summary: string;
    metrics: {
      combo_count: number;
      combos_with_weight: number;
      unique_weight_count: number;
      unique_weights_grams: number[];
      distinct_pack_signatures: number;
      unique_price_count: number;
      text_weight_candidates_grams: number[];
      packaging_weight_candidates_grams: number[];
      product_weight_candidates_grams: number[];
      structured_table: {
        has_structured_table: boolean;
        strong_table_pass: boolean;
        table_row_count: number;
        table_name_count: number;
        table_unique_weights_grams: number[];
        combo_lookup_count: number;
        combo_match_count: number;
        combo_mismatch_count: number;
        coverage_ratio: number;
        match_ratio: number;
        mismatch_examples: Array<{
          label: string;
          row_weight_grams: number;
          table_weight_grams: number;
        }>;
      };
    };
  };
  ai: {
    used: boolean;
    model: string | null;
    error: string | null;
    needs_review: boolean;
    suppressed_by_structured_table?: boolean;
    confidence: number | null;
    reason_codes: string[];
    summary: string | null;
  };
  evidence: {
    combo_count: number;
    combos_with_weight: number;
    unique_weights_grams: number[];
    structured_table?: {
      has_structured_table: boolean;
      strong_table_pass: boolean;
      table_row_count: number;
      combo_match_count: number;
      coverage_ratio: number;
      match_ratio: number;
    };
    text_weight_mentions: Array<{
      weight_grams: number;
      token: string;
      line: string;
      source_kind?: string;
    }>;
    variant_snapshot: Array<{
      index: number;
      label: string;
      label_en: string;
      weight_grams: number | null;
      weight_raw: string;
      price: number | null;
      pack_signature: string;
    }>;
  };
};

export const reviewSupplierWeightBestEffort = (options?: {
  extractedPayload?: unknown;
  competitor?: { title?: unknown; description?: unknown } | null;
  detailUrl?: unknown;
  apiKey?: string;
  enableAi?: string | number | boolean;
}): Promise<WeightReviewResult> =>
  weightReview.reviewSupplierWeightBestEffort(
    options as Parameters<typeof weightReview.reviewSupplierWeightBestEffort>[0]
  ) as Promise<WeightReviewResult>;

export const __testables = weightReview.__testables;
