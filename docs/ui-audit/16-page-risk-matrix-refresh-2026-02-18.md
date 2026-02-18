# 16 Page Risk Matrix Refresh (2026-02-18)

This matrix is an **auto-scored refresh** from current source metrics (not a visual redesign plan). It is intended to prioritize where standardization work should start.

## Scoring model (0-5 per dimension)
- `Spacing`: thresholds from raw spacing-px density per route
- `Font`: thresholds from typography token/property density per route
- `Colors`: thresholds from color token/property density per route
- `Buttons`: thresholds from button count per route
- `Menus`: thresholds from menu component density per route
- `Focus-gap`: flagged when route has 8+ buttons and no explicit `:focus-visible` in file

## Top routes by total risk score

| Route | Total | Risk | Spacing | Font | Colors | Buttons | Menus | Focus-gap | Raw px refs | Button count | Menu count |
|---|---:|---|---:|---:|---:|---:|---:|---|---:|---:|---:|
| `app/app/digideal-campaigns/page.tsx` | 25 | Critical | 5 | 5 | 5 | 5 | 5 | No | 434 | 52 | 54 |
| `app/app/production/draft-explorer/page.tsx` | 24 | Critical | 5 | 4 | 5 | 5 | 5 | No | 396 | 60 | 48 |
| `app/app/production/page.tsx` | 19 | High | 4 | 4 | 5 | 4 | 2 | Yes | 291 | 34 | 4 |
| `app/app/discovery/page.tsx` | 17 | High | 3 | 4 | 4 | 3 | 3 | No | 140 | 14 | 13 |
| `app/app/settings/page.tsx` | 16 | High | 3 | 3 | 3 | 4 | 3 | No | 108 | 26 | 12 |
| `app/app/products/page.tsx` | 15 | High | 3 | 3 | 3 | 3 | 3 | No | 109 | 19 | 19 |
| `app/app/saved/page.tsx` | 12 | Medium | 2 | 2 | 2 | 3 | 3 | Yes | 40 | 24 | 13 |
| `app/app/products/[id]/page.tsx` | 11 | Medium | 2 | 1 | 2 | 3 | 3 | Yes | 64 | 16 | 12 |
| `app/app/ui-kit/page.tsx` | 11 | Medium | 2 | 1 | 2 | 3 | 3 | Yes | 41 | 19 | 15 |
| `app/app/production/bulk-processing/page.tsx` | 9 | Low | 2 | 1 | 2 | 3 | 1 | Yes | 57 | 20 | 2 |
| `app/app/my-lists/page.tsx` | 8 | Low | 2 | 2 | 2 | 2 | 0 | No | 37 | 7 | 0 |
| `app/app/nx-agents/page.tsx` | 8 | Low | 2 | 2 | 2 | 2 | 0 | Yes | 36 | 9 | 0 |
| `app/app/orders/page.tsx` | 7 | Low | 2 | 1 | 2 | 2 | 0 | No | 61 | 7 | 0 |
| `app/app/shopify/store-settings/page.tsx` | 7 | Low | 2 | 1 | 1 | 1 | 2 | No | 42 | 2 | 5 |
| `app/app/products/pricing/page.tsx` | 7 | Low | 1 | 1 | 1 | 3 | 1 | Yes | 27 | 15 | 2 |
| `app/app/products/batch-image-editor/[batchId]/edit/page.tsx` | 6 | Low | 1 | 1 | 1 | 2 | 1 | Yes | 25 | 9 | 1 |
| `app/app/shopify/webshop-texts/page.tsx` | 6 | Low | 1 | 1 | 1 | 1 | 2 | No | 21 | 3 | 5 |
| `app/app/b2b/candidates/[id]/page.tsx` | 6 | Low | 1 | 0 | 1 | 2 | 2 | Yes | 20 | 10 | 9 |
| `app/app/b2b/projects/[id]/page.tsx` | 6 | Low | 1 | 0 | 0 | 3 | 2 | Yes | 17 | 13 | 7 |
| `app/app/orders/resend/page.tsx` | 5 | Minimal | 2 | 1 | 1 | 1 | 0 | No | 41 | 2 | 0 |
| `app/app/trend-research/page.tsx` | 5 | Minimal | 1 | 1 | 1 | 1 | 1 | No | 26 | 4 | 3 |
| `app/app/email/automations/page.tsx` | 5 | Minimal | 1 | 1 | 1 | 1 | 1 | No | 17 | 3 | 3 |
| `app/app/discovery/amazon/page.tsx` | 5 | Minimal | 1 | 1 | 0 | 2 | 1 | No | 13 | 6 | 1 |
| `app/app/digideal/product-suggestions/page.tsx` | 4 | Minimal | 1 | 1 | 1 | 1 | 0 | No | 16 | 3 | 0 |
| `app/share/[token]/page.tsx` | 4 | Minimal | 1 | 1 | 1 | 1 | 0 | No | 16 | 4 | 0 |
| `app/app/orders/import/page.tsx` | 4 | Minimal | 1 | 1 | 1 | 1 | 0 | No | 15 | 2 | 0 |
| `app/app/email/settings/page.tsx` | 4 | Minimal | 1 | 0 | 0 | 2 | 1 | No | 14 | 6 | 3 |
| `app/app/email/send/page.tsx` | 3 | Minimal | 1 | 0 | 0 | 1 | 1 | No | 11 | 4 | 2 |
| `app/app/products/batch-image-editor/page.tsx` | 3 | Minimal | 1 | 0 | 1 | 1 | 0 | No | 11 | 2 | 0 |
| `app/app/market-trends/page.tsx` | 3 | Minimal | 1 | 1 | 0 | 0 | 1 | No | 10 | 0 | 3 |

## Dimension averages (46 routes)

| Dimension | Avg score |
|---|---:|
| Spacing | 1.22 |
| Font | 1.02 |
| Colors | 1.11 |
| Buttons | 1.63 |
| Menus | 1.07 |

## Focus-gap routes (high interaction, no explicit local focus-visible)

| Route | Total | Buttons | Menus |
|---|---:|---:|---:|
| `app/app/production/page.tsx` | 19 | 34 | 4 |
| `app/app/saved/page.tsx` | 12 | 24 | 13 |
| `app/app/products/[id]/page.tsx` | 11 | 16 | 12 |
| `app/app/ui-kit/page.tsx` | 11 | 19 | 15 |
| `app/app/production/bulk-processing/page.tsx` | 9 | 20 | 2 |
| `app/app/nx-agents/page.tsx` | 8 | 9 | 0 |
| `app/app/products/pricing/page.tsx` | 7 | 15 | 2 |
| `app/app/products/batch-image-editor/[batchId]/edit/page.tsx` | 6 | 9 | 1 |
| `app/app/b2b/candidates/[id]/page.tsx` | 6 | 10 | 9 |
| `app/app/b2b/projects/[id]/page.tsx` | 6 | 13 | 7 |

## Notes
- This refresh includes `app/app/nx-agents/page.tsx` and current in-repo style/state usage.
- Use this matrix for implementation batching, not for visual redesign decisions.
