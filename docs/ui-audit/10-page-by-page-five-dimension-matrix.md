# 10 Page-by-Page Five-Dimension Matrix

This matrix scores each route for the five standardization dimensions:
`Spacing`, `Font Size`, `Colors`, `Buttons`, `Menus` (0 = no visible debt, 5 = highest debt).

> Refresh notice: for the latest route scoring snapshot (including `nx-agents`), use `docs/ui-audit/16-page-risk-matrix-refresh-2026-02-18.md`.

## Scoring legend
- `5`: major fragmentation / many local overrides
- `4`: high inconsistency with notable risk
- `3`: moderate inconsistency
- `2`: low inconsistency
- `1`: minor inconsistency
- `0`: little or no visible inconsistency

## Route matrix

| Route file | Total | Risk | Spacing | Font Size | Colors | Buttons | Menus | Focus-visible gap |
|---|---:|---|---:|---:|---:|---:|---:|---|
| `app/app/production/draft-explorer/page.tsx` | 21 | Critical | 4 | 3 | 4 | 5 | 5 | No |
| `app/app/digideal-campaigns/page.tsx` | 20 | Critical | 3 | 2 | 5 | 5 | 5 | No |
| `app/app/production/page.tsx` | 20 | Critical | 2 | 5 | 4 | 4 | 4 | Yes |
| `app/app/discovery/page.tsx` | 14 | High | 2 | 2 | 2 | 4 | 4 | No |
| `app/app/products/page.tsx` | 12 | High | 1 | 3 | 1 | 3 | 4 | No |
| `app/app/settings/page.tsx` | 10 | Medium | 2 | 0 | 2 | 2 | 4 | No |
| `app/app/products/[id]/page.tsx` | 10 | Medium | 1 | 2 | 1 | 2 | 3 | Yes |
| `app/app/production/bulk-processing/page.tsx` | 8 | Medium | 2 | 0 | 0 | 2 | 3 | Yes |
| `app/app/saved/page.tsx` | 8 | Medium | 0 | 2 | 0 | 2 | 3 | Yes |
| `app/app/products/batch-image-editor/[batchId]/edit/page.tsx` | 8 | Medium | 2 | 0 | 3 | 0 | 2 | Yes |
| `app/app/ui-kit/page.tsx` | 7 | Low | 1 | 1 | 0 | 0 | 4 | Yes |
| `app/app/products/pricing/page.tsx` | 6 | Low | 0 | 0 | 0 | 2 | 3 | Yes |
| `app/app/email/automations/page.tsx` | 6 | Low | 1 | 1 | 0 | 1 | 3 | No |
| `app/app/my-lists/page.tsx` | 4 | Low | 0 | 0 | 0 | 3 | 0 | Yes |
| `app/app/b2b/candidates/[id]/page.tsx` | 4 | Low | 0 | 0 | 0 | 0 | 3 | Yes |
| `app/app/trend-research/page.tsx` | 4 | Low | 0 | 0 | 1 | 0 | 3 | No |
| `app/app/b2b/projects/[id]/page.tsx` | 4 | Low | 0 | 0 | 0 | 0 | 3 | Yes |
| `app/app/shopify/store-settings/page.tsx` | 4 | Low | 0 | 0 | 0 | 0 | 4 | No |
| `app/app/email/settings/page.tsx` | 4 | Low | 0 | 0 | 0 | 0 | 3 | Yes |
| `app/app/email/send/page.tsx` | 4 | Low | 1 | 0 | 0 | 0 | 3 | No |
| `app/app/discovery/amazon/page.tsx` | 3 | Minimal | 0 | 0 | 0 | 0 | 2 | Yes |
| `app/app/shopify/webshop-texts/page.tsx` | 3 | Minimal | 0 | 0 | 0 | 0 | 3 | No |
| `app/app/market-trends/page.tsx` | 3 | Minimal | 0 | 0 | 0 | 0 | 3 | No |
| `app/app/b2b/projects/page.tsx` | 3 | Minimal | 0 | 0 | 0 | 1 | 2 | No |
| `app/app/orders/page.tsx` | 2 | Minimal | 0 | 0 | 0 | 1 | 0 | Yes |
| `app/app/exports/page.tsx` | 2 | Minimal | 0 | 0 | 0 | 2 | 0 | No |
| `app/app/b2b/imports/page.tsx` | 2 | Minimal | 0 | 0 | 0 | 0 | 2 | No |
| `app/app/products/batch-image-editor/page.tsx` | 1 | Minimal | 1 | 0 | 0 | 0 | 0 | No |
| `app/app/digideal/product-suggestions/page.tsx` | 1 | Minimal | 0 | 0 | 1 | 0 | 0 | No |
| `app/app/b2b/lookbooks/page.tsx` | 1 | Minimal | 0 | 0 | 0 | 1 | 0 | No |
| `app/app/b2b/customers/page.tsx` | 1 | Minimal | 0 | 0 | 0 | 1 | 0 | No |
| `app/app/b2b/customers/[id]/page.tsx` | 1 | Minimal | 0 | 0 | 0 | 1 | 0 | No |
| `app/app/b2b/tasks/page.tsx` | 1 | Minimal | 0 | 0 | 0 | 1 | 0 | No |
| `app/app/orders/resend/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/b2b/lookbooks/[id]/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/orders/import/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/b2b/share-links/[id]/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/digideal/product-delivery/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/products/spu/[spu]/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/b2b/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/digideal/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |
| `app/app/digideal/deals-manager/page.tsx` | 0 | Minimal | 0 | 0 | 0 | 0 | 0 | No |

## Top priority pages (by total score)

| Rank | Route file | Total | Notes |
|---:|---|---:|---|
| 1 | `app/app/production/draft-explorer/page.tsx` | 21 | color fragmentation, button-system drift, menu complexity, spacing outliers |
| 2 | `app/app/digideal-campaigns/page.tsx` | 20 | color fragmentation, button-system drift, menu complexity |
| 3 | `app/app/production/page.tsx` | 20 | color fragmentation, button-system drift, menu complexity, font/line-height drift, focus-visible gap |
| 4 | `app/app/discovery/page.tsx` | 14 | button-system drift, menu complexity |
| 5 | `app/app/products/page.tsx` | 12 | menu complexity |
| 6 | `app/app/settings/page.tsx` | 10 | menu complexity |
| 7 | `app/app/products/[id]/page.tsx` | 10 | focus-visible gap |
| 8 | `app/app/production/bulk-processing/page.tsx` | 8 | focus-visible gap |
| 9 | `app/app/saved/page.tsx` | 8 | focus-visible gap |
| 10 | `app/app/products/batch-image-editor/[batchId]/edit/page.tsx` | 8 | focus-visible gap |

## Dimension aggregates

| Dimension | Avg score |
|---|---:|
| Spacing | 0.53 |
| Font Size | 0.49 |
| Colors | 0.56 |
| Buttons | 1.00 |
| Menus | 1.81 |

## Metric basis
- Generated from static style/component scan + route structure analysis.
- Focus-visible gap flag means high interaction count with no explicit `:focus-visible` styles in that file.
- Detailed per-page notes are in `docs/ui-audit/11-priority-page-audit-notes.md`.
