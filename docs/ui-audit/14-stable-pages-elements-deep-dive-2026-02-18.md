# 14 Stable Pages and Elements Deep Dive (2026-02-18)

This deep dive focuses on layout/design structure and stable UI elements that are unlikely to be invalidated by in-flight feature work.

## Layout shell map (stable core)
| Shell | Responsibility | Evidence |
|---|---|---|
| Root shell | Global HTML/body, preload overlay, app bootstrap scripts | `app/layout.tsx:17`, `app/layout.tsx:25`, `app/layout.tsx:37` |
| Global style layer | App CSS variables (`--app-*`) and page background gradients | `app/globals.css:1`, `app/globals.css:3`, `app/globals.css:25` |
| Fluent provider | Single app-level `FluentProvider` with `webLightTheme` | `components/providers.tsx:11`, `components/providers.tsx:18` |
| Authenticated app shell | Sticky header, nav menus, language selector, main content wrapper | `components/app-shell.tsx:50`, `components/app-shell.tsx:388`, `components/app-shell.tsx:667` |
| Public auth page | Card-centered login form layout | `app/login/page.tsx:19`, `app/login/page.tsx:27` |
| Public share page | Card-grid selection surface with actions/comments | `app/share/[token]/page.tsx:17`, `app/share/[token]/page.tsx:38` |

## Stable page archetypes
| Archetype | Representative routes | Structural pattern |
|---|---|---|
| Heavy operations dashboard | `app/app/production/page.tsx`, `app/app/production/draft-explorer/page.tsx`, `app/app/digideal-campaigns/page.tsx` | Dense action bars, mixed tables/dialogs, high local style variance |
| Data + form pages | `app/app/products/[id]/page.tsx`, `app/app/settings/page.tsx`, `app/app/orders/page.tsx` | Large form fields + data tables + modal flows |
| Mid-complex utility pages | `app/app/products/pricing/page.tsx`, `app/app/saved/page.tsx`, `app/app/discovery/page.tsx` | Filters + card/table combos |
| Lower-complex pages | `app/app/shopify/store-settings/page.tsx`, `app/app/shopify/webshop-texts/page.tsx`, `app/app/market-trends/page.tsx` | Mostly card/forms and predictable spacing patterns |
| New admin utility page | `app/app/nx-agents/page.tsx` | Card-based sections, native table markup, no inline style blocks |

## Component density snapshot (route-level)
| Route | Total fluent/component tags | Buttons | Fields | Inputs | Menus |
|---|---:|---:|---:|---:|---:|
| `app/app/production/draft-explorer/page.tsx` | 322 | 60 | 15 | 23 | 6 |
| `app/app/digideal-campaigns/page.tsx` | 298 | 52 | 22 | 15 | 8 |
| `app/app/products/[id]/page.tsx` | 219 | 16 | 33 | 62 | 1 |
| `app/app/settings/page.tsx` | 187 | 26 | 21 | 14 | 0 |
| `app/app/production/page.tsx` | 182 | 34 | 13 | 9 | 0 |
| `app/app/nx-agents/page.tsx` | 75 | 9 | 5 | 4 | 0 |

## Stable element findings
### 1) Global navigation and menus remain the highest cross-page standardization lever
- Nine top-level nav menus are configured as hover-open with `hoverDelay={0}`.
- This is centralized in app shell and impacts every authenticated route.
- Evidence: `components/app-shell.tsx:388`, `components/app-shell.tsx:414`, `components/app-shell.tsx:439`, `components/app-shell.tsx:600`.

### 2) “Two token systems” are stable and pervasive
- App-level CSS custom properties (`--app-*`) coexist with Fluent semantic tokens.
- Both are valid, but this split is a recurring source of color/radius/spacing drift.
- Evidence: `app/globals.css:3`, `app/globals.css:9`, `components/providers.tsx:11`, `app/login/page.tsx:31`, `app/app/nx-agents/page.tsx:140`.

### 3) Card + table + form composition is the common page grammar
- Most routes use repeated `Card` + table + action row compositions, making shared component wrappers a low-risk future normalization path.
- Evidence examples:
- `app/app/products/[id]/page.tsx` (high Field/Input density)
- `app/app/orders/page.tsx` (table-heavy)
- `app/app/nx-agents/page.tsx` (modular card sections)

### 4) Native and Fluent interaction controls are mixed in high-risk workflows
- Native `<button>` is still heavily used in large workflow pages, alongside Fluent `Button`.
- Evidence counts: `app/app/production/draft-explorer/page.tsx` (58), `app/app/discovery/page.tsx` (10), `app/app/digideal-campaigns/page.tsx` (9).

## `nx-agents` route-specific notes (new in this refresh)
| Dimension | Observation | Evidence |
|---|---|---|
| Layout | Clean card-stack layout with predictable sectioning | `app/app/nx-agents/page.tsx:117`, `app/app/nx-agents/page.tsx:526` |
| Typography | Mostly token-based with one higher stat scale (`Base500`) | `app/app/nx-agents/page.tsx:162` |
| Spacing | Raw px values (`8/10/12/16`) without spacing tokens | `app/app/nx-agents/page.tsx:121`, `app/app/nx-agents/page.tsx:145`, `app/app/nx-agents/page.tsx:221` |
| Buttons | Uses `primary` + `secondary`, no explicit size system | `app/app/nx-agents/page.tsx:679`, `app/app/nx-agents/page.tsx:686` |
| Interaction states | No explicit local `:hover/:focus-visible` overrides | No selector matches in route file |

## Stable-page priority for future page-by-page standardization
1. `components/app-shell.tsx` (single highest leverage for menus/buttons/header spacing)
2. `app/app/production/page.tsx`
3. `app/app/production/draft-explorer/page.tsx`
4. `app/app/digideal-campaigns/page.tsx`
5. `app/app/discovery/page.tsx`
6. `app/app/products/page.tsx`
7. `app/app/settings/page.tsx`
8. `app/app/nx-agents/page.tsx`

These remain suitable for handbook-driven enforcement later, even if feature work continues in parallel.
