import * as aiPipeline from "./ai-pipeline.mjs";

export type Ai1688WeightReviewSummary = {
  used: boolean;
  needs_review: boolean;
  confidence: number | null;
  reason_codes: string[];
  summary: string;
  model: string | null;
};

export type Ai1688AttributeExtract = {
  used: boolean;
  error?: string;
  model?: string;
  summary?: string;
  confidence?: number | null;
  unit_weight_candidates_grams?: number[];
  packaging_weight_candidates_grams?: number[];
  dimensions_cm_candidates?: string[];
  materials?: string[];
  product_name_cn?: string;
  product_name_en?: string;
  evidence_lines?: string[];
  warnings?: string[];
};

export type Ai1688Block = {
  version: number;
  processed_at: string;
  source: string;
  mode: string;
  weight_review: Ai1688WeightReviewSummary | null;
  attribute_extract: Ai1688AttributeExtract;
};

export type Enhanced1688Item = Record<string, unknown> & {
  weight_review_1688?: Record<string, unknown> | null;
  ai_1688?: Ai1688Block;
};

export type Enhance1688Options = {
  mode?: string;
  source?: string;
  enableWeightReview?: string | number | boolean;
  enableAttributeExtract?: string | number | boolean;
  apiKey?: string;
  modelCandidates?: string[];
  attributeTimeoutMs?: number;
  concurrency?: number;
};

export const enhance1688ItemWithAi = (
  item: unknown,
  options?: Enhance1688Options
): Promise<Enhanced1688Item> =>
  aiPipeline.enhance1688ItemWithAi(
    item as Parameters<typeof aiPipeline.enhance1688ItemWithAi>[0],
    options as Parameters<typeof aiPipeline.enhance1688ItemWithAi>[1]
  ) as Promise<Enhanced1688Item>;

export const enhance1688ItemsWithAi = (
  items: unknown[],
  options?: Enhance1688Options
): Promise<Enhanced1688Item[]> =>
  aiPipeline.enhance1688ItemsWithAi(
    items as Parameters<typeof aiPipeline.enhance1688ItemsWithAi>[0],
    options as Parameters<typeof aiPipeline.enhance1688ItemsWithAi>[1]
  ) as Promise<Enhanced1688Item[]>;
