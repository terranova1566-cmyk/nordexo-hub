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
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# MXRoute / SMTP sender
MXROUTE_SMTP_HOST=fusion.mxrouting.net
MXROUTE_SMTP_PORT=587
MXROUTE_SMTP_SECURE=false
MXROUTE_SMTP_USER=partner@nordexo.se
MXROUTE_SMTP_PASS=your_smtp_password
PARTNER_EMAIL_FROM=partner@nordexo.se
PARTNER_EMAIL_FROM_NAME=Nordexo - Partner Support

# Public file links
PARTNER_PUBLIC_FILES_BASE_URL=https://files.nordexo.se
PARTNER_PUBLIC_FILES_ROOT=/srv/node-files/exports/public
PARTNER_PUBLIC_LINK_EXPIRY_DAYS=30
PARTNER_PUBLIC_FILE_RETENTION_DAYS=90
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
- `/app/email/send`
- `/app/email/settings`
- `/app/ui-kit`

## Notes

- Fluent UI pages are implemented as client components to avoid App Router SSR pitfalls.
- B2B price uses variant metafield keys listed in `app/api/products/[id]/route.ts`.
- The catalog does not currently expose `created_at`; "Added" filters/columns use `updated_at` as a proxy.
