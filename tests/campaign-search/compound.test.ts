import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCompoundSupportSet,
  generateJoinedCompoundVariants,
  generateSplitCompoundVariants,
} from "@/lib/campaign-search/compound";

test("compound helpers generate joined and split variants for Swedish retail terms", () => {
  const lexicon = new Set([
    "las",
    "glasogon",
    "lasglasogon",
    "sjalv",
    "installande",
    "sjalvinstallande",
    "lop",
    "balte",
    "lopbalte",
  ]);
  const support = buildCompoundSupportSet([...lexicon]);

  assert.deepEqual(generateJoinedCompoundVariants(["läs glasögon"], lexicon, support), [
    "lasglasogon",
  ]);
  assert.deepEqual(
    generateSplitCompoundVariants(["läsglasögon", "självinställande"], lexicon, support),
    ["las glasogon", "sjalv installande"]
  );
});
