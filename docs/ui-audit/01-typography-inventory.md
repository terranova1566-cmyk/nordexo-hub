# 01 Typography Inventory

## Scope and method
- Scope: UI frontend only (`app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`), excluding `app/api/**`.
- Files scanned: `54`
- Style blocks scanned:
  - `43` `makeStyles(...)` blocks
  - `106` inline `style={{...}}` blocks
  - `1` CSS file (`app/globals.css`)

## Headline counts
- Unique `font-size` values: `10`
- Unique `font-weight` values: `5`
- Unique `line-height` values: `17`

### Unique values list
- `font-size`: `tokens.fontSizeBase100`, `tokens.fontSizeBase200`, `tokens.fontSizeBase300`, `tokens.fontSizeBase400`, `tokens.fontSizeHero700`, `11px`, `12px`, `14px`, `26px`, `inherit`
- `font-weight`: `tokens.fontWeightRegular`, `tokens.fontWeightSemibold`, `tokens.fontWeightBold`, `600`, `inherit`
- `line-height`: `tokens.lineHeightBase100`, `tokens.lineHeightBase200`, `tokens.lineHeightBase300`, `tokens.lineHeightBase400`, `1`, `1.05`, `1.1`, `1.15`, `1.2`, `1.25`, `1.3`, `1.35`, `1.4`, `1.45`, `14px`, `0`, `inherit`

## Fluent Text `size` prop usage
- Unique `Text size={...}` values: `7`
- Distribution:
  - `200`: 201
  - `100`: 32
  - `700`: 13
  - `300`: 11
  - `600`: 10
  - `500`: 9
  - `400`: 5

## Top typography declarations (count + hotspots)
| Count | Prop | Value | Top usage files |
|---:|---|---|---|
| 111 | `fontSize` | `tokens.fontSizeBase200` | `app/app/digideal-campaigns/page.tsx` (27), `app/app/production/page.tsx` (19), `app/app/discovery/page.tsx` (9) |
| 91 | `fontWeight` | `tokens.fontWeightSemibold` | `app/app/digideal-campaigns/page.tsx` (24), `app/app/production/page.tsx` (15), `app/app/discovery/page.tsx` (11) |
| 79 | `fontSize` | `tokens.fontSizeBase100` | `app/app/digideal-campaigns/page.tsx` (18), `app/app/production/draft-explorer/page.tsx` (15), `app/app/production/page.tsx` (13) |
| 24 | `lineHeight` | `tokens.lineHeightBase100` | `app/app/digideal-campaigns/page.tsx` (10), `app/app/discovery/page.tsx` (6), `app/app/production/draft-explorer/page.tsx` (3) |
| 23 | `fontSize` | `tokens.fontSizeBase300` | `app/app/digideal-campaigns/page.tsx` (7), `app/app/production/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 23 | `fontWeight` | `tokens.fontWeightRegular` | `app/app/products/page.tsx` (6), `app/app/digideal-campaigns/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 22 | `lineHeight` | `tokens.lineHeightBase200` | `app/app/digideal-campaigns/page.tsx` (7), `app/app/production/draft-explorer/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 13 | `lineHeight` | `1.2` | `app/app/production/page.tsx` (9), `app/app/products/page.tsx` (2), `app/app/production/draft-explorer/page.tsx` (1) |
| 10 | `lineHeight` | `tokens.lineHeightBase300` | `app/app/digideal-campaigns/page.tsx` (4), `app/app/production/draft-explorer/page.tsx` (2), `app/app/discovery/page.tsx` (1) |
| 6 | `lineHeight` | `1.1` | `app/app/products/page.tsx` (3), `app/app/saved/page.tsx` (2), `app/app/production/page.tsx` (1) |
| 5 | `lineHeight` | `1.05` | `app/app/digideal-campaigns/page.tsx` (1), `app/app/discovery/page.tsx` (1), `app/app/production/page.tsx` (1) |
| 4 | `fontWeight` | `tokens.fontWeightBold` | `app/app/production/page.tsx` (2), `app/app/digideal-campaigns/page.tsx` (1), `app/app/discovery/page.tsx` (1) |
| 4 | `fontSize` | `tokens.fontSizeHero700` | `app/app/digideal/product-delivery/page.tsx` (1), `app/app/digideal/product-suggestions/page.tsx` (1), `app/app/discovery/amazon/page.tsx` (1) |
| 4 | `lineHeight` | `1.4` | `app/app/email/automations/page.tsx` (1), `app/app/production/page.tsx` (1), `app/app/products/[id]/page.tsx` (1) |
| 4 | `fontWeight` | `600` | `app/app/production/page.tsx` (2), `app/app/products/page.tsx` (1), `components/app-shell.tsx` (1) |
| 3 | `fontSize` | `11px` | `app/app/digideal-campaigns/page.tsx` (1), `app/app/discovery/page.tsx` (1), `app/app/production/page.tsx` (1) |
| 3 | `lineHeight` | `14px` | `app/app/digideal-campaigns/page.tsx` (1), `app/app/discovery/page.tsx` (1), `app/app/production/page.tsx` (1) |
| 3 | `fontSize` | `12px` | `app/app/production/page.tsx` (3) |
| 2 | `fontSize` | `tokens.fontSizeBase400` | `app/app/digideal-campaigns/page.tsx` (1), `app/app/exports/page.tsx` (1) |
| 2 | `lineHeight` | `tokens.lineHeightBase400` | `app/app/digideal-campaigns/page.tsx` (1), `app/app/exports/page.tsx` (1) |

## Typography hotspots (most declarations)
| Declarations | File |
|---:|---|
| 110 | `app/app/digideal-campaigns/page.tsx` |
| 88 | `app/app/production/page.tsx` |
| 50 | `app/app/discovery/page.tsx` |
| 48 | `app/app/production/draft-explorer/page.tsx` |
| 38 | `app/app/products/page.tsx` |
| 22 | `app/app/settings/page.tsx` |

## Near-duplicate and drift findings
- `font-size` drift: token scale is dominant, but raw px still appears (`11px`, `12px`, `14px`, `26px`) in production-heavy screens.
- `line-height` fragmentation is high: token line-heights + many custom unitless values (`1.05` to `1.45`) are mixed in the same pages.
- Heading/body mix is inconsistent: `Text size={200}` dominates almost everything, while headings are split between `Title*`, `Text size={700}`, and `tokens.fontSizeHero700`.

## Initial risk note
- Typography is token-first but not token-only. Most regressions risk comes from large files where token typography and one-off line-height rules are mixed (`digideal-campaigns`, `production`, `draft-explorer`, `discovery`).
