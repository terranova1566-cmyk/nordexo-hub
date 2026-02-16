import { test } from "node:test";
import assert from "node:assert/strict";

import { computeCustomerUnitPrice, sumJsonNumbers } from "@/lib/b2b/pricing";

test("sumJsonNumbers sums nested JSON numbers", () => {
  const input = {
    a: 1,
    b: "2.5",
    c: [3, { d: "4" }, null, undefined],
    e: { f: { g: 0.5 } },
    ignored: "not-a-number",
  };

  assert.equal(sumJsonNumbers(input), 11);
});

test("computeCustomerUnitPrice computes expected customer unit price", () => {
  const computed = computeCustomerUnitPrice({
    currency: "USD",
    exchangeRateCny: 0.15,
    unitCostCny: 10,
    brandingCostsCny: { logo: 2 },
    packagingCostsCny: [1, { box: 0.5 }],
    margin: { marginPercent: 20, marginFixed: 1 },
  });

  assert.equal(computed.ok, true);
  if (!computed.ok) return;

  // totalUnitCostCny = 10 + (2 + 1 + 0.5) = 13.5
  // totalUnitCostCustomer = 13.5 * 0.15 = 2.025
  // customerUnitPrice = 2.025 * 1.2 + 1 = 3.43
  assert.ok(Math.abs(computed.customerUnitPrice - 3.43) < 1e-9);
});

test("computeCustomerUnitPrice rejects invalid exchange rate", () => {
  const computed = computeCustomerUnitPrice({
    currency: "EUR",
    exchangeRateCny: 0,
    unitCostCny: 10,
    margin: { marginPercent: 0, marginFixed: 0 },
  });

  assert.equal(computed.ok, false);
  if (computed.ok) return;
  assert.match(computed.error, /exchange rate/i);
});

