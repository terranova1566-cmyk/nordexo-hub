# 09 UI Bugs and Inconsistencies Log (Audit Candidates)

This log captures high-confidence UI inconsistencies and likely UX/a11y bugs to validate during implementation phases.

> Refresh notice: use `docs/ui-audit/15-ui-bugs-inconsistencies-refresh-2026-02-18.md` as the current source of truth for latest findings.

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| High | Global nav relies on hover-open menus with zero delay, which can cause accidental opens and unstable pointer UX | `components/app-shell.tsx:411` |
| High | Top-nav research icon hover color is hardcoded (`#6732d3`) and diverges from Fluent token palette | `components/app-shell.tsx:102` |
| High | Draft explorer uses a large custom native context-menu system instead of Fluent menu primitives, increasing behavior/a11y drift | `app/app/production/draft-explorer/page.tsx:10654`, `app/app/production/draft-explorer/page.tsx:10664` |
| High | Very large dialog widths (`min(2200px, 70vw)`) risk viewport/layout instability on smaller displays and scaling contexts | `app/app/production/page.tsx:518`, `app/app/digideal-campaigns/page.tsx:1796` |
| High | Native `<button>` proliferation in production-focused pages causes mixed interaction behavior with Fluent buttons | `app/app/production/draft-explorer/page.tsx` (58 native buttons), `app/app/discovery/page.tsx` (10), `app/app/digideal-campaigns/page.tsx` (9) |
| High | Focus-visible coverage is sparse relative to interaction density (only 9 explicit selectors across the app UI) | `app/app/digideal-campaigns/page.tsx:661`, `app/app/discovery/page.tsx:374`, `app/app/products/page.tsx:262`, `app/app/settings/page.tsx:305`, `app/app/production/draft-explorer/page.tsx:796` |
| Medium | Category hover background is hardcoded (`#f1f1f1`) across multiple pages instead of a shared semantic token | `app/app/discovery/page.tsx:372`, `app/app/products/page.tsx:260`, `app/app/settings/page.tsx:303`, `app/app/digideal-campaigns/page.tsx:659`, `app/app/trend-research/page.tsx:124` |
| Medium | Mixed table systems (Fluent + native `<table>`) in the most critical production flows complicate standardization | `app/app/production/page.tsx:5217`, `app/app/production/draft-explorer/page.tsx:8357`, `app/app/digideal-campaigns/page.tsx:9846` |
| Medium | Inline table-header width styles are scattered in native tables and likely to drift from responsive layout rules | `app/app/production/page.tsx:5220`, `app/app/production/draft-explorer/page.tsx:8379`, `app/app/digideal-campaigns/page.tsx:9849` |
| Medium | Checkbox indicator visuals are force-overridden to white via CSS variable and hex values, bypassing semantic theming | `app/app/production/page.tsx:260` |
| Medium | Supplier status/action buttons in Digideal use a bespoke hardcoded color palette not shared by other pages | `app/app/digideal-campaigns/page.tsx:948`, `app/app/digideal-campaigns/page.tsx:960`, `app/app/digideal-campaigns/page.tsx:991` |
| Medium | MessageBar semantics are inconsistent; many settings errors/success states render with default intent | `app/app/settings/page.tsx:2117`, `app/app/settings/page.tsx:2140`, `app/app/settings/page.tsx:2352`, `app/app/settings/page.tsx:2622` |
| Medium | Typography line-height micro-variants (`1.05`, `1.35`, `1.45`) are concentrated in production pages and reduce consistency | `app/app/production/page.tsx:312`, `app/app/production/page.tsx:299`, `app/app/production/page.tsx:1091`, `app/app/products/page.tsx:473` |
| Medium | Custom popover/menu surface sizing is inconsistent across pages, creating uneven menu density and readability | `components/app-shell.tsx:94`, `app/app/digideal-campaigns/page.tsx:520`, `app/app/digideal-campaigns/page.tsx:531` |

## Validation checklist for later implementation
- Validate keyboard-only navigation on global nav, local action menus, and custom context menus.
- Validate focus ring visibility and consistency in production/discovery pages first.
- Validate responsive behavior for large dialogs and wide table layouts.
- Validate semantic intent consistency for alerts/MessageBars in settings and production workflows.
