# 15 UI Bugs and Inconsistencies Refresh (2026-02-18)

This refresh supersedes older bug snapshots where conflicts exist. Findings are ordered by severity.

## High severity
| Finding | Why it matters | Evidence |
|---|---|---|
| Global navigation is hover-open with `hoverDelay={0}` across top-level menus | Creates accidental opens and unstable pointer behavior; difficult to standardize keyboard parity | `components/app-shell.tsx:388`, `components/app-shell.tsx:414`, `components/app-shell.tsx:439`, `components/app-shell.tsx:600` |
| Focus-visible coverage is far below interaction density | Only 5 files define explicit focus-visible while high-action pages do not; keyboard focus consistency is at risk | Focus selectors only in `app/app/digideal-campaigns/page.tsx:661`, `app/app/discovery/page.tsx:374`, `app/app/products/page.tsx:262`, `app/app/settings/page.tsx:305`, `app/app/production/draft-explorer/page.tsx:796` |
| High-button pages missing local focus-visible definitions | Pages with many actions rely on defaults/mixed behavior and lack explicit state standards | `app/app/production/page.tsx:4055`, `app/app/production/page.tsx:6540`; `app/app/saved/page.tsx:511`; `app/app/products/[id]/page.tsx:1500`; `app/app/nx-agents/page.tsx:513` |
| Mixed native `<button>` and Fluent `Button` usage in core workflows | Produces inconsistent disabled/focus/hover behavior and increases regression risk | Native button hotspots: `app/app/production/draft-explorer/page.tsx:6712`, `app/app/discovery/page.tsx:2507`, `app/app/digideal-campaigns/page.tsx:6976` |
| Hardcoded status/action color palette in Digideal campaigns | Semantic drift across statuses and button states; difficult to map to a single token policy | `app/app/digideal-campaigns/page.tsx:949`, `app/app/digideal-campaigns/page.tsx:992`, `app/app/digideal-campaigns/page.tsx:1069`, `app/app/digideal-campaigns/page.tsx:2344` |
| Production flows override Fluent internals with raw color values | Bypasses theme semantics and increases state inconsistency | `app/app/production/page.tsx:261`, `app/app/production/page.tsx:562`, `app/app/production/page.tsx:924` |

## Medium severity
| Finding | Why it matters | Evidence |
|---|---|---|
| Category hover color is hardcoded and duplicated across pages | Same interaction style is reimplemented with raw color instead of shared token/style primitive | `app/app/discovery/page.tsx:372`, `app/app/products/page.tsx:260`, `app/app/settings/page.tsx:303`, `app/app/digideal-campaigns/page.tsx:659`, `app/app/trend-research/page.tsx:124` |
| Typography micro-variants remain fragmented | Near-duplicate line-heights and raw px labels cause visual drift in dense data screens | `app/app/production/page.tsx:312`, `app/app/production/page.tsx:392`, `app/app/production/page.tsx:1091`, `app/app/digideal-campaigns/page.tsx:2266`, `app/app/discovery/page.tsx:588` |
| Radius system is fragmented (`4/6/8/10/12/14/16/999/var(--app-radius)`) | Inconsistent shape language across cards, pills, controls | `app/app/production/page.tsx:1627`, `app/app/production/page.tsx:1268`, `app/app/production/page.tsx:1302`, `app/app/production/page.tsx:714`, `app/app/production/page.tsx:282`, `app/app/production/page.tsx:1538`, `components/product-gallery.tsx:31` |
| Spacing is raw-px-only and mixed in same components | No enforceable spacing token scale yet; near-duplicate spacing persists | `components/app-shell.tsx:57`, `components/app-shell.tsx:133`, `app/app/nx-agents/page.tsx:169`, `app/app/production/page.tsx:545` |
| Button sizing is not standardized | Explicit size props are rare and concentrated in a few pages; most buttons inherit defaults | `app/app/products/batch-image-editor/[batchId]/edit/page.tsx:830`, `app/app/digideal/product-delivery/page.tsx:107`, `app/app/digideal-campaigns/page.tsx:862` |
| Dual token sources (`--app-*` + Fluent tokens) remain unsynchronized | Color/surface updates can diverge between CSS-vars layer and Fluent theme layer | `app/globals.css:3`, `app/globals.css:9`, `components/providers.tsx:11`, `app/login/page.tsx:31` |
| Preload spinner styles are hardcoded in root layout | Global loading state bypasses theme token contract and can drift from system colors | `app/layout.tsx:25`, `app/layout.tsx:37`, `app/layout.tsx:38` |

## Low severity
| Finding | Why it matters | Evidence |
|---|---|---|
| New `nx-agents` page is cleaner but still raw-spacing based | Good candidate for first low-risk normalization pass later | `app/app/nx-agents/page.tsx:143`, `app/app/nx-agents/page.tsx:169`, `app/app/nx-agents/page.tsx:217` |
| Public share/login pages use app shadow/radius variables but no shared component wrapper | Reusable auth/public surface primitive is not yet formalized | `app/login/page.tsx:31`, `app/share/[token]/page.tsx:26` |

## Notes for implementation phases later
- Keep first normalization pass focused on shell + typography + button wrappers.
- Delay page-specific redesign decisions; this log isolates consistency debt only.
