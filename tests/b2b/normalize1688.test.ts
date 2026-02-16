import { test } from "node:test";
import assert from "node:assert/strict";

import type { OfferDetailScrape } from "@/lib/b2b/scrapers/1688";
import { normalize1688OfferToCandidate } from "@/lib/b2b/scrapers/1688";

test("normalize1688OfferToCandidate extracts title, supplier, moq, images and price stats", () => {
  const scrape: OfferDetailScrape = {
    ok: true,
    meta: { title: "Test Widget" },
    extracted: {
      readableText: "Acme Supplier\n10件起批\nSome other text",
      mainImageUrl: "https://example.com/a.jpg",
      imageUrls: [
        "https://example.com/b.png",
        "https://example.com/desc/detail-1.jpg",
        "https://example.com/icon.svg",
        "not-a-url",
      ],
      galleryImageUrls: ["https://example.com/a.jpg", "https://example.com/b.png"],
      descriptionImageUrls: ["https://example.com/desc/detail-1.jpg"],
      variations: {
        combos: [{ price: "5.5" }, { price: 4 }, { price: null }],
      },
      priceStats: { min: 6, max: 7 },
    },
  };

  const normalized = normalize1688OfferToCandidate(scrape);

  assert.equal(normalized.title, "Test Widget");
  assert.equal(normalized.supplierName, "Acme Supplier");
  assert.equal(normalized.moq, 10);
  assert.deepEqual(normalized.galleryImages, ["https://example.com/a.jpg", "https://example.com/b.png"]);
  assert.deepEqual(normalized.descriptionImages, ["https://example.com/desc/detail-1.jpg"]);
  assert.deepEqual(normalized.images, [
    "https://example.com/a.jpg",
    "https://example.com/b.png",
    "https://example.com/desc/detail-1.jpg",
  ]);
  assert.equal(normalized.sourcePriceMinCny, 4);
  assert.equal(normalized.sourcePriceMaxCny, 5.5);
  assert.deepEqual(normalized.priceTiers, [{ minQty: 10, priceCny: 4 }]);
});
