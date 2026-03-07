import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSegmentSemanticQueryText, getCampaignSearchSemanticConfig } from "@/lib/campaign-search/semantic";
import type { CampaignSearchSegmentPlan } from "@/lib/campaign-search/types";

const plan: CampaignSearchSegmentPlan = {
  key: "solar-lighting",
  label: "Solcellslampor",
  confidence: 0.89,
  taxonomyMode: "prefer",
  taxonomyHints: ["Home & Garden > Lighting"],
  mappedTaxonomy: {
    taxonomyL1: ["Home & Garden"],
    taxonomyL2: ["Lighting"],
    confidence: 0.95,
    reasoning: [],
  },
  coreTerms: ["solcellslampa"],
  synonyms: ["solcell lampa"],
  joinedVariants: ["solcellslampa"],
  splitVariants: ["solcell lampa"],
  mustHave: ["utomhus"],
  niceToHave: ["ljusslinga"],
  negativeTerms: ["radio"],
  brandTerms: [],
  strictTerms: ["solcellslampa", "utomhus"],
  balancedTerms: ["solcellslampa", "solcell lampa", "utomhus", "ljusslinga"],
  broadTerms: ["solcellslampa", "solcell lampa", "trädgårdslampa"],
  rescueTerms: ["solcellslampa", "solcell lampa"],
  strictTsQuery: "solcellslampa & utomhus",
  balancedTsQuery: "solcellslampa | (solcell <-> lampa) | ljusslinga",
  broadTsQuery: "solcellslampa | (solcell <-> lampa) | tradgardslampa",
  strictPhrases: ["solcell lampa"],
  balancedPhrases: ["solcell lampa"],
  semanticQueryText: "",
  debug: {},
  sourceSegment: {
    key: "solar-lighting",
    label: "Solcellslampor",
    confidence: 0.89,
    taxonomyHints: ["Home & Garden > Lighting"],
    taxonomyMode: "prefer",
    coreTermsSv: ["solcellslampa"],
    synonymsSv: ["solcell lampa"],
    joinedVariants: ["solcellslampa"],
    splitVariants: ["solcell lampa"],
    mustHave: ["utomhus"],
    niceToHave: ["ljusslinga"],
    negativeTerms: ["radio"],
    brandTerms: [],
    strictQueries: ["solcellslampa utomhus"],
    balancedQueries: ["solcellslampa solcell lampa ljusslinga"],
    broadQueries: ["solcellslampa trädgårdslampa"],
    notes: "Trädgårdsbelysning för partnerkampanj",
  },
};

test("buildSegmentSemanticQueryText keeps high-signal Swedish context", () => {
  const queryText = buildSegmentSemanticQueryText(plan);
  assert.match(queryText, /Solcellslampor/);
  assert.match(queryText, /solcell lampa/);
  assert.match(queryText, /Lighting/);
});

test("getCampaignSearchSemanticConfig returns a stable config object", () => {
  const config = getCampaignSearchSemanticConfig();
  assert.ok(config.model.length > 0);
  assert.ok(config.version.length > 0);
  assert.ok(config.dimensions > 0);
});
