# Market Trends

This feature displays weekly and daily AI reports generated from monitored commerce front pages (visible text + OCR on promo images).

It now also includes a daily cross-channel **Sales Vector Snapshot** built from scraper sales deltas (CDON, Fyndiq, DigiDeal, LetsDeal, Offerilla, DealSales), with a top-100 signal feed and a top-10 hottest list.

## Data flow

1. Daily scraper runs (Playwright).
2. Extracts:
   - Visible text (`document.body.innerText`)
   - All first-page URLs (deduped)
   - Product-like links (anchors with images + visible label)
   - Large images (for OCR)
3. OCR runs on large images using OpenAI vision.
4. OpenAI generates a JSON report (includes a markdown report + best-effort product/category URL classification).
5. Data is saved to:
   - JSON files under `node-tools/market-trends-reporter/output/`
   - Supabase tables (for the dashboard)

Weekly aggregation combines 7 daily reports into per-site weekly reports, then creates an "All websites" weekly report.

## Sales Vector flow

1. `run_sales_vector_daily.mjs` reads latest `*_product_daily_with_delta` scraper views per source.
2. It normalizes fields (title, URL, image, price, total sold, 1d/7d delta, baseline, spike ratio).
3. It applies per-source quotas and score ranking to build a top-100 snapshot.
4. It generates AI summary JSON + markdown and stores everything in Supabase.
5. Dashboard API serves the latest snapshot and report.

## Supabase schema

Apply: `supabase/migrations/0044_market_trends_reports.sql`

Apply (sales vectors): `supabase/migrations/0059_market_sales_vector.sql`

Tables:

- `market_trend_sites`
- `market_trend_frontpage_scrapes`
- `market_trend_frontpage_products`
- `market_trend_reports`
- `market_sales_vector_snapshots`
- `market_sales_vector_items`
- `market_sales_vector_reports`

Views:

- `market_trend_frontpage_product_rollups`
- `market_sales_vector_latest`

## Scraper process

Standalone scripts live in:

- `node-tools/market-trends-reporter/scripts/run_daily.mjs`
- `node-tools/market-trends-reporter/scripts/run_weekly.mjs`
- `node-tools/market-trends-reporter/scripts/run_sales_vector_daily.mjs`

Scheduling (systemd unit files):

- `node-tools/market-trends-reporter/systemd/market-trends-daily.*`
- `node-tools/market-trends-reporter/systemd/market-trends-weekly.*`
- `node-tools/market-trends-reporter/systemd/market-trends-sales-vector.*`

## Dashboard integration

- Landing card: `app/app/page.tsx`
- Reports UI: `app/app/market-trends/page.tsx`
- API routes:
  - `app/api/market-trends/latest/route.ts`
  - `app/api/market-trends/reports/route.ts`
  - `app/api/market-trends/sites/route.ts`
  - `app/api/market-trends/vector/latest/route.ts`
