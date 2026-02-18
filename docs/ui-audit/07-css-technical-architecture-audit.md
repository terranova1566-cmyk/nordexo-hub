# 07 CSS and Technical Architecture Audit

## Styling stack inventory
| Technique | Count | Where |
|---|---:|---|
| Fluent `makeStyles` | 43 files | Main style mechanism across UI pages |
| Inline style blocks (`style={{...}}`) | 106 blocks in 26 files | Mainly in complex production/discovery flows |
| Global CSS | 1 file | `app/globals.css` |
| CSS Modules / SCSS Modules | 0 | Not used |
| Emotion / styled-components / `mergeStyles` | 0 | Not used |
| Fluent `shorthands` | 0 | Not used |

## Theme setup
- Single provider: `components/providers.tsx`
- Theme source: `webLightTheme`
- Customization currently applied: font family only
- Missing architecture element: no centralized app-specific semantic token layer (for spacing, typography aliases, button variants, surfaces)

## Token adoption vs local overrides

### Typography token adoption
- `fontSize` declarations: 228 total, 219 token-based
- `fontWeight` declarations: 123 total, 118 token-based
- `lineHeight` declarations: 105 total, 58 token-based, 47 literal/custom

### Color token adoption
- Color declarations total: 1158
- Token-based: 844
- Literal values: 310
- `var(--...)`: 4

### Interpretation
- Architecture is token-aware but not token-governed.
- Inconsistency comes from local page-level exceptions, not from absence of Fluent primitives.

## Style concentration hotspots
| Area | Evidence |
|---|---|
| Typography concentration | `app/app/digideal-campaigns/page.tsx` (110), `app/app/production/page.tsx` (88), `app/app/discovery/page.tsx` (50) |
| Spacing concentration | `app/app/production/draft-explorer/page.tsx` (192), `app/app/digideal-campaigns/page.tsx` (175), `app/app/production/page.tsx` (124) |
| Color concentration | `app/app/digideal-campaigns/page.tsx` (285), `app/app/production/draft-explorer/page.tsx` (173), `app/app/production/page.tsx` (165) |

## Structural architecture findings

### 1) Component-level style ownership is too fragmented
- Large pages own their own mini design systems.
- Example pages with many local button and surface variants:
  - `app/app/digideal-campaigns/page.tsx`
  - `app/app/production/draft-explorer/page.tsx`
  - `app/app/production/page.tsx`

### 2) Shared primitives are underutilized
- No `AppButton`, no semantic text wrapper, no centralized layout spacing helpers.
- Result: repeated local class names for similar UI concepts (`categoryNavButton`, `rangeButton`, `linkButton`, etc.) across pages.

### 3) Inline style usage bypasses style-system controls
- Highest inline-style pages:
  - `app/app/production/draft-explorer/page.tsx` (35)
  - `app/app/b2b/candidates/[id]/page.tsx` (10)
  - `app/app/discovery/page.tsx` (8)
  - `app/app/discovery/amazon/page.tsx` (6)

### 4) Semantic feedback layer is inconsistent
- `MessageBar` intents are mixed and often omitted (`36` default-intent uses out of `88` total).
- Most concentrated default-intent usage is in settings flow:
  - `app/app/settings/page.tsx` (25 default-intent bars)

### 5) Accessibility interaction styles are sparse
- Explicit `:focus-visible` selectors found in only 5 files:
  - `app/app/digideal-campaigns/page.tsx`
  - `app/app/discovery/page.tsx`
  - `app/app/products/page.tsx`
  - `app/app/settings/page.tsx`
  - `app/app/production/draft-explorer/page.tsx`
- Many high-interaction pages have no explicit focus-visible treatment.

## Architecture-level risks
| Risk | Impact |
|---|---|
| Local style duplication | Slow, error-prone page-by-page polish and higher regression surface |
| Literal color drift | Inconsistent contrast/state signaling and weak theming discipline |
| Mixed control stacks | Inconsistent keyboard/focus/hover behaviors |
| No semantic token layer | Hard to enforce spacing/font/button/menu handbook automatically |

## Audit conclusion
The existing CSS/Fluent architecture can support standardization without redesign, but it needs a strict token/control abstraction layer before refactoring page internals. The largest technical debt is concentrated in a small set of high-complexity pages rather than spread uniformly across the app.
