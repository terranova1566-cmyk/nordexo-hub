import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeCandidateForShare, sanitizeLookbookItemForShare } from "@/lib/b2b/share/sanitize";

test("sanitizeCandidateForShare omits sensitive fields and computes customer unit price", () => {
  const candidate: any = {
    id: "cand_1",
    title: "Secret Supplier Product",
    images: ["https://example.com/a.jpg"],
    moq: 5,
    final_moq: null,
    final_price_without_logo_cny: 10,
    final_price_with_logo_cny: null,
    branding_costs_cny: { logo: 2 },
    packaging_costs_cny: 1,
    margin_percent_override: 10,
    margin_fixed_override: 3,
    final_lead_time_days: 14,

    // Sensitive/internal fields that must not leak via share payloads.
    supplier_id: "supp_123",
    source_url: "https://detail.1688.com/offer/123.html",
    raw_scrape_json: { secret: true },
    margin_percent_default: 999,
  };

  const project = {
    currency: "USD",
    exchange_rate_cny: 0.14,
    margin_percent_default: 20,
    margin_fixed_default: 0,
  };

  const out = sanitizeCandidateForShare({ candidate, project });

  assert.deepEqual(Object.keys(out).sort(), [
    "currency",
    "customer_unit_price",
    "id",
    "image",
    "images",
    "lead_time_days",
    "moq",
    "title",
  ]);

  assert.equal(out.id, "cand_1");
  assert.equal(out.currency, "USD");
  assert.ok(out.customer_unit_price !== null);
  // unitCostCny = 10, extras = 2 + 1 => 13
  // customer cost = 13 * 0.14 = 1.82
  // margin override 10% => 2.002, fixed override 3 => 5.002
  assert.ok(Math.abs((out.customer_unit_price ?? 0) - 5.002) < 1e-9);

  assert.equal((out as any).supplier_id, undefined);
  assert.equal((out as any).source_url, undefined);
  assert.equal((out as any).raw_scrape_json, undefined);
});

test("sanitizeLookbookItemForShare returns lookbook-only preview when no candidate is attached", () => {
  const out = sanitizeLookbookItemForShare({
    item: {
      id: "item_1",
      title: "Preview Product",
      image_url: "https://example.com/prev.webp",
      preview_price_cny: 20,
      product_candidate_id: null,
    },
    project: {
      currency: "EUR",
      exchange_rate_cny: 0.13,
      margin_percent_default: 0,
      margin_fixed_default: 0,
    },
  });

  assert.deepEqual(Object.keys(out).sort(), [
    "currency",
    "customer_unit_price",
    "id",
    "image",
    "product_candidate_id",
    "title",
  ]);
  assert.equal(out.currency, "EUR");
  assert.equal(out.product_candidate_id, null);
  assert.ok(out.customer_unit_price !== null);
});

