import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCampaignFingerprint,
  parseCampaignSearchTuningAnalystOutput,
} from "@/lib/campaign-search/schema";

test("parseCampaignFingerprint accepts a valid multi-segment payload", () => {
  const parsed = parseCampaignFingerprint({
    sourceLanguage: "mixed",
    campaignSummarySv: "Läsglasögon och löparbälte",
    globalNegativeTerms: ["barn"],
    segments: [
      {
        key: "reading-glasses",
        label: "Läsglasögon",
        confidence: 0.91,
        taxonomyHints: ["Apparel & Accessories > Clothing Accessories > Sunglasses"],
        taxonomyMode: "prefer",
        coreTermsSv: ["läsglasögon"],
        synonymsSv: ["läsglasögon"],
        joinedVariants: ["läsglasögon"],
        splitVariants: ["läs glasögon"],
        mustHave: ["styrka"],
        niceToHave: ["fodral"],
        negativeTerms: [],
        brandTerms: [],
        strictQueries: ["läsglasögon styrka"],
        balancedQueries: ["läsglasögon läs glasögon styrka"],
        broadQueries: ["läsglasögon läs glasögon glasögon"],
        notes: "",
      },
      {
        key: "running-belt",
        label: "Löparbälte",
        confidence: 0.84,
        taxonomyHints: ["Sporting Goods"],
        taxonomyMode: "boost",
        coreTermsSv: ["löparbälte"],
        synonymsSv: ["löpbälte"],
        joinedVariants: ["löparbälte"],
        splitVariants: [],
        mustHave: [],
        niceToHave: ["reflex"],
        negativeTerms: [],
        brandTerms: [],
        strictQueries: ["löparbälte"],
        balancedQueries: ["löparbälte löpbälte"],
        broadQueries: ["löparbälte löpbälte träningsbälte"],
        notes: "",
      },
    ],
  });

  assert.equal(parsed.segments.length, 2);
});

test("parseCampaignFingerprint rejects empty segments", () => {
  assert.throws(() =>
    parseCampaignFingerprint({
      sourceLanguage: "sv",
      campaignSummarySv: "Tom",
      globalNegativeTerms: [],
      segments: [
        {
          key: "bad",
          label: "Bad",
          confidence: 0.4,
          taxonomyHints: [],
          taxonomyMode: "boost",
          coreTermsSv: [],
          synonymsSv: [],
          joinedVariants: [],
          splitVariants: [],
          mustHave: [],
          niceToHave: [],
          negativeTerms: [],
          brandTerms: [],
          strictQueries: [],
          balancedQueries: [],
          broadQueries: [],
          notes: "",
        },
      ],
    })
  );
});

test("parseCampaignSearchTuningAnalystOutput accepts structured tuning suggestions", () => {
  const parsed = parseCampaignSearchTuningAnalystOutput({
    synonymSuggestions: [
      {
        segmentKey: "running-belt",
        canonical: "löparbälte",
        alias: "löp bälte",
        reason: "Expected product only surfaced semantically.",
        confidence: "high",
      },
    ],
    compoundSuggestions: [],
    taxonomySuggestions: [],
    negativeTerms: [],
    scoreAdjustments: [
      {
        component: "hybrid_rrf_semantic",
        direction: "increase",
        reason: "Semantic rescue is relevant but too weak.",
        confidence: "medium",
      },
    ],
    segmentationAdvice: [],
    notes: ["Synthetic test payload"],
  });

  assert.equal(parsed.synonymSuggestions.length, 1);
  assert.equal(parsed.scoreAdjustments[0]?.direction, "increase");
});
