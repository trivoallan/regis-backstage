# Portfolio explorer — health-first reorganization

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** Frontend only (`plugins/regis`). No backend, router, or schema changes.

## Summary

Reorganize the Portfolio explorer (`RegisExplorerPage`, the app home at `/`) around
a single **portfolio health** focal point, and bring the image list in line with
the per-image / cards redesign (tier chips, score bars, worst-first). Today the
page stacks a heavy `KpiStrip` (6–8 `InfoCard`s, one per tier band + avg + images),
a posture-over-time area chart, a per-group breakdown, and the image list — three
overlapping views of the tier distribution and a lot of vertical scroll with no
clear focal point.

This is approach **A** ("health-first, single column"): a compact health header
replaces the KPI strip and becomes the top of a clear vertical narrative.

## Goals

- **Hierarchy & first impression** — one focal "Portfolio health" header at the
  top; reduce the three redundant tier-distribution views to one roll-up + the
  trend chart + the (drill) breakdown.
- **Consistency & actionability** — apply the redesign's visual language (colored
  tier chips, score mini-bars) and sort the image list worst-first.

## Non-goals

- No new data or backend work — the health header reuses the same `bands` +
  `buckets` the current `KpiStrip` already consumes.
- No change to `FacetRail`, the posture-over-time chart (`portfolioChart`), the
  `Breakdown`, or `QuickLookPanel`.
- No transitivity / blast-radius. No tabbed layout (approach C) or two-pane
  dashboard (approach B).

## Available data (constraints)

`RegisExplorerPage` already fetches `api.explore({ groupBy, days, ...filters })`,
returning `{ trend: { bands: TrendBand[]; buckets: TrendBucket[] }, groups,
images: ExploreImage[], facets }`, plus `api.getPlaybooks()` for the ladder
(`unionLadder`). A `TrendBucket` carries `{ counts: Record<string, number>,
avgScore: number, total: number, ... }` per time step. `ExploreImage` carries
`{ imageRef, tier?, score? }` (no per-row status). `TrendBand` is
`{ key, label, color }`. No new fields are needed.

## Architecture

All work is in `plugins/regis/src/components`.

### Pure module — `portfolioHealth.ts` (new)

React-free, unit-tested. `summarizeTrend(bands, buckets)` →
```
{
  mix: { key: string; label: string; color: string; count: number }[]; // latest bucket, ladder order, zero-count omitted
  worst: { label: string; count: number } | null;  // lowest-ranked band with count > 0 in the latest bucket; null when only the best band has count
  avgScore: number;     // latest bucket
  images: number;       // latest bucket total
  scoreDelta: number;   // latest - first avgScore
  imagesDelta: number;  // latest - first total
}
```
Operates on the latest and first `buckets` (mirrors how `KpiStrip` computes
counts/deltas). Returns a zeroed/empty result when `buckets` is empty (the
component then renders nothing). Note: this is distinct from `rollup.ts` `mix`
(which counts a row list); `summarizeTrend` counts a `TrendBucket.counts` map.

### `PortfolioHealth.tsx` (new)

Props `{ bands: TrendBand[]; buckets: TrendBucket[]; days: number }`. Renders
nothing when `buckets` is empty. Otherwise, an `InfoCard` "Portfolio health":
- a horizontal tier-mix bar (one segment per `summarizeTrend().mix` entry, width
  ∝ count), with `role="img"` + an `aria-label` describing the distribution;
- a legend (`<count> <label>` with a color dot per entry) and a `Worst: <label> ·
  <count>` indicator when `worst` is non-null;
- two headline KPIs — **Avg score** and **Images** — each with a `▲N / ▼N / ±0`
  delta over `<days>d`.

Reuses `delta()` formatting semantics from the current `KpiStrip` (extracted or
re-implemented in `portfolioHealth.ts`).

### `KpiStrip.tsx` (removed)

Deleted (component + test); only `RegisExplorerPage` referenced it.

### `ImageList.tsx` (modified)

- Sort worst-first: a small `sortImagesWorstFirst(images, ladder)` using the
  exported `tierRank` from `rollup.ts` — rank descending (worst tier first), then
  ascending score. No "missing-first" bucket (ExploreImage has no status). Unknown
  tier ranks as worst (finite sentinel `ladder.length`).
- Tier cell: a colored `Chip` via `tierColor(tier, ladder)` (`—` when absent),
  replacing the swatch.
- Score cell: the number plus a mini-bar colored by `scoreBarColor(score)`
  (no bar when score is undefined). Keep the row click → `onSelect(imageRef)`.
- Keep the Backstage `Table` (search, paging > 20).

### `RegisExplorerPage.tsx` (modified)

- Body order becomes: `PortfolioHealth` → "Posture over time" → `Breakdown` →
  `ImageList`. Remove the `KpiStrip` import and usage.
- `Header` subtitle becomes a **scope summary**: the active filters (e.g.
  `system: shop`) joined, plus `<n> images` and `<days>d` — derived from
  `state.filters`, `data.images.length`, and `WINDOW_DAYS`. Falls back to "All
  images" when no filters are set.
- Left "Scope" column (`FacetRail`) unchanged.

## Edge cases

- **No buckets** (no trend yet) → `PortfolioHealth` renders nothing; the rest of
  the page still renders.
- **No images match the scope** → existing "No images match this scope yet."
  empty state (unchanged).
- **All images at the best tier** → mix bar one color, `worst` hidden.
- **Unknown / untiered images** in `ImageList` → tier chip shows `—`, ranked
  worst by the sort.
- **Missing score** → no mini-bar; number shown as `—` (or the raw value when
  present). Loading / error states are owned by `RegisExplorerPage` (unchanged).

## Testing

Colocated, near-1:1 (TDD):

- `portfolioHealth.test.ts` — `summarizeTrend`: per-band mix in ladder order,
  zero-count omission, `worst` (rank-based, null when all best), avg/images,
  deltas (▲/▼/±0), empty-buckets → empty result.
- `PortfolioHealth.test.tsx` — mix segments, legend, worst shown/hidden, the two
  KPIs with deltas, renders nothing for empty buckets, bar has an aria-label.
- `ImageList.test.tsx` — worst-first order, tier chip + score bar render, row
  click calls `onSelect`.
- `RegisExplorerPage.test.tsx` — `PortfolioHealth` present and `KpiStrip` gone;
  scope-summary subtitle reflects active filters and image count.

## Out of scope / future

- Generalizing `rollup.ts` to a shared minimal row interface so `ExploreImage`
  and `ReportSummary` share one sort — deferred; `tierRank` reuse is enough here.
- Consolidating `PortfolioHealth` and `PostureRollup` into one primitive — they
  take different inputs (bucket counts vs row list); revisit only if a third
  consumer appears.
