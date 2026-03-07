import { CAMPAIGN_SEARCH_STOPWORDS } from "@/lib/campaign-search/constants";
import { extractSearchTermsFromText, normalizeSearchText, titleCaseLabel } from "@/lib/campaign-search/normalization";
import type { CampaignFingerprint } from "@/lib/campaign-search/types";

function detectSourceLanguage(input: string): CampaignFingerprint["sourceLanguage"] {
  const raw = String(input || "");
  const normalized = normalizeSearchText(raw);
  if (!normalized) return "unknown";
  if (/[åäö]/i.test(raw)) return "sv";
  if (/\b(the|with|for|and|running|glasses)\b/i.test(raw)) return "en";
  return "mixed";
}

export function buildFallbackFingerprint(inputText: string, error?: string): CampaignFingerprint {
  const terms = extractSearchTermsFromText(inputText, 14).filter(
    (term) => !CAMPAIGN_SEARCH_STOPWORDS.has(term)
  );
  const coreTerms = terms.slice(0, 6);
  const labelSource = coreTerms.slice(0, 3).join(" ");

  return {
    sourceLanguage: detectSourceLanguage(inputText),
    campaignSummarySv: titleCaseLabel(labelSource || "Fallback search"),
    globalNegativeTerms: [],
    segments: [
      {
        key: "fallback",
        label: titleCaseLabel(labelSource || "Fallback search"),
        confidence: 0.32,
        taxonomyHints: [],
        taxonomyMode: "boost",
        coreTermsSv: coreTerms,
        synonymsSv: [],
        joinedVariants: [],
        splitVariants: [],
        mustHave: [],
        niceToHave: terms.slice(6, 10),
        negativeTerms: [],
        brandTerms: [],
        strictQueries: coreTerms.slice(0, 3).length > 0 ? [coreTerms.slice(0, 3).join(" ")] : [],
        balancedQueries: coreTerms.length > 0 ? [coreTerms.join(" ")] : [],
        broadQueries: terms.length > 0 ? [terms.join(" ")] : [],
        notes: error ? `LLM fallback triggered: ${error}` : "Deterministic fallback segment",
      },
    ],
  };
}
