# 05 Recommendations (Phase 1 Output)

## Objective
Standardize existing UI behavior and visual language without redesigning product flows.

## Proposed typography system

### Core text tokens (required labels)
| Token | Value | Default weight | Intended usage |
|---|---|---:|---|
| `textBig` | `16px / 22px` | 600 | Section titles, prominent labels inside cards/tables |
| `textNormal` | `14px / 20px` | 400 | Body text, primary labels, standard button text |
| `textSmall` | `12px / 16px` | 400 | Secondary labels, helper text, table metadata |
| `textMini` | `10px / 14px` | 400 | Tertiary metadata, hints, dense UI notes |

### Fluent mapping target
- `textBig` -> `tokens.fontSizeBase400` + `tokens.lineHeightBase400`
- `textNormal` -> `tokens.fontSizeBase300` + `tokens.lineHeightBase300`
- `textSmall` -> `tokens.fontSizeBase200` + `tokens.lineHeightBase200`
- `textMini` -> `tokens.fontSizeBase100` + `tokens.lineHeightBase100`

### Typography rules
- Keep page-level titles on Fluent heading components (`Title2/Title3`) where already used.
- Replace raw px font sizes (`11px`, `12px`, `14px`, `26px`) with the four text tokens unless explicitly exceptional.
- Remove one-off unitless line-heights (`1.05`, `1.15`, `1.35`, `1.45`) where not semantically required.

## Proposed spacing system

### Scale
`0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32`

### Rules
- Default to scale-only spacing for `gap`, `padding`, and `margin`.
- Treat these as exceptions (must be justified): `1, 3, 5, 7, 9, 13, 14, 15, 18, 28, 40, 60, -2`.
- Keep very large widths/heights for specialized dialogs only, and isolate them in named layout tokens.

## Proposed button system

### Canonical variants
| App variant | Fluent base | Notes |
|---|---|---|
| `primary` | `appearance="primary"` | One dominant CTA per cluster |
| `secondary` | `appearance="secondary"` | Supporting actions |
| `outline` | `appearance="outline"` | Alternate non-destructive action |
| `ghost` | `appearance="subtle"` (or `transparent` for icon-only) | Toolbar/minimal actions |
| `danger` | `secondary/outline` + danger token overrides | Destructive actions only |

### Canonical sizes
| Size | Target height | Horizontal padding | Text token |
|---|---:|---:|---|
| `lg` | 36px | 12px | `textNormal` |
| `md` | 32px | 10px | `textNormal` |
| `sm` | 28px | 8px | `textSmall` |

### State rules
- Hover (colored): darken by one semantic step.
- Hover (outline/white): apply neutral tint + slightly stronger border.
- Active: one step deeper than hover, no custom random palettes.
- Focus-visible: single system ring `2px` using `tokens.colorStrokeFocus2`.
- Disabled: use Fluent disabled semantics consistently; avoid page-specific overrides unless accessibility requires.

## Proposed surface system

### Surface roles
| Role | Token mapping |
|---|---|
| App background | `--app-bg` + optional subtle gradient (single centralized definition) |
| Page background | transparent over app background |
| Card surface | `tokens.colorNeutralBackground1` |
| Elevated surface (dialog/drawer/popover) | `tokens.colorNeutralBackground1` + `tokens.shadow16` |
| Border | `tokens.colorNeutralStroke2` |
| Divider / subtle border | `tokens.colorNeutralStroke1` |
| Shadow levels | `none`, `tokens.shadow4` (sm), `tokens.shadow16` (md) |

## Priority normalization targets
1. `app/app/digideal-campaigns/page.tsx`
2. `app/app/production/draft-explorer/page.tsx`
3. `app/app/production/page.tsx`
4. `app/app/discovery/page.tsx`
5. `app/app/settings/page.tsx`

Reason: these files drive most typography/spacing/color drift and contain the highest number of custom button classes and hardcoded colors.

## Implementation plan (PR-sized phases)

### Phase A: Theme and token centralization
- Add source-of-truth token module (`src/styles/tokens.ts` in Phase 2).
- Keep FluentProvider as single root provider.
- Add semantic aliases for typography, spacing, button, and surfaces.

### Phase B: Typography normalization
- Replace ad hoc font/line-height values in shared shell + shared components first (`components/app-shell.tsx`, `components/product-gallery.tsx`, small pages).
- Then migrate high-complexity pages incrementally.

### Phase C: Buttons normalization
- Introduce `AppButton` wrapper with canonical variants/sizes.
- Replace direct `<Button>` and native `<button>` in targeted hotspots incrementally.

### Phase D: Spacing normalization
- Migrate common layout primitives (`topRow`, `filters`, `table card`, `popover`) to spacing scale.
- Preserve functional layout while removing outlier values.

### Phase E: Surfaces and borders
- Normalize card/dialog/table surface colors and border/shadow/radius levels.
- Remove duplicated literal palettes where equivalent semantic tokens exist.

## Optional enforcement tooling (recommended)
- ESLint/style rules to discourage raw hex + raw font-size literals in UI files.
- A small design-system showcase route (or Storybook) for text/button/surface state previews.
- Visual baseline capture script for authenticated and unauthenticated routes.
