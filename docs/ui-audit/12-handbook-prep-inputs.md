# 12 Handbook Prep Inputs (Not the Handbook)

This document defines the audit-derived inputs that the future strict UI handbook must include. It is intentionally not the handbook itself.

## Required handbook sections (to be authored later)
1. Spacing standard
2. Font-size/typography standard
3. Color and surface standard
4. Button standard
5. Menu/navigation standard

## Required handbook metadata
- Version and effective date
- Applies-to scope (routes/components)
- Exception process (who can approve, how to document)
- Verification checklist and definition of done

## Required per-section structure
Each section should include:
- Canonical token/variant table
- Allowed values and prohibited values
- Interaction state rules (hover/active/focus-visible/disabled)
- Accessibility constraints
- Examples and anti-examples

## Audit-derived constraints to carry forward

### Spacing
- Core scale should include: `0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32`.
- Outlier values currently present (must be exception-only in handbook): `1, 3, 5, 7, 9, 13, 14, 15, 18, 28, 40, 60, -2`.

### Typography
- Four required text aliases requested by product direction:
  - `textBig`
  - `textNormal`
  - `textSmall`
  - `textMini`
- Handbook must define explicit size + line-height + default weight mapping for each.

### Colors
- Base should map to Fluent semantic tokens.
- Handbook must define policy for hardcoded colors (default disallow + exception mechanism).
- Status colors need semantic mapping (danger/warning/success/info) across badges, alerts, and action states.

### Buttons
- Must define canonical variants and sizes.
- Must define one focus-visible style system-wide.
- Must define rules for native `<button>` usage vs Fluent button usage.

### Menus
- Must define when hover-open is allowed vs click-open required.
- Must define a single pattern for context menus and nested menus.
- Must standardize menu surface sizing and item density.

## Per-page evaluation template (for future checks)
Use this template for every implementation PR:

| Dimension | Pass/Fail | Evidence |
|---|---|---|
| Spacing |  |  |
| Font size |  |  |
| Colors |  |  |
| Buttons |  |  |
| Menus |  |  |
| Focus-visible |  |  |
| Alert semantics |  |  |

## Pre-handbook baseline references
- `docs/ui-audit/10-page-by-page-five-dimension-matrix.md`
- `docs/ui-audit/11-priority-page-audit-notes.md`
- `docs/ui-audit/09-ui-bugs-and-inconsistencies-log.md`
- `docs/ui-audit/13-refresh-audit-2026-02-18.md`
- `docs/ui-audit/14-stable-pages-elements-deep-dive-2026-02-18.md`
- `docs/ui-audit/15-ui-bugs-inconsistencies-refresh-2026-02-18.md`
- `docs/ui-audit/16-page-risk-matrix-refresh-2026-02-18.md`

Once the handbook is authored, this prep document should be replaced by the final design standard and enforcement workflow.
