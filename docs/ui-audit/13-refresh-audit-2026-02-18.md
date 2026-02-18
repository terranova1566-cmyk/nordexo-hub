# 13 Refresh Audit (2026-02-18)

This is a fresh audit snapshot to keep the inventory current while app work is in progress elsewhere. It is audit-only and includes no UI implementation changes.

## Snapshot metadata
- Generated: `2026-02-18T03:01:06.451Z`
- Scan scope: `app/**`, `components/**` (excluding `app/api/**`, `.next/**`, `node_modules/**`)
- Files scanned: `55`
- Route files scanned: `46`
- New route included in this refresh: `app/app/nx-agents/page.tsx`

## Styling architecture inventory (current)
| Mechanism | Count | Notes |
|---|---:|---|
| `makeStyles(...)` files | 44 | Primary styling mechanism across routes/components |
| Inline `style={{...}}` files | 26 | Concentrated in complex table/workflow pages |
| CSS files | 1 | `app/globals.css` only |
| CSS Modules / SCSS Modules | 0 | None detected |
| styled-components / emotion | 0 | None detected |
| Files with `:hover` styles | 15 | Local interaction overrides are fragmented |
| Files with explicit `:focus-visible` | 5 | Coverage gap remains significant |
| Files with explicit `:active` | 2 | Pressed-state behavior is sparse and custom |

## Typography inventory (current)
- Unique `font-size` values: `11`
- Unique `font-weight` values: `5`
- Unique `line-height` values: `17`
- Fluent `Text size={...}` variants in use: `7` (`100, 200, 300, 400, 500, 600, 700`)

### Top typography declarations (count + hotspots)
| Count | Prop | Value | Top usage files |
|---:|---|---|---|
| 116 | `fontSize` | `tokens.fontSizeBase200` | `app/app/digideal-campaigns/page.tsx` (27), `app/app/production/page.tsx` (19), `app/app/discovery/page.tsx` (9) |
| 93 | `fontWeight` | `tokens.fontWeightSemibold` | `app/app/digideal-campaigns/page.tsx` (24), `app/app/production/page.tsx` (15), `app/app/discovery/page.tsx` (11) |
| 81 | `fontSize` | `tokens.fontSizeBase100` | `app/app/digideal-campaigns/page.tsx` (18), `app/app/production/draft-explorer/page.tsx` (15), `app/app/production/page.tsx` (13) |
| 24 | `lineHeight` | `tokens.lineHeightBase100` | `app/app/digideal-campaigns/page.tsx` (10), `app/app/discovery/page.tsx` (6), `app/app/production/draft-explorer/page.tsx` (3) |
| 23 | `fontSize` | `tokens.fontSizeBase300` | `app/app/digideal-campaigns/page.tsx` (7), `app/app/production/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 23 | `fontWeight` | `tokens.fontWeightRegular` | `app/app/products/page.tsx` (6), `app/app/digideal-campaigns/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 22 | `lineHeight` | `tokens.lineHeightBase200` | `app/app/digideal-campaigns/page.tsx` (7), `app/app/production/draft-explorer/page.tsx` (5), `app/app/discovery/page.tsx` (3) |
| 15 | `lineHeight` | `1.2` | `app/app/production/page.tsx` (9), `app/app/production/draft-explorer/page.tsx` (3), `app/app/products/page.tsx` (2) |
| 10 | `lineHeight` | `tokens.lineHeightBase300` | `app/app/digideal-campaigns/page.tsx` (4), `app/app/production/draft-explorer/page.tsx` (2), `app/app/discovery/page.tsx` (1) |
| 6 | `lineHeight` | `1.1` | `app/app/products/page.tsx` (3), `app/app/saved/page.tsx` (2), `app/app/production/page.tsx` (1) |

### Typographic drift highlights
- Raw text sizes still present: `11px`, `12px`, `14px`, `26px`.
- Line-height micro-variants remain broad (`1.05` through `1.45`), especially in production-focused pages.
- New `nx-agents` introduces `tokens.fontSizeBase500` in local stat cards (`app/app/nx-agents/page.tsx:162`).

## Spacing inventory (current)
- Unique spacing values detected: `62` (includes shorthand combinations)
- Top single-value spacing usage:

| Value | Count |
|---|---:|
| `8px` | 220 |
| `12px` | 190 |
| `16px` | 124 |
| `6px` | 108 |
| `10px` | 102 |
| `0` | 97 |
| `4px` | 78 |
| `2px` | 45 |
| `20px` | 18 |
| `24px` | 12 |

### Spacing drift highlights
- Primary rhythm values are clear (`4/6/8/10/12/16`), but drift remains around `13px`, `14px`, `15px`, `18px`, `28px`, `32px`.
- No `tokens.spacing*` usage detected anywhere; spacing is still raw px-driven.

## Button system audit (current)
- Button tags detected: `438 <Button>` + `5 <ToolbarButton>`
- No shared `AppButton` wrapper found.

### Appearance distribution
| Appearance | Count |
|---|---:|
| `outline` | 149 |
| `primary` | 121 |
| `subtle` | 75 |
| `secondary` | 53 |
| `transparent` | 5 |

### Size usage
- Explicit size usage is sparse and inconsistent (`size="small"` mainly in image-editor and delivery pages).
- Most buttons rely on implicit defaults.

### Button hotspots (by count)
| File | Buttons |
|---|---:|
| `app/app/production/draft-explorer/page.tsx` | 60 |
| `app/app/digideal-campaigns/page.tsx` | 52 |
| `app/app/production/page.tsx` | 34 |
| `app/app/settings/page.tsx` | 26 |
| `app/app/saved/page.tsx` | 24 |
| `app/app/nx-agents/page.tsx` | 9 |

## Color + surface inventory (current)
- Files containing raw hex values: `13`
- Top neutral semantic tokens remain dominant, but hardcoded palettes are still extensive in critical routes.

### Foreground color highlights
| Value | Count |
|---|---:|
| `tokens.colorNeutralForeground3` | 159 |
| `tokens.colorBrandForeground1` | 51 |
| `tokens.colorNeutralForeground1` | 49 |
| `tokens.colorNeutralForeground2` | 49 |
| `tokens.colorStatusDangerForeground1` | 30 |

### Background highlights
| Value | Count |
|---|---:|
| `tokens.colorNeutralBackground1` | 120 |
| `tokens.colorNeutralBackground2` | 72 |
| `tokens.colorNeutralBackground3` | 59 |
| `#ffffff` | 21 |
| `#fafafa` | 10 |

### Radius highlights
| Value | Count |
|---|---:|
| `12px` | 68 |
| `10px` | 50 |
| `var(--app-radius)` | 45 |
| `8px` | 27 |
| `999px` | 22 |

## Interaction state audit (current)
- Files with `:hover`: `15`
- Files with explicit `:focus-visible`: `5`
- Files with `:active`: `2`
- Focus-visible exists in: `app/app/digideal-campaigns/page.tsx`, `app/app/discovery/page.tsx`, `app/app/products/page.tsx`, `app/app/settings/page.tsx`, `app/app/production/draft-explorer/page.tsx`.

## Screenshot refresh artifacts
- Fresh “before” captures: `docs/ui-audit/screenshots/before-refresh-2026-02-18/`
- Manifest: `docs/ui-audit/screenshots/before-refresh-2026-02-18/manifest.json`
- Note: protected routes still redirect to login without session; this is expected during unauthenticated baseline capture.
