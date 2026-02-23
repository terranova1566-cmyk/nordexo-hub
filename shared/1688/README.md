# 1688 Core Source Of Truth

This folder is the backend source of truth for shared 1688 logic used by production queue and supplier search flows.

## Modules

- `core.mjs`
  - canonical offer URL normalization (`canonical1688OfferUrl`)
  - resilient JSON extraction (`extractJsonFromText`)
  - image-search fetch error detection (`isImageFetchError`)
  - deterministic weight parsing (`toWeightGrams`)
  - variant-name normalization (`normalizeNameStrict`, `normalizeNameLoose`)
  - readable-text weight table parsing (`parseVariantWeightTableFromReadableText`)
  - fallback weight selection (`pickFallbackWeightGrams`)

- `image-search-runner.mjs`
  - single runner for `/srv/node-tools/1688-image-search/index.js`
  - consistent args/env/timeouts and error handling for file/url image searches

- `weight-review.mjs`
  - heuristic + optional OpenAI validation for suspicious 1688 weight extraction
  - warning-only output (`needs_review`, reason codes, evidence), never edits weights
  - used by production supplier payload worker to persist `weight_review_1688`

- `ai-pipeline.mjs`
  - shared post-processing orchestrator for server-side 1688 JSON enhancement
  - runs weight review and attribute extraction in one additive pass
  - writes only additive fields (`weight_review_1688`, `ai_1688`) and never mutates source extraction values

## Current Callers

- `app/api/production/suppliers/route.ts`
- `app/api/production/suppliers/recrop-search/route.ts`
- `app/api/1688/image-search/route.ts`
- `app/api/production/suppliers/variants/route.ts`
- `app/api/1688-extractor/upload/route.ts`
- `scripts/product-suggestions-supplier-search-worker.mjs`
- `scripts/production-supplier-fetch-worker.mjs`

## Extension Rebuild Note

When rebuilding the Chrome extension scraper logic, copy deterministic parsing behavior from this folder first so scraper behavior stays aligned with production/backend behavior.
