import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeSearchText, stripHtmlToText } from "@/lib/campaign-search/normalization";

test("normalizeSearchText keeps search tokens stable for Swedish compounds", () => {
  assert.equal(
    normalizeSearchText("Läsglasögon / själv-inställande"),
    "lasglasogon sjalv installande"
  );
});

test("stripHtmlToText removes markup without collapsing useful text", () => {
  assert.equal(
    stripHtmlToText("<p>Läsglasögon<br/>med styrka</p>"),
    "Läsglasögon med styrka"
  );
});
