# 08 Menu and Navigation Audit

## Menu/navigation component inventory

### Global counts
| Component | Count |
|---|---:|
| `Option` | 93 |
| `MenuItem` | 87 |
| `Dropdown` | 47 |
| `Menu` | 29 |
| `MenuTrigger` | 29 |
| `MenuPopover` | 29 |
| `MenuList` | 29 |
| `Tab` | 35 |
| `TabList` | 12 |
| `Popover` | 26 |
| `Tooltip` | 15 |
| `Combobox` | 2 |

## Global app navigation (app shell)
- File: `components/app-shell.tsx`
- Top-level menu groups are defined in arrays (`productMenuItems`, `discoveryMenuItems`, `ordersMenuItems`, etc.) and rendered in header nav.
- `openOnHover` is used on all global nav menus (`8` occurrences): `components/app-shell.tsx:411`
- Hover delay is set to `0` for global menus: `components/app-shell.tsx:411`
- Shared menu popover width is local (`minWidth: 220px`): `components/app-shell.tsx:94`

## Route-level menu density hotspots
| File | Menu-related load |
|---|---|
| `app/app/digideal-campaigns/page.tsx` | `Menu:8`, `MenuItem:23`, `Dropdown:7`, `Option:25` |
| `app/app/production/draft-explorer/page.tsx` | `Menu:6`, `MenuItem:27`, plus large custom native context menu system |
| `app/app/products/page.tsx` | `Menu:2`, `MenuItem:10`, `Dropdown:3` |
| `app/app/saved/page.tsx` | `Menu:2`, `MenuItem:6`, `Dropdown:1` |
| `app/app/settings/page.tsx` | `Dropdown:5`, `Option:13`, `TabList:1`, `Tab:6` |

## Menu architecture patterns

### Pattern A: Fluent nav menus (global/header)
- Example: `components/app-shell.tsx:411`
- Characteristics:
  - Hover-open menus
  - Subtle/primary button state for active section
  - No shared centralized nav-menu variant object yet

### Pattern B: Fluent action menus (table/list rows)
- Examples:
  - `app/app/products/page.tsx:1712`
  - `app/app/digideal-campaigns/page.tsx:7286`
  - `app/app/production/draft-explorer/page.tsx:9330`
- Characteristics:
  - Action lists, nested submenus, disabled states for loading/empty
  - Page-specific popover class overrides

### Pattern C: Custom native context menus (non-Fluent)
- Example: `app/app/production/draft-explorer/page.tsx:10654`
- Characteristics:
  - Absolutely positioned custom menu surface
  - Native `<button>` entries (`app/app/production/draft-explorer/page.tsx:10664`)
  - Manual submenu positioning and side flipping logic

## Navigation/menu inconsistency findings
| Finding | Evidence |
|---|---|
| Hover-open behavior not standardized with click-open alternatives | `components/app-shell.tsx:411` |
| Menu visuals are page-local rather than shared | `app/app/digideal-campaigns/page.tsx:917` (`compactMenuPopover`) |
| Mixed Fluent and custom-native menu systems | Fluent menus in many pages + custom context menu in `app/app/production/draft-explorer/page.tsx:10654` |
| Menu widths are inconsistent (`220`, `320`, `420`, `660`, etc.) | `components/app-shell.tsx:94`, `app/app/digideal-campaigns/page.tsx:531`, `app/app/digideal-campaigns/page.tsx:520` |
| Menu item semantics are reused for status/loading messages in some flows | e.g. disabled message items in `app/app/products/page.tsx:1721`, `app/app/products/page.tsx:1723`, `app/app/products/page.tsx:1725` |

## Accessibility and interaction risk notes
- Custom context menu implementation in draft explorer appears to be div/button-driven without a clear unified ARIA menu pattern at the container level (`app/app/production/draft-explorer/page.tsx:10654`).
- Focus-visible coverage for menu-related custom controls is sparse compared to interaction density.

## Menu audit conclusion
Menu/navigation is functionally rich but structurally fragmented. The global header navigation, page action menus, and custom context menus currently form three parallel patterns that should be normalized under one strict handbook model in later phases.
