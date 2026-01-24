# Partner Product Explorer

Partner portal for searching, saving, and exporting catalog products using Fluent UI React v9, Next.js App Router, and Supabase.

## Requirements

- Node.js 18+ (20+ recommended)
- Supabase project that already contains:
  - `catalog_products`
  - `catalog_variants`

## Environment

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Use the existing Supabase URL from `/srv/shopify-sync/.env` and retrieve the anon key from the Supabase project settings.

## Database setup

Run the partner tables + RLS migration:

```
psql "$DATABASE_URL" -f supabase/migrations/0001_partner_portal.sql
```

Or with Supabase CLI:

```
supabase db push
```

## Local development

```
npm install
npm run dev
```

App routes:

- `/login`
- `/app/products`
- `/app/products/[id]`
- `/app/saved`
- `/app/exports`
- `/app/ui-kit`

## Notes

- Fluent UI pages are implemented as client components to avoid App Router SSR pitfalls.
- B2B price uses variant metafield keys listed in `app/api/products/[id]/route.ts`.
- The catalog does not currently expose `created_at`; "Added" filters/columns use `updated_at` as a proxy.
