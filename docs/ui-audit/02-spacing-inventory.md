# 02 Spacing Inventory

## Scope and method
- Same scan scope as typography report.
- Total spacing declarations captured: `1124`
- Unique spacing values (normalized): `59`

## Property usage distribution
| Property | Count |
|---|---:|
| `gap` | 596 |
| `padding` | 271 |
| `marginTop` | 48 |
| `paddingRight` | 43 |
| `paddingLeft` | 35 |
| `marginBottom` | 22 |
| `paddingTop` | 19 |
| `paddingInline` | 17 |
| `margin` | 15 |
| `marginLeft` | 15 |
| `paddingBottom` | 15 |
| `paddingBlock` | 12 |
| `rowGap` | 6 |
| `columnGap` | 4 |

## Top spacing declarations (count + hotspots)
| Count | Prop | Value | Top usage files |
|---:|---|---|---|
| 157 | `gap` | `8px` | `app/app/production/draft-explorer/page.tsx` (27), `app/app/digideal-campaigns/page.tsx` (23), `app/app/production/page.tsx` (19) |
| 124 | `gap` | `12px` | `app/app/digideal-campaigns/page.tsx` (16), `app/app/production/draft-explorer/page.tsx` (10), `app/app/settings/page.tsx` (10) |
| 89 | `gap` | `6px` | `app/app/production/draft-explorer/page.tsx` (20), `app/app/digideal-campaigns/page.tsx` (17), `app/app/production/page.tsx` (10) |
| 69 | `gap` | `16px` | `app/app/products/[id]/page.tsx` (7), `app/app/settings/page.tsx` (6), `app/app/shopify/store-settings/page.tsx` (4) |
| 58 | `gap` | `10px` | `app/app/production/draft-explorer/page.tsx` (13), `app/app/digideal-campaigns/page.tsx` (12), `app/app/production/page.tsx` (11) |
| 55 | `padding` | `0` | `app/app/production/draft-explorer/page.tsx` (11), `app/app/digideal-campaigns/page.tsx` (8), `app/app/discovery/page.tsx` (7) |
| 46 | `padding` | `16px` | `app/app/digideal-campaigns/page.tsx` (5), `app/app/production/draft-explorer/page.tsx` (3), `app/app/production/page.tsx` (3) |
| 40 | `gap` | `4px` | `app/app/digideal-campaigns/page.tsx` (10), `app/app/production/page.tsx` (10), `app/app/discovery/page.tsx` (2) |
| 39 | `padding` | `12px` | `app/app/settings/page.tsx` (7), `app/app/digideal-campaigns/page.tsx` (6), `app/app/production/draft-explorer/page.tsx` (6) |
| 26 | `gap` | `2px` | `app/app/digideal-campaigns/page.tsx` (7), `app/app/discovery/page.tsx` (4), `app/app/production/draft-explorer/page.tsx` (3) |
| 17 | `padding` | `8px` | `app/app/digideal-campaigns/page.tsx` (6), `app/app/production/draft-explorer/page.tsx` (4), `app/app/production/page.tsx` (2) |
| 15 | `padding` | `10px 12px` | `app/app/production/page.tsx` (6), `app/app/digideal-campaigns/page.tsx` (4), `app/app/discovery/page.tsx` (2) |
| 14 | `paddingRight` | `0` | `app/app/production/draft-explorer/page.tsx` (7), `app/app/production/page.tsx` (4), `app/app/digideal-campaigns/page.tsx` (1) |
| 13 | `margin` | `0` | `app/app/digideal-campaigns/page.tsx` (3), `app/app/production/draft-explorer/page.tsx` (2), `app/app/production/page.tsx` (2) |
| 10 | `marginLeft` | `auto` | `app/app/production/draft-explorer/page.tsx` (3), `app/app/production/page.tsx` (2), `app/app/products/page.tsx` (2) |
| 10 | `marginTop` | `4px` | `app/app/digideal-campaigns/page.tsx` (2), `app/app/production/bulk-processing/page.tsx` (2), `app/app/products/page.tsx` (2) |
| 10 | `padding` | `10px` | `app/app/production/draft-explorer/page.tsx` (5), `app/app/digideal-campaigns/page.tsx` (1), `app/app/production/bulk-processing/page.tsx` (1) |
| 10 | `marginTop` | `12px` | `app/app/production/draft-explorer/page.tsx` (3), `app/app/settings/page.tsx` (3), `app/app/digideal-campaigns/page.tsx` (1) |
| 10 | `gap` | `20px` | `app/app/production/draft-explorer/page.tsx` (3), `app/app/email/automations/page.tsx` (1), `app/app/email/send/page.tsx` (1) |
| 10 | `paddingLeft` | `0` | `app/app/production/draft-explorer/page.tsx` (7), `app/app/production/page.tsx` (3) |

## Spacing px frequency (normalized)
| Value | Count |
|---|---:|
| `8px` | 235 |
| `12px` | 221 |
| `16px` | 137 |
| `6px` | 132 |
| `10px` | 125 |
| `0px` | 115 |
| `4px` | 88 |
| `2px` | 49 |
| `20px` | 20 |
| `24px` | 14 |
| `14px` | 13 |
| `1px` | 11 |
| `18px` | 8 |

## Near-duplicate / outlier spacing
- Main cluster is healthy: `0, 2, 4, 6, 8, 10, 12, 16, 20, 24`.
- Drift/outlier values currently used: `1, 3, 5, 7, 9, 13, 14, 15, 18, 28, 40, 60, -2`.
- Most drift comes from heavy pages: `app/app/digideal-campaigns/page.tsx`, `app/app/production/draft-explorer/page.tsx`, `app/app/production/page.tsx`, `app/app/discovery/page.tsx`.

## Spacing hotspots (most declarations)
| Declarations | File |
|---:|---|
| 192 | `app/app/production/draft-explorer/page.tsx` |
| 175 | `app/app/digideal-campaigns/page.tsx` |
| 124 | `app/app/production/page.tsx` |
| 67 | `app/app/discovery/page.tsx` |
| 63 | `app/app/products/page.tsx` |
| 62 | `app/app/settings/page.tsx` |

## Initial risk note
- Spacing is dense and mostly consistent at the core scale, but there are enough outlier values to make cross-page rhythm visibly uneven, especially in production-focused tables, popovers, and toolbars.
