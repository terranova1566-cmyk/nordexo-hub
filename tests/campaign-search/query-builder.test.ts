import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSegmentPlan } from "@/lib/campaign-search/query-builder";
import type { CampaignFingerprint } from "@/lib/campaign-search/types";

const fingerprint: CampaignFingerprint = {
  sourceLanguage: "en",
  campaignSummarySv: "Läsglasögon",
  globalNegativeTerms: ["barn"],
  segments: [
    {
      key: "reading-glasses",
      label: "Läsglasögon",
      confidence: 0.9,
      taxonomyHints: ["Apparel & Accessories > Clothing Accessories > Sunglasses"],
      taxonomyMode: "prefer",
      coreTermsSv: ["läs glasögon"],
      synonymsSv: ["läsglasögon"],
      joinedVariants: [],
      splitVariants: [],
      mustHave: ["styrka"],
      niceToHave: ["blåljus"],
      negativeTerms: [],
      brandTerms: [],
      strictQueries: ["läs glasögon styrka"],
      balancedQueries: ["läsglasögon läs glasögon styrka"],
      broadQueries: ["läsglasögon läs glasögon glasögon"],
      notes: "",
    },
  ],
};

test("buildSegmentPlan generates bounded queries and compound rescue terms", () => {
  const plan = buildSegmentPlan({
    fingerprint,
    segment: fingerprint.segments[0],
    taxonomyOptions: [
      {
        taxonomyL1: "Apparel & Accessories",
        taxonomyL2: "Clothing Accessories",
        productCount: 145,
      },
    ],
    taxonomyAliases: [
      {
        alias: "läsglasögon",
        taxonomyL1: "Apparel & Accessories",
        taxonomyL2: "Clothing Accessories",
        confidence: 0.95,
      },
    ],
    lexiconTerms: ["las", "glasogon", "lasglasogon", "styrka"],
    synonyms: [{ canonical: "läsglasögon", alias: "läs glasögon", strength: 1 }],
  });

  assert.ok(plan.joinedVariants.includes("lasglasogon"));
  assert.ok(plan.strictTsQuery.includes("las"));
  assert.ok(plan.balancedTsQuery.includes("lasglasogon"));
  assert.ok(plan.mappedTaxonomy.taxonomyL1.includes("Apparel & Accessories"));
  assert.match(plan.semanticQueryText, /segment:/i);
  assert.match(plan.semanticQueryText, /Läsglasögon/);
});
