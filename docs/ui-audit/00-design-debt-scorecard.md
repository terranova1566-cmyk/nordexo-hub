# 00 Design Debt Scorecard (Top 10)

## Scoring
- Severity score: `1` (low) to `10` (critical)
- Based on spread across routes + regression risk + accessibility risk

| Rank | Debt item | Evidence | Severity |
|---:|---|---|---:|
| 1 | Hardcoded color system in key page | `203` hardcoded color occurrences total; `105` in `app/app/digideal-campaigns/page.tsx` alone | 10 |
| 2 | Button architecture split (Fluent + native) | `428` Fluent `<Button>` + `91` native `<button>` instances, no shared wrapper | 10 |
| 3 | Focus-visible inconsistency | Only `9` explicit `:focus-visible` selectors for a very large interactive surface area | 9 |
| 4 | Massive custom button class drift | `105` custom `*Button*` classes, `44` with hover overrides, many local state rules | 9 |
| 5 | Spacing scale drift | `59` unique spacing values; frequent outliers (`14`, `18`, `15`, `-2`, `60`) | 8 |
| 6 | Line-height fragmentation | `17` unique line-height values with mixed tokens + many custom unitless values | 8 |
| 7 | Semantic feedback inconsistency | `88` MessageBars, but `36` default intent (no semantic level), mostly in settings | 7 |
| 8 | Large fixed layout dimensions | `48` width/height declarations with `>=600px` in core pages; includes `min(2200px, ...)` dialogs | 7 |
| 9 | Mixed table systems in complex flows | Fluent `Table` (`59`) plus native `<table>` in production-critical pages | 6 |
| 10 | Inline style sprawl in heavy pages | `106` inline style blocks across `26` files; concentrated in production/discovery pages | 6 |

## Quick interpretation
- The app is token-aware but not standardized.
- The biggest risk is not missing components; it is local overrides and style divergence in high-complexity pages.
