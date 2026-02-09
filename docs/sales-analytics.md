# Sales Analytics (Historical)

This is an internal (admin-only) sales analytics engine that lets you import historical sales (Excel) and then query bestsellers by SKU/category/supplier and time of year.

## Database

Migration: `nordexo-hub/supabase/migrations/0025_sales_analytics.sql`

Tables:
- `sales_skus`: SKU dimension (title, supplier, Google taxonomy fields)
- `sales_facts`: daily facts keyed by `(sku, sold_date, seller, currency)`
- `sales_import_runs`: audit trail for each import
- `sales_import_errors`: optional per-row errors

Views / RPC:
- `sales_sku_enriched`: joins `sales_skus` to `catalog_variants` / `catalog_products` when possible
- `sales_sku_rollups`: all-time totals per SKU
- `sales_sku_month_of_year`: month-of-year rollups per SKU
- `sales_category_month_of_year`: month-of-year rollups per taxonomy path
- `sales_supplier_month_of_year`: month-of-year rollups per supplier
- `sales_top_skus_in_range(start, end, limit, seller?, supplier_name?, taxonomy_path?)`
- `sales_top_skus_for_month(month, year?, limit, seller?, supplier_name?, taxonomy_path?)`
- `sales_top_categories_in_range(start, end, limit, seller?, supplier_name?)`
- `sales_top_categories_for_month(month, year?, limit, seller?, supplier_name?)`
- `sales_top_suppliers_in_range(start, end, limit, seller?, taxonomy_path?)`
- `sales_top_suppliers_for_month(month, year?, limit, seller?, taxonomy_path?)`
- `sales_product_summary(product_id, seller?, currency?)`
- `sales_product_timeseries(product_id, start?, end?, seller?, currency?)`
- `sales_sku_timeseries(sku, start?, end?, seller?, currency?)`

RLS:
- All sales tables are admin-only via `public.is_admin()` (based on `partner_user_settings.is_admin`).

## Excel Format

Use one worksheet (default name: `sales`) with headers in row 1.

Required columns:
- `sku`
- `sold_date` (recommended: `YYYY-MM-DD`)
- `units_sold` (integer)
- `revenue` (number)

Optional columns:
- `currency` (defaults to `UNK`)
- `seller` (defaults to `all`)
- `title`
- `supplier_name`
- `google_taxonomy_path` (e.g. `L1 > L2 > L3`)
- `google_taxonomy_l1`, `google_taxonomy_l2`, `google_taxonomy_l3`

Notes:
- Ambiguous dates like `04/05/2024` are rejected. Use `YYYY-MM-DD` or a real Excel date cell.
- If the file contains duplicate `(sku, sold_date, seller, currency)` rows, the importer sums them before writing.

## Scripts

Generate a template Excel file:
```bash
cd /srv/nordexo-hub
npm run sales:template
```
By default this writes to `nordexo-hub/imports/` (gitignored), so you can also place your real sales Excel files there.

Import an Excel file (dry run first):
```bash
cd /srv/nordexo-hub
node scripts/import-sales-excel.mjs /srv/path/to/sales.xlsx --dry-run
node scripts/import-sales-excel.mjs /srv/path/to/sales.xlsx
```

Env needed for import:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE` / `SUPABASE_SERVICE_KEY`)

The importer attempts to load env from:
- `/srv/nordexo-hub/.env.local`
- `/srv/node-tools/.env`
- `/srv/shopify-sync/.env`

## Example Queries

Top SKUs in May 2025:
```sql
select * from public.sales_top_skus_for_month(5, 2025, 100);
```

Top SKUs in a date range:
```sql
select * from public.sales_top_skus_in_range('2025-05-01', '2025-05-31', 100);
```

Top categories in May (all-time):
```sql
select * from public.sales_top_categories_for_month(5);
```

Sales summary for a catalog product:
```sql
select * from public.sales_product_summary('00000000-0000-0000-0000-000000000000'::uuid);
```

Daily sales chart for a catalog product (range optional):
```sql
select * from public.sales_product_timeseries('00000000-0000-0000-0000-000000000000'::uuid, '2025-01-01', '2025-12-31');
```

Category seasonality (month-of-year):
```sql
select *
from public.sales_category_month_of_year
where google_taxonomy_path is not null
order by month asc, units_sold desc;
```
