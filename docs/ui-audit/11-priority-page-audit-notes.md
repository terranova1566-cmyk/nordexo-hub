# 11 Priority Page Audit Notes

This document gives deeper page-level findings for the highest-risk routes, organized by the five target dimensions:
- Spacing
- Font size
- Colors
- Buttons
- Menus

## 1) `app/app/production/draft-explorer/page.tsx`

### Snapshot
- Total score: `21` (Critical)
- Lines: `11712`
- Native buttons: `58`
- Inline style blocks: `35`
- Hardcoded color occurrences: `27`
- Menu footprint: `Menu=6`, `MenuItem=27`, plus custom context menu system

### Findings
- Spacing: high outlier count and many local dense control clusters.
- Font size: mostly tokenized, but still local line-height drift.
- Colors: moderate hardcoded palette use.
- Buttons: strongest drift area due to mixed Fluent + native button systems.
- Menus: dual architecture (Fluent menus + custom context menu) is a major consistency risk.

### Evidence anchors
- Custom context menu root: `app/app/production/draft-explorer/page.tsx:10654`
- Context menu native button entries: `app/app/production/draft-explorer/page.tsx:10664`
- Explicit focus-visible styles exist but sparse vs interaction volume: `app/app/production/draft-explorer/page.tsx:796`, `app/app/production/draft-explorer/page.tsx:1394`
- Native table header sort controls: `app/app/production/draft-explorer/page.tsx:8357`

## 2) `app/app/digideal-campaigns/page.tsx`

### Snapshot
- Total score: `20` (Critical)
- Lines: `10067`
- Hardcoded colors: `105` (largest in app)
- Buttons: `52` Fluent + `9` native, custom button classes: `23`
- Menu footprint: `Menu=8`, `MenuItem=23`, `Dropdown=7`, `Option=25`

### Findings
- Spacing: moderate drift with many local values in dense table/action regions.
- Font size: mostly tokenized with local exceptions.
- Colors: severe fragmentation from custom status palettes and button states.
- Buttons: many local variants for supplier/rerun/status actions.
- Menus: highly complex nested action menus with page-specific styling.

### Evidence anchors
- Hardcoded supplier button palettes: `app/app/digideal-campaigns/page.tsx:948`, `app/app/digideal-campaigns/page.tsx:960`, `app/app/digideal-campaigns/page.tsx:991`
- Category hover raw gray: `app/app/digideal-campaigns/page.tsx:659`
- Large dialog width: `app/app/digideal-campaigns/page.tsx:1796`, `app/app/digideal-campaigns/page.tsx:1797`
- Dense compact menu popover styling: `app/app/digideal-campaigns/page.tsx:917`
- Native variant table: `app/app/digideal-campaigns/page.tsx:9846`

## 3) `app/app/production/page.tsx`

### Snapshot
- Total score: `20` (Critical)
- Lines: `6550`
- Typography drift is high (`raw line-height` concentration)
- Hardcoded colors: `32`
- Focus-visible gap: `Yes`

### Findings
- Spacing: moderate drift.
- Font size: highest typography debt among top pages (many custom line-heights).
- Colors: significant custom color overrides in production badges/actions.
- Buttons: moderate-to-high class-level drift.
- Menus: fewer menus than other heavy pages but still many action controls and overlays.

### Evidence anchors
- Typography drift examples: `app/app/production/page.tsx:299`, `app/app/production/page.tsx:312`, `app/app/production/page.tsx:1091`
- Wide dialog widths: `app/app/production/page.tsx:518`, `app/app/production/page.tsx:519`
- Native variant table: `app/app/production/page.tsx:5217`
- Checkbox indicator hard overrides: `app/app/production/page.tsx:260`

## 4) `app/app/discovery/page.tsx`

### Snapshot
- Total score: `14` (High)
- Lines: `3530`
- Native buttons: `10`
- Inline styles: `8`
- Menu/dropdown footprint: `Menu=1`, `MenuItem=5`, `Dropdown=5`

### Findings
- Spacing: mostly clustered but has local one-off values.
- Font size: minor drift.
- Colors: moderate local hardcoded accents.
- Buttons: mixed Fluent and native action controls.
- Menus: rich filter/menu surface with page-local behaviors.

### Evidence anchors
- Category hover raw gray: `app/app/discovery/page.tsx:372`
- Focus-visible present but limited: `app/app/discovery/page.tsx:374`
- Wide list panel/dialog region: `app/app/discovery/page.tsx:782`
- Native button presence in card actions: `app/app/discovery/page.tsx:2507`

## 5) `app/app/products/page.tsx`

### Snapshot
- Total score: `12` (High)
- Lines: `2512`
- Buttons: `19` Fluent + `4` native; custom button classes: `10`
- Menus: `Menu=2`, `MenuItem=10`, `Dropdown=3`

### Findings
- Spacing: generally controlled.
- Font size: some line-height drift remains.
- Colors: relatively low drift compared with production/digideal.
- Buttons: notable local class drift and mixed controls.
- Menus: medium complexity list/menu interactions.

### Evidence anchors
- Category hover raw gray: `app/app/products/page.tsx:260`
- Focus-visible styles present: `app/app/products/page.tsx:262`, `app/app/products/page.tsx:515`
- Menu sections for list actions: `app/app/products/page.tsx:1712`, `app/app/products/page.tsx:2277`
- Wide panel width: `app/app/products/page.tsx:139`

## 6) `app/app/settings/page.tsx`

### Snapshot
- Total score: `10` (High)
- Lines: `3454`
- MessageBars: `26` (highest in app)
- Dropdown/Tab footprint: `Dropdown=5`, `TabList=1`

### Findings
- Spacing: moderate local variance.
- Font size: largely consistent.
- Colors: some hardcoded accents and warning/danger sections.
- Buttons: moderate drift.
- Menus: settings tabs/dropdowns are substantial but less fragmented than production pages.
- Additional concern: feedback semantics are inconsistent (many default MessageBars).

### Evidence anchors
- Default-intent message bars: `app/app/settings/page.tsx:2117`, `app/app/settings/page.tsx:2140`, `app/app/settings/page.tsx:2352`
- Focus-visible present in category controls: `app/app/settings/page.tsx:305`, `app/app/settings/page.tsx:561`
- Category hover raw gray: `app/app/settings/page.tsx:303`

## 7) `app/app/products/[id]/page.tsx`

### Snapshot
- Total score: `10` (High)
- Lines: `2994`
- Form-heavy page: `Field=33`, `Input=62`
- Focus-visible gap: `Yes`

### Findings
- Spacing: low-to-moderate variance.
- Font size: modest line-height drift.
- Colors: low hardcoded drift.
- Buttons: lower drift than production pages.
- Menus: moderate complexity due to list/menu + tabs.
- Additional concern: high interactivity with no explicit focus-visible styling in this route file.

### Evidence anchors
- Menu usage: `app/app/products/[id]/page.tsx` (menu footprint reflected in component inventory)
- MessageBars in multiple task flows: `app/app/products/[id]/page.tsx:1454`, `app/app/products/[id]/page.tsx:1713`, `app/app/products/[id]/page.tsx:2968`

## Priority execution order for future implementation phases
1. `app/app/production/draft-explorer/page.tsx`
2. `app/app/digideal-campaigns/page.tsx`
3. `app/app/production/page.tsx`
4. `app/app/discovery/page.tsx`
5. `app/app/products/page.tsx`
6. `app/app/settings/page.tsx`
7. `app/app/products/[id]/page.tsx`
