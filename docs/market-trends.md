# Market Trends

This feature displays weekly and daily AI reports generated from monitored commerce front pages (visible text + OCR on promo images).

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

## Supabase schema

Apply: `supabase/migrations/0044_market_trends_reports.sql`

Tables:

- `market_trend_sites`
- `market_trend_frontpage_scrapes`
- `market_trend_frontpage_products`
- `market_trend_reports`

Views:

- `market_trend_frontpage_product_rollups`

## Scraper process

Standalone scripts live in:

- `node-tools/market-trends-reporter/scripts/run_daily.mjs`
- `node-tools/market-trends-reporter/scripts/run_weekly.mjs`

Scheduling (systemd unit files):

- `node-tools/market-trends-reporter/systemd/market-trends-daily.*`
- `node-tools/market-trends-reporter/systemd/market-trends-weekly.*`

## Dashboard integration

- Landing card: `app/app/page.tsx`
- Reports UI: `app/app/market-trends/page.tsx`
- API routes:
  - `app/api/market-trends/latest/route.ts`
  - `app/api/market-trends/reports/route.ts`
  - `app/api/market-trends/sites/route.ts`

