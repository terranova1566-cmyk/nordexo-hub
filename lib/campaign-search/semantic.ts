import {
  CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS,
  CAMPAIGN_SEARCH_EMBEDDING_MODEL,
  CAMPAIGN_SEARCH_EMBEDDING_VERSION,
  CAMPAIGN_SEARCH_SEMANTIC_ENABLED,
} from "@/lib/campaign-search/constants";
import { dedupeStrings } from "@/lib/campaign-search/normalization";
import type { CampaignSearchSegmentPlan } from "@/lib/campaign-search/types";

type EmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  model?: string;
};

export type CampaignSearchSemanticConfig = {
  enabled: boolean;
  model: string;
  dimensions: number;
  version: string;
};

const MAX_SEGMENT_EMBEDDING_TEXT = 1400;

const buildOpenAiEmbeddingsUrl = (env: NodeJS.ProcessEnv) => {
  const base = String(env.OPENAI_BASE_URL || env.OPENAI_IMAGE_BASE_URL || "").trim();
  if (!base) return "https://api.openai.com/v1/embeddings";
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/embeddings`;
  return `${trimmed}/v1/embeddings`;
};

export function getCampaignSearchSemanticConfig(): CampaignSearchSemanticConfig {
  return {
    enabled: CAMPAIGN_SEARCH_SEMANTIC_ENABLED && Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
    model: CAMPAIGN_SEARCH_EMBEDDING_MODEL,
    dimensions: CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS,
    version: CAMPAIGN_SEARCH_EMBEDDING_VERSION,
  };
}

export function buildSegmentSemanticQueryText(plan: CampaignSearchSegmentPlan) {
  const originalTerms = dedupeStrings(
    [
      plan.sourceSegment.label,
      ...plan.sourceSegment.coreTermsSv,
      ...plan.sourceSegment.synonymsSv,
      ...plan.sourceSegment.joinedVariants,
      ...plan.sourceSegment.splitVariants,
      ...plan.sourceSegment.mustHave,
      ...plan.sourceSegment.niceToHave,
      ...plan.sourceSegment.brandTerms,
      ...plan.sourceSegment.taxonomyHints,
    ].map((value) => String(value || "").trim()).filter(Boolean),
    24
  );

  const lines = [
    `segment: ${plan.sourceSegment.label}`,
    originalTerms.length > 0 ? `terms: ${originalTerms.join(", ")}` : "",
    plan.mappedTaxonomy.taxonomyL2.length > 0
      ? `taxonomy_l2: ${plan.mappedTaxonomy.taxonomyL2.join(", ")}`
      : "",
    plan.mappedTaxonomy.taxonomyL1.length > 0
      ? `taxonomy_l1: ${plan.mappedTaxonomy.taxonomyL1.join(", ")}`
      : "",
    plan.sourceSegment.notes ? `notes: ${plan.sourceSegment.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return lines.slice(0, MAX_SEGMENT_EMBEDDING_TEXT);
}

function serializeEmbeddingVector(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export function toEmbeddingTextVector(vector: number[]) {
  return serializeEmbeddingVector(vector);
}

export async function embedTexts(input: {
  texts: string[];
  model?: string;
  dimensions?: number;
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const texts = input.texts.map((value) => String(value || "").trim()).filter(Boolean);
  if (texts.length === 0) {
    return {
      vectors: [] as number[][],
      model: input.model || CAMPAIGN_SEARCH_EMBEDDING_MODEL,
    };
  }

  const model = input.model || CAMPAIGN_SEARCH_EMBEDDING_MODEL;
  const dimensions = input.dimensions || CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS;
  const body: Record<string, unknown> = {
    model,
    input: texts,
  };

  if (/^text-embedding-3/i.test(model) && Number.isFinite(dimensions)) {
    body.dimensions = dimensions;
  }

  const response = await fetch(buildOpenAiEmbeddingsUrl(process.env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI embeddings error (${response.status}): ${payloadText.slice(0, 400)}`);
  }

  const payload = JSON.parse(payloadText) as EmbeddingPayload;
  const vectors = Array.isArray(payload.data)
    ? payload.data
        .slice()
        .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
        .map((entry) => (Array.isArray(entry.embedding) ? entry.embedding.map((value) => Number(value)) : []))
    : [];

  if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
    throw new Error("Embedding response was incomplete.");
  }

  return {
    vectors,
    model: String(payload.model || model),
  };
}
