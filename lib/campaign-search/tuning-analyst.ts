import { CAMPAIGN_SEARCH_MODEL } from "@/lib/campaign-search/constants";
import { CAMPAIGN_SEARCH_TUNING_ANALYST_PROMPT } from "@/lib/campaign-search/prompt";
import {
  CAMPAIGN_SEARCH_TUNING_ANALYST_JSON_SCHEMA,
  parseCampaignSearchTuningAnalystOutput,
  type CampaignSearchTuningAnalystOutput,
} from "@/lib/campaign-search/schema";
import type { CampaignFingerprint } from "@/lib/campaign-search/types";

type TuningAnalystResult = {
  analysis: CampaignSearchTuningAnalystOutput;
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

function buildUserMessage(input: {
  campaignText: string;
  fingerprint: CampaignFingerprint;
  topResults: unknown;
  knownRelevant: unknown;
  knownIrrelevant: unknown;
  scoreBreakdowns: unknown;
}) {
  return JSON.stringify(
    {
      campaignText: input.campaignText,
      fingerprint: input.fingerprint,
      topResults: input.topResults,
      knownRelevant: input.knownRelevant,
      knownIrrelevant: input.knownIrrelevant,
      scoreBreakdowns: input.scoreBreakdowns,
    },
    null,
    2
  );
}

export async function analyzeCampaignSearchTuning(input: {
  campaignText: string;
  fingerprint: CampaignFingerprint;
  topResults: unknown;
  knownRelevant: unknown;
  knownIrrelevant: unknown;
  scoreBreakdowns: unknown;
}): Promise<TuningAnalystResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const baseBody = {
    model: CAMPAIGN_SEARCH_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: CAMPAIGN_SEARCH_TUNING_ANALYST_PROMPT },
      {
        role: "user",
        content: buildUserMessage(input),
      },
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
          json_schema: CAMPAIGN_SEARCH_TUNING_ANALYST_JSON_SCHEMA,
        },
      },
    });
    rawResponse = extractContentString(payload);
    return {
      analysis: parseCampaignSearchTuningAnalystOutput(JSON.parse(rawResponse)),
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

  const payload = await callChatCompletions({
    apiKey,
    body: {
      ...baseBody,
      response_format: { type: "json_object" },
    },
  });
  rawResponse = extractContentString(payload);

  return {
    analysis: parseCampaignSearchTuningAnalystOutput(JSON.parse(rawResponse)),
    model: String(payload?.model || CAMPAIGN_SEARCH_MODEL),
    rawResponse,
    usedStructuredSchema,
  };
}
