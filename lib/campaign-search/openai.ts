import { CAMPAIGN_SEARCH_MODEL } from "@/lib/campaign-search/constants";
import { buildCampaignFingerprintUserMessage, CAMPAIGN_FINGERPRINT_SYSTEM_PROMPT } from "@/lib/campaign-search/prompt";
import { CAMPAIGN_FINGERPRINT_JSON_SCHEMA, parseCampaignFingerprint } from "@/lib/campaign-search/schema";
import type { CampaignFingerprint, CatalogTaxonomyOption } from "@/lib/campaign-search/types";

type OpenAiExtractionResult = {
  fingerprint: CampaignFingerprint;
  model: string;
  rawResponse: string;
  usedStructuredSchema: boolean;
};

const buildOpenAiChatCompletionsUrl = (env: NodeJS.ProcessEnv) => {
  const base = String(env.OPENAI_BASE_URL || env.OPENAI_IMAGE_BASE_URL || "").trim();
  if (!base) return "https://api.openai.com/v1/chat/completions";
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
};

const extractContentString = (payload: any) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry.text === "string") return entry.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

async function callChatCompletions(args: {
  apiKey: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(buildOpenAiChatCompletionsUrl(process.env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(args.body),
  });

  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI error (${response.status}): ${payloadText.slice(0, 400)}`);
  }

  return JSON.parse(payloadText);
}

export async function extractCampaignFingerprint(args: {
  inputText: string;
  taxonomyOptions: CatalogTaxonomyOption[];
}): Promise<OpenAiExtractionResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const userMessage = buildCampaignFingerprintUserMessage({
    inputText: args.inputText,
    taxonomyOptions: args.taxonomyOptions,
  });

  const baseBody = {
    model: CAMPAIGN_SEARCH_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: CAMPAIGN_FINGERPRINT_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  } satisfies Record<string, unknown>;

  let usedStructuredSchema = true;
  let rawResponse = "";

  try {
    const payload = await callChatCompletions({
      apiKey,
      body: {
        ...baseBody,
        response_format: {
          type: "json_schema",
          json_schema: CAMPAIGN_FINGERPRINT_JSON_SCHEMA,
        },
      },
    });
    rawResponse = extractContentString(payload);
    return {
      fingerprint: parseCampaignFingerprint(JSON.parse(rawResponse)),
      model: String(payload?.model || CAMPAIGN_SEARCH_MODEL),
      rawResponse,
      usedStructuredSchema,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/json_schema|response_format|structured/i.test(message)) {
      throw error;
    }

    usedStructuredSchema = false;
  }

  const fallbackPayload = await callChatCompletions({
    apiKey,
    body: {
      ...baseBody,
      response_format: { type: "json_object" },
    },
  });
  rawResponse = extractContentString(fallbackPayload);

  return {
    fingerprint: parseCampaignFingerprint(JSON.parse(rawResponse)),
    model: String(fallbackPayload?.model || CAMPAIGN_SEARCH_MODEL),
    rawResponse,
    usedStructuredSchema,
  };
}
