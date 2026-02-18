# 04 Components Inventory (Buttons, Inputs, Cards, Tables)

## Styling architecture inventory

### Where styles live
| Source | Count | Notes |
|---|---:|---|
| `makeStyles(...)` in TSX | 43 files | Primary styling mechanism across app pages and shared components |
| Inline `style={{...}}` | 26 files (`106` inline style blocks) | Concentrated in large feature pages |
| Global CSS | 1 file (`app/globals.css`) | Base vars, body gradient/background, default typography |
| CSS Modules / SCSS Modules | 0 | Not used |
| `styled-components` / `@emotion` / `mergeStyles` | 0 | Not used |
| Fluent `shorthands` API | 0 | Not used |

### Fluent theme usage
- Single theme provider exists in `components/providers.tsx` using `FluentProvider` + `webLightTheme` override (font family only).
- No centralized custom token layer yet (many page-local style choices).

## Key layout shells and page structure

### Shells
- Root layout: `app/layout.tsx`
- App shell wrapper: `app/app/layout.tsx` -> `components/app-shell.tsx`
- App shell characteristics: sticky header/nav, toolbar actions, consistent content wrapper (`padding: 24px 32px 40px`)
- Public/auth shells:
  - Login: `app/login/page.tsx`
  - Share page: `app/share/[token]/page.tsx`

### Route inventory
- Total UI routes (`page.tsx`): `46`
- High-complexity pages by LOC:
  - `app/app/production/draft-explorer/page.tsx` (`11712`)
  - `app/app/digideal-campaigns/page.tsx` (`10067`)
  - `app/app/production/page.tsx` (`6550`)
  - `app/app/discovery/page.tsx` (`3530`)
  - `app/app/settings/page.tsx` (`3454`)

### Page complexity snapshot (top 10)
| Page | Lines | Button | Card | Table | Field | Input | Dialog | Dropdown |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `app/app/production/draft-explorer/page.tsx` | 11712 | 60 | 3 | 5 | 15 | 23 | 9 | 0 |
| `app/app/digideal-campaigns/page.tsx` | 10067 | 52 | 2 | 1 | 22 | 15 | 8 | 7 |
| `app/app/production/page.tsx` | 6550 | 34 | 1 | 1 | 13 | 9 | 7 | 4 |
| `app/app/discovery/page.tsx` | 3530 | 14 | 2 | 0 | 12 | 7 | 2 | 5 |
| `app/app/settings/page.tsx` | 3454 | 26 | 11 | 2 | 21 | 14 | 3 | 5 |
| `app/app/products/[id]/page.tsx` | 2994 | 16 | 3 | 3 | 33 | 62 | 2 | 0 |
| `app/app/products/page.tsx` | 2512 | 19 | 2 | 2 | 15 | 7 | 2 | 3 |
| `app/app/products/pricing/page.tsx` | 1795 | 15 | 4 | 4 | 12 | 20 | 0 | 2 |
| `app/app/orders/page.tsx` | 1598 | 7 | 2 | 3 | 11 | 14 | 1 | 0 |
| `app/app/production/bulk-processing/page.tsx` | 1342 | 20 | 4 | 3 | 2 | 1 | 2 | 0 |

## Buttons audit

### Current button components in use
| Component | Instances | Primary files |
|---|---:|---|
| Fluent `<Button>` | 428 | `production/draft-explorer`, `digideal-campaigns`, `production`, `settings`, `saved` |
| Fluent `<ToolbarButton>` | 5 | `components/app-shell.tsx`, `app/app/ui-kit/page.tsx` |
| Native `<button>` | 91 | `production/draft-explorer` (58), `discovery` (10), `digideal-campaigns` (9), `my-lists` (5) |

- Shared wrapper like `AppButton`: **not present** (buttons are direct component usage + local class styles).

### Fluent button appearance usage
| Appearance | Count |
|---|---:|
| `outline` | 149 |
| `primary` | 117 |
| `subtle` | 75 |
| `secondary` | 48 |
| `transparent` | 5 |
| default/no appearance prop | 15 |
| dynamic expression appearances | 24 |

### Button size usage
| Size | Count |
|---|---:|
| default | 357 |
| `small` | 73 |
| `medium` | 3 |

### Disabled usage
- Buttons with explicit `disabled` prop: `146`
- Buttons without explicit `disabled`: `287`

### Custom button styling footprint
- Custom button classes (class name includes `Button`): `105`
- Custom button classes with:
  - `:hover`: `44`
  - `:active`: `7`
  - `:focus-visible`: `1`
  - explicit disabled styling: `12`
  - hardcoded colors in class block: `14`

### Button style hotspots
| Custom button classes | File |
|---:|---|
| 23 | `app/app/digideal-campaigns/page.tsx` |
| 19 | `app/app/production/draft-explorer/page.tsx` |
| 13 | `app/app/production/page.tsx` |
| 10 | `app/app/products/page.tsx` |
| 7 | `app/app/discovery/page.tsx` |

### Hover/focus/disabled behavior patterns (current)
- Fluent-default behavior: common for standard `primary/secondary/outline/subtle` buttons.
- Custom hover overrides: frequent in production pages (many `backgroundColor`/`border` swaps).
- Focus-visible: sparse and inconsistent. Some controls use `2px` brand outline (`tokens.colorBrandStroke1`), others use `tokens.colorStrokeFocus2`, many have no explicit focus styling.
- Disabled: several custom classes force nonstandard visuals (including fixed opacity and custom background) rather than relying on Fluent defaults.

## Inputs, cards, tables, overlays audit

### Component usage totals
| Component | Count |
|---|---:|
| `Field` | 235 |
| `Input` | 218 |
| `Card` | 131 |
| `Table` | 59 |
| `Dialog` | 49 |
| `Dropdown` | 47 |
| `Textarea` | 44 |
| `Popover` | 26 |
| `Tooltip` | 15 |
| `Drawer` | 1 |

### Tables
- Fluent `Table` usage: `59`
- Native `<table>` usage: `3`
  - `app/app/production/page.tsx`
  - `app/app/production/draft-explorer/page.tsx`
  - `app/app/digideal-campaigns/page.tsx`

### Forms
- Form-heavy pages: `products/[id]`, `settings`, `products`, `products/pricing`, `orders`, `digideal-campaigns`.
- Pattern: mostly Fluent `Field + Input`, but with many page-local spacing and validation display styles.

### Overlays
- Dialogs are broadly used; Drawer appears only in UI kit demo route.
- Many overlay surfaces have local width rules (`min(980px,...)`, `min(2200px,...)`) in production pages.

## Interaction states audit

### Style selector counts (explicit)
| State selector | Count |
|---|---:|
| `:hover` | 109 |
| `:active` | 10 |
| `:focus-visible` | 9 |
| `:focus` / `:focus-within` | 6 |
| `:disabled` / disabled selectors | 15 |
| selected selectors (`data-active`/`aria-selected`) | 2 |

### Observed pattern quality
- Hover states are widespread but implemented with many local variants.
- Focus-visible states are underrepresented relative to button/control count.
- Selected-state styling is mainly nav-specific and not standardized.

## Error-state patterns
- `MessageBar` usage total: `88`
- Intents:
  - default (no `intent`): `36`
  - `error`: `35`
  - `warning`: `4`
  - `success`: `4`
  - `info`: `4`
  - dynamic intent (`message.type`, etc.): `5`
- The largest default-intent concentration is `app/app/settings/page.tsx` (25), which makes semantic severity less consistent.

## Baseline screenshots (before)
- Saved under `docs/ui-audit/screenshots/before`
- Manifest: `docs/ui-audit/screenshots/before/manifest.json`
- Current limitation from baseline capture:
  - Protected `/app/*` routes redirect to login when unauthenticated
  - `/share/demo-token` renders page shell but API data returns 404 for demo token
