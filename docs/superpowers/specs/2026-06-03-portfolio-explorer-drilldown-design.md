# Portfolio explorer drilldown design

Date: 2026-06-03

## Problem

The Regis frontend has two flat, disconnected pages: `/regis` (a catalog-wide
image table) and `/regis-portfolio` (the portfolio trends dashboard — a stacked
trend chart, KPIs, and system/owner/playbook filters). There is no path from the
aggregate posture view down to a segment, then to an image, then to its detail.
The product direction is a portfolio-management portal, so the portfolio view
should be the home and the user should be able to drill from it.

## Goal

Make a single **explorer** the app home (`/`): a master-detail analytic console
where the portfolio trend is scoped by a persistent facet rail, broken down by a
switchable group-by dimension, drilled into an image list, and previewed via a
quick-look that links to the full entity page. All state lives in the URL.

## Decisions (from brainstorming)

- **Scope:** the app exists for Regis — the root route `/` is the explorer; the
  Backstage catalog stays at `/catalog`.
- **Drilldown spine:** hybrid — a switchable primary **group-by**
  (system | owner | playbook | tier) **plus** combinable **facets**.
- **Presentation:** master-detail with a persistent facet rail (analytic
  explorer), a single route, URL-encoded state.
- **Leaf:** a **quick-look** inline panel (tier, score, mini-trajectory) **plus**
  a link to the full Backstage entity page.
- **Data source:** a new `GET /portfolio/explore` endpoint reusing the cached
  snapshots in `PortfolioTrendAggregator`.

## UX

A single route is the app home. Layout: a persistent left **rail** + a main
**body**.

- **Rail:** a *Group by* selector (system | owner | playbook | tier), removable
  **active-filter chips**, and an add-facet control populated from the response's
  scoped `facets`. All state is reflected in the URL
  (`/?system=shop&tier=Bronze&groupBy=owner`) — deep-link and refresh safe.
- **Body:** the scoped trend (the existing rank-band stacked-area chart) + a KPI
  strip; then a **breakdown** (one row per group of the current group-by: count,
  average score, a tier-mix mini-bar) where clicking a row adds that group as a
  facet and drills one level; then the scoped **image list** (image, colored
  tier, score).
- **Leaf:** clicking an image opens a **quick-look** drawer — tier, score, a
  mini-trajectory sparkline, and an "Open full page" link to the entity page.
- Tier colors everywhere come from the union of resolved ladders
  (`unionLadder` + `tierColor`, already implemented). The trend chart and KPI
  strip reuse existing components.

## Routing and app shell

- A new explorer `PageBlueprint` mounts at `/` (the index route) with its own
  `routeRef`. `/catalog`, entity pages, and search are unchanged.
- The two standalone pages are folded in:
  - `/regis-portfolio` is absorbed by the explorer; its inner components
    (`PortfolioStackedArea`, the KPI strip, `FacetSelect`) are reused/extracted.
  - `/regis` is covered by the explorer's image list (empty group-by); its
    colored Tier-column logic moves into `ImageList`.
  - Both old routes redirect to `/` (or keep their `routeRef` as an alias to the
    explorer) so existing internal links keep working. `rootRouteRef` points at
    the explorer.
- Nav: a single primary item (the explorer, `TimelineIcon`) plus catalog and
  search.
- Shared pieces are **extracted, not duplicated**: `Sparkline` (out of
  `RegisTrajectoryCard`) and `KpiStrip` (out of `RegisPortfolioTrendsPage`)
  become focused units consumed by both the explorer and the existing entity
  cards.

Before removing the old `PageBlueprint`s, verify that dropping
`rootRouteRef`/`portfolioRouteRef` does not break an internal link (entity cards,
etc.); if it does, keep the route refs as aliases to `/`.

## Backend: `GET /portfolio/explore`

One call returns everything a level of the explorer needs, reusing the snapshot
cache already held by `PortfolioTrendAggregator`.

Request: `?groupBy=system|owner|playbook|tier` plus optional facets `system`,
`owner`, `playbook`, `tier`, plus `days?`.

```ts
interface ExploreGroup {
  key: string;
  count: number;
  avgScore: number;
  tiers: Record<string, number>; // tier name → count, for the mix bar
}
interface ExploreImage {
  imageRef: string;
  tier?: string | null;
  score?: number;
  system?: string;
  owner?: string;
  playbook?: string;
  digest?: string;
}
interface ExploreResponse {
  filters: { system?: string; owner?: string; playbook?: string; tier?: string };
  groupBy: 'system' | 'owner' | 'playbook' | 'tier';
  trend: { bands: TrendBand[]; buckets: TrendBucket[] };
  groups: ExploreGroup[];
  images: ExploreImage[];
  facets: { systems: string[]; owners: string[]; playbooks: string[]; tiers: string[] };
}
```

`ExploreResponse` (and the helper interfaces) live in `regis-common` and are
exported from the barrel. No wire-format version bump (this is a query response,
not a versioned artifact).

Implementation — a new `PortfolioTrendAggregator.explore(filters, groupBy, days, today)`:

- **Latest snapshot per image:** reduce the cached snapshots by `imageRef`
  (max `snapshotDate`) to get current posture carrying
  system/owner/playbook/tier/score.
- **Filter** that latest set by the active facets → `images`.
- **`groups`:** group the scoped images by `groupBy` → count, average score, and
  tier mix (tier names from the resolved ladders via `resolveLadders`).
- **`trend`:** `aggregateTrend` over the snapshots filtered by
  system/owner/playbook (reuse the existing engine). `tier` filters only
  `images`/`groups`, not the trend — a "filtered by current tier" time series is
  not meaningful.
- **`facets`:** distinct values **within the scope**, so facet options narrow as
  the user drills.
- **No `entityRef` on the wire:** the leaf (quick-look + link) derives the entity
  ref client-side via the shared `slugForImageRef(imageRef)` helper (already
  exported by `regis-common`, the same the provider uses to name entities) →
  `resource:<namespace>/<slug>`.

Router: `GET /portfolio/explore` (authenticated, `ensureFresh` like the other
routes), validating params (`groupBy` in the enum, default `system`).

When no history/index is configured the snapshot cache is empty, so `explore`
returns empty sets and the explorer shows an empty state — consistent with the
trends page today.

## Frontend

- **Client:** `RegisClient.explore(params)` → `GET /portfolio/explore`, typed
  `ExploreResponse`, added to `RegisApi`.
- **Component decomposition** (one responsibility per file):
  - `RegisExplorerPage.tsx` — orchestration. Reads state from the URL
    (`useSearchParams`: `groupBy`, `system`, `owner`, `playbook`, `tier`), calls
    `explore(...)` via `useAsync` (keyed by URL state), composes rail + body.
    Mounted at `/`.
  - `FacetRail.tsx` — group-by selector (MUI `Select`), removable active-filter
    chips (MUI `Chip` with `onDelete`), add-facet from `response.facets`.
    Presentational + `onChange` callbacks that mutate the URL.
  - `Breakdown.tsx` — one row per `response.groups`: label, count, average score,
    a tier-mix mini-bar colored via `unionLadder` + `tierColor`. Rendered as a
    Backstage `Table` (or a MUI `List` of `ListItemButton`s) so each row is a
    real, keyboard-focusable control. Click → `onDrill(groupBy, key)` (adds the
    facet to the URL).
  - `ImageList.tsx` — Backstage `Table` of `response.images` (Image, colored
    Tier, Score). Row click → `onSelect(imageRef)` (opens the quick-look). Reuses
    the colored Tier-column logic from the current `RegisCatalogPage`.
  - `QuickLookPanel.tsx` — MUI `Drawer`; derives the entity ref via
    `slugForImageRef`, shows tier/score + a mini-trajectory (`Sparkline`) loaded
    on open via `getHistory`, plus an "Open full page" `EntityRefLink`.
  - **Extracted shared units (DRY):** `Sparkline` (from `RegisTrajectoryCard`,
    reused by the quick-look and the trajectory card), `KpiStrip` (from
    `RegisPortfolioTrendsPage`), and `PortfolioStackedArea` (already standalone)
    for `response.trend`.
- **Data flow:** URL → `explore()` → `{ trend, groups, images, facets }` → rail
  (facets) + body (trend + KpiStrip + Breakdown + ImageList) + quick-look (lazy
  `getHistory`). One source per render; the URL is the source of truth for state.
- **Graceful degradation:** no history configured → empty sets → empty-state
  explorer.

### Component design conventions (Backstage DLS)

New UI follows the
[Backstage component design guidelines](https://backstage.io/docs/dls/component-design-guidelines/),
matching the rest of this plugin:

- **Reuse first, build last.** Prefer Backstage core components
  (`Page`, `Header`, `Content`, `InfoCard`, `Table`, `EntityRefLink`,
  `Progress`, `ResponseErrorPanel`), then Material UI components; build a custom
  component only when neither fits. Match catalog UX patterns so the explorer
  feels native (the same `Page`/`Header`/`Content` shell and `Table` the catalog
  page already uses).
- **Layout via MUI primitives, not raw HTML+CSS.** Use `Grid`, `Box`, `Paper`,
  `Card`, and `Drawer` for structure; never hand-roll flex `div`s with inline
  style for layout. Space with `theme.spacing()`. The facet rail + body is a
  responsive `Grid` (rail collapses behind a toggle / moves into a `Drawer` on
  small breakpoints, since model C's rail is wide).
- **Theme palette for chrome.** Structural colors (surfaces, text, borders,
  dividers) come from the theme palette via `useTheme`/`makeStyles`, not
  hardcoded hex. **Tier colors are a deliberate, documented exception:** they are
  *data* from the playbook ladder (resolved by `unionLadder`/`tierColor`), so
  they are applied as the only inline `backgroundColor` on the tier swatch/chip —
  not chrome. This keeps the existing tier-color behavior while everything else
  is theme-aware.
- **Typography for text.** Use `<Typography>` (with the right `variant`), not
  raw `<h*>`/`<span>` text, for theme-correct sizing, weight, and contrast.
- **Accessibility & interaction.** Interactive drill targets (breakdown rows,
  image rows, removable chips) are real buttons/links — keyboard-focusable, with
  accessible names; the trend SVG keeps its `role="img"` + `aria-label`. Filter
  chips use `Chip onDelete`; selecting a group/image updates the URL so Back/
  Forward work.

(The wireframe mockups in brainstorming used inline-styled `div`s purely to
sketch layout — the implementation uses the components above.)

## Testing

Colocated, TDD, near-1:1.

- **Backend** `explore()`: latest-snapshot-per-image, facet filtering, group
  aggregates (count / avg score / tier mix), facets narrowed within scope, scoped
  trend, `tier` filters only images/groups. Router: `GET /portfolio/explore`
  (params, default group-by, auth).
- **common:** `ExploreResponse` exported from the barrel.
- **Frontend:** `RegisClient.explore` (URL/params); `FacetRail` (group-by,
  removable chips, add-facet → callbacks); `Breakdown` (renders groups, colored
  mix, click → drill); `ImageList` (colored tier, click → select);
  `QuickLookPanel` (derives entity ref, sparkline, link); `RegisExplorerPage`
  (URL state ↔ explore, empty state). Extracted `Sparkline`/`KpiStrip` keep
  coverage via their consumers.
- **Accessibility:** assert drill targets render as focusable controls
  (buttons/links with accessible names) and that removable filter chips expose a
  delete affordance — so the DLS interaction guidance is verified, not just
  stated in prose.

## Migration

- Remove the `/regis` and `/regis-portfolio` `PageBlueprint`s; add the explorer
  `PageBlueprint` at `/`; redirect (or alias the route refs) `/regis`,
  `/regis-portfolio` → `/`.
- Extract `Sparkline` (from `RegisTrajectoryCard`) and `KpiStrip` (from
  `RegisPortfolioTrendsPage`) before retiring the trends page wrapper; the entity
  trajectory card keeps using `Sparkline`.
- Entity cards/tabs (`scorecard`, `report`, `aliases`, `trajectory`,
  `service-images`, `playbook-images`) are unchanged.
- Demo data already exercises multiple ladders and facets — no generator change.

## Out of scope (YAGNI)

- Transitivity base → derived images (CVE blast-radius).
- Simultaneous multi-dimension drilldown beyond group-by + facets.
- Write/intake workflows.
