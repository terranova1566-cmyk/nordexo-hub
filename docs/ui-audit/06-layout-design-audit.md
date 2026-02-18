# 06 Layout and Design Audit (Deep Dive)

## Scope
- UI routes and shared UI components only.
- Includes route-level structure, layout shells, density/complexity hotspots, and responsive risk patterns.

## Layout shell model
| Shell | File | Notes |
|---|---|---|
| Root shell | `app/layout.tsx` | Hosts preload overlay and global providers |
| Authenticated app shell | `app/app/layout.tsx`, `components/app-shell.tsx` | Sticky header + menu nav + padded content area |
| Public/auth shell | `app/login/page.tsx`, `app/share/[token]/page.tsx` | Standalone cards/pages outside authenticated nav |

## Route structure inventory
- Total route pages: `46`
- Redirect-only routes:
  - `app/page.tsx`
  - `app/app/b2b/page.tsx`
  - `app/app/digideal/page.tsx`
  - `app/app/digideal/deals-manager/page.tsx` (re-export)
- Server redirect resolver route:
  - `app/app/products/spu/[spu]/page.tsx`

## Page complexity risk matrix
(Score combines size, inline styles, hardcoded colors, native button usage, custom button classes, and focus-visible gaps.)

| Route file | Score | Lines | Inline styles | Hardcoded colors | Native `<button>` | Custom `*Button*` classes | `:focus-visible` | MessageBars | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `app/app/production/draft-explorer/page.tsx` | 11 | 11712 | 35 | 27 | 58 | 19 | 2 | 0 | high-risk, mixed button stack, inline styles, hardcoded palette heavy, complex controls |
| `app/app/production/page.tsx` | 10 | 6550 | 5 | 32 | 2 | 13 | 0 | 10 | high-risk, focus-visible gap, dense feedback states |
| `app/app/digideal-campaigns/page.tsx` | 9 | 10067 | 5 | 105 | 9 | 23 | 2 | 12 | high-risk, hardcoded palette heavy |
| `app/app/discovery/page.tsx` | 7 | 3530 | 8 | 7 | 10 | 7 | 1 | 2 | mixed buttons + inline styles |
| `app/app/products/page.tsx` | 7 | 2512 | 2 | 1 | 4 | 10 | 2 | 2 | mixed buttons, custom button classes |
| `app/app/settings/page.tsx` | 6 | 3454 | 0 | 9 | 1 | 3 | 2 | 26 | very dense settings/admin UI |
| `app/app/products/[id]/page.tsx` | 6 | 2994 | 0 | 3 | 0 | 3 | 0 | 7 | form-heavy with focus-visible gap |

## Design/structure observations by pattern

### Pattern A: Data-grid operations (highest complexity)
- Primary pages:
  - `app/app/production/draft-explorer/page.tsx`
  - `app/app/production/page.tsx`
  - `app/app/digideal-campaigns/page.tsx`
- Characteristics:
  - Very large local style objects and many local UI variants.
  - Frequent inline width overrides and hybrid table implementations.
  - Extensive local interaction logic (custom menus, split actions, status badges).

### Pattern B: Filter-and-card browse pages
- Primary pages:
  - `app/app/discovery/page.tsx`
  - `app/app/products/page.tsx`
  - `app/app/saved/page.tsx`
- Characteristics:
  - Heavy filter controls and conditional action states.
  - Mixed usage of Fluent controls and native buttons.
  - Several layout nudges (`marginTop: -2px`, one-off paddings).

### Pattern C: Admin/settings forms
- Primary pages:
  - `app/app/settings/page.tsx`
  - `app/app/shopify/store-settings/page.tsx`
  - `app/app/shopify/webshop-texts/page.tsx`
- Characteristics:
  - Many stacked cards/sections.
  - High MessageBar density and mixed intent semantics.
  - Tab/dropdown controls with local spacing/radius variance.

## Layout risk hotspots (with file references)
| Issue | Evidence |
|---|---|
| Very large overlay widths | `app/app/production/page.tsx:518`, `app/app/production/page.tsx:519`, `app/app/digideal-campaigns/page.tsx:1796`, `app/app/digideal-campaigns/page.tsx:1797` |
| Extra-wide page/dialog surfaces | `app/app/discovery/page.tsx:782`, `app/app/products/page.tsx:139`, `app/app/production/draft-explorer/page.tsx:925` |
| Native table + inline header widths | `app/app/production/page.tsx:5217`, `app/app/production/draft-explorer/page.tsx:8357`, `app/app/digideal-campaigns/page.tsx:9846` |
| Heavy inline style dependence | `app/app/production/draft-explorer/page.tsx` (35 inline style blocks), `app/app/b2b/candidates/[id]/page.tsx` (10), `app/app/discovery/page.tsx` (8) |

## Screenshot baseline
- Baseline screenshot set exists under `docs/ui-audit/screenshots/before/`.
- Manifest with final URLs and redirects: `docs/ui-audit/screenshots/before/manifest.json`.
- Current visual capture limitation: protected `/app/*` routes redirect to login when no authenticated session exists.
