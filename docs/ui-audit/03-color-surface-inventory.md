# 03 Color and Surface Inventory

## Scope and method
- Same UI scan scope as other reports.
- Color-related declarations captured: `1158`

## Color token vs literal usage
| Category | Count |
|---|---:|
| Token-based (`tokens.*`) | 844 |
| Literal colors (`#`, `rgb/rgba`, `transparent`, `none`, `inherit`) | 310 |
| CSS var-only (`var(--...)`) | 4 |

## Background inventory
- Unique normalized background values: `65`
- Total background declarations: `448`

| Count | Background value | Top usage files |
|---:|---|---|
| 117 | `tokens.colorNeutralBackground1` | `app/app/digideal-campaigns/page.tsx` (28), `app/app/production/page.tsx` (22), `app/app/production/draft-explorer/page.tsx` (19) |
| 72 | `tokens.colorNeutralBackground2` | `app/app/production/draft-explorer/page.tsx` (16), `app/app/digideal-campaigns/page.tsx` (12), `app/app/production/page.tsx` (7) |
| 58 | `tokens.colorNeutralBackground3` | `app/app/production/page.tsx` (11), `app/app/digideal-campaigns/page.tsx` (10), `app/app/production/draft-explorer/page.tsx` (6) |
| 53 | `transparent` | `app/app/digideal-campaigns/page.tsx` (15), `app/app/discovery/page.tsx` (10), `app/app/production/draft-explorer/page.tsx` (10) |
| 21 | `#ffffff` | `app/app/production/draft-explorer/page.tsx` (12), `app/app/digideal-campaigns/page.tsx` (5), `app/app/production/page.tsx` (4) |
| 10 | `#fafafa` | `app/app/settings/page.tsx` (6), `app/app/production/draft-explorer/page.tsx` (4) |
| 9 | `tokens.colorBrandBackground2` | `app/app/production/draft-explorer/page.tsx` (4), `app/app/discovery/page.tsx` (3), `app/app/digideal-campaigns/page.tsx` (2) |

## Text color inventory
- Unique normalized text colors: `43`
- Total text color declarations: `429`

| Count | Text color value | Top usage files |
|---:|---|---|
| 153 | `tokens.colorNeutralForeground3` | `app/app/production/page.tsx` (27), `app/app/digideal-campaigns/page.tsx` (19), `app/app/production/draft-explorer/page.tsx` (16) |
| 51 | `tokens.colorBrandForeground1` | `app/app/production/page.tsx` (14), `app/app/digideal-campaigns/page.tsx` (13), `app/app/discovery/page.tsx` (8) |
| 49 | `tokens.colorNeutralForeground1` | `app/app/digideal-campaigns/page.tsx` (12), `app/app/discovery/page.tsx` (8), `app/app/production/draft-explorer/page.tsx` (6) |
| 49 | `tokens.colorNeutralForeground2` | `app/app/digideal-campaigns/page.tsx` (10), `app/app/production/bulk-processing/page.tsx` (5), `app/app/discovery/page.tsx` (4) |
| 30 | `tokens.colorStatusDangerForeground1` | `app/app/production/draft-explorer/page.tsx` (7), `app/app/production/bulk-processing/page.tsx` (4), `app/app/settings/page.tsx` (2) |
| 24 | `tokens.colorNeutralForeground4` | `app/app/discovery/page.tsx` (11), `app/app/digideal-campaigns/page.tsx` (7), `app/app/products/page.tsx` (3) |

## Border inventory
- Unique normalized border values: `50`
- Total border declarations: `240`

| Count | Border value | Top usage files |
|---:|---|---|
| 119 | `` `1px solid ${tokens.colorNeutralStroke2}` `` | `app/app/digideal-campaigns/page.tsx` (27), `app/app/production/draft-explorer/page.tsx` (25), `app/app/production/page.tsx` (19) |
| 41 | `none` | `app/app/production/draft-explorer/page.tsx` (10), `app/app/digideal-campaigns/page.tsx` (8), `app/app/discovery/page.tsx` (7) |
| 11 | `` `1px solid ${tokens.colorBrandStroke1}` `` | `app/app/digideal-campaigns/page.tsx` (3), `app/app/production/draft-explorer/page.tsx` (3), `app/app/discovery/page.tsx` (1) |
| 7 | `` `1px solid ${tokens.colorNeutralStroke1}` `` | `app/app/products/page.tsx` (2), `app/app/saved/page.tsx` (2), `app/app/digideal-campaigns/page.tsx` (1) |
| 5 | `1px solid #0f6cbd` | `app/app/production/page.tsx` (3), `app/app/digideal-campaigns/page.tsx` (2) |
| 4 | `2px solid #0f6cbd` | `app/app/digideal-campaigns/page.tsx` (2), `app/app/production/page.tsx` (2) |

## Shadows and radii
- Unique shadow values: `14`
- Shadow declarations: `31`
- Unique radius values: `13`
- Radius declarations: `266`

### Top shadows
| Count | Shadow value |
|---:|---|
| 10 | `tokens.shadow16` |
| 3 | `tokens.shadow8` |
| 3 | `tokens.shadow4` |
| 2 | `0 18px 50px rgba(0,0,0,0.18)` |
| 2 | `` `0 0 0 1px ${tokens.colorBrandStroke1} inset` `` |
| 2 | `var(--app-shadow)` |

### Top radii
| Count | Radius value |
|---:|---|
| 66 | `12px` |
| 47 | `10px` |
| 34 | `var(--app-radius)` |
| 26 | `8px` |
| 22 | `999px` |
| 20 | `6px` |
| 16 | `16px` |
| 7 | `14px` |
| 6 | `4px` |

## Hardcoded color hotspots
- Hardcoded color occurrences (`#...` / `rgba` / `hsl`): `203`

| Occurrences | File |
|---:|---|
| 105 | `app/app/digideal-campaigns/page.tsx` |
| 32 | `app/app/production/page.tsx` |
| 27 | `app/app/production/draft-explorer/page.tsx` |
| 15 | `app/app/products/batch-image-editor/[batchId]/edit/page.tsx` |
| 9 | `app/app/settings/page.tsx` |
| 7 | `app/app/discovery/page.tsx` |

## Current surface model (what exists now)
| Surface role | Current implementation |
|---|---|
| App canvas | `app/globals.css` uses `--app-bg` with fixed gradient + radial overlays |
| Main shell header | `components/app-shell.tsx` sticky header with `tokens.colorNeutralBackground2` + `1px` neutral stroke |
| Standard card/panel | Usually `tokens.colorNeutralBackground1` with `var(--app-radius)` |
| Elevated card/modal | Mix of `tokens.shadow16`, `tokens.shadow8`, and custom shadows (`0 18px 50px rgba(...)`) |
| Status surfaces | Mixed token states and raw palettes (notably in `digideal-campaigns` and `production`) |

## Initial risk note
- The base neutral system is mostly tokenized, but feature-heavy pages override with local hardcoded palettes and custom borders/shadows.
- Surface behavior is coherent in simple pages, but high-complexity pages introduce parallel color systems that bypass Fluent semantics.
