# Regis Backstage — Portfolio Trend Dashboard — Design

> **Date**: 2026-06-03
> **Status**: Design approved (brainstorming), pending implementation plan
> **Scope**: A dedicated page that aggregates the **whole image portfolio's posture over
> time** from the persistent report-history store — tier distribution and average score on a
> 90-day daily axis, with **as-of carry-forward** semantics. First follow-on surface on the
> Phase 2 history store. Designed so the aggregation can scale to **170k+ images** without
> changing the API or frontend.
> Companion to the [report history store](2026-06-02-regis-backstage-report-history-store-design.md).

## Context & objective

The history store (`regis_report_snapshots`, merged in #8) records an append-only series of
per-image posture snapshots keyed `(imageRef, snapshotDate)`. The trajectory card consumes it
**per image**; this slice consumes it **across the whole portfolio over time** — the
leadership view: *"is our portfolio's quality trending up?"*

The store today exposes only `getByImageRef`. This slice adds the **aggregate read path** and
its surface, while keeping the door open to very large volumes (≥170k images): the per-request
cost stays O(1) via a warmed cache, the aggregation algorithm is delta-based (not
O(days × images)), and the data-access layer has an explicit seam to swap the in-memory
computation for a SQL / precomputed-rollup implementation later.

## Locked decisions (2026-06-03 brainstorm)

| Axis | Decision |
| --- | --- |
| Placement | **Dedicated page** ("Portfolio Trends"), reachable from the nav, near the existing `/regis` page |
| Scope | **Whole portfolio** (all `container-image` snapshots). **No system/owner filters in v1** (deferred to the scale phase — see §Scaling) |
| Time axis | **90 days, daily buckets** (window length configurable via `days` query param, bounded) |
| Series semantics | **As-of carry-forward**: each day's distribution uses every image's *latest snapshot ≤ that day* |
| Metrics | Tier distribution (`gold`/`silver`/`bronze`/`none` counts), `total` image count, `avgScore` — per daily bucket |
| Aggregation | **Approach 1**: store data-access method + **pure** `aggregateTrend` (delta algorithm) + a **warmed-cache aggregator** (mirrors `CatalogAggregator`) |
| Aggregation algorithm | **Delta/event-based** — O(snapshots-in-window + active images), not O(days × images) |
| Charting | **Dependency-free inline SVG** (consistent with the trajectory sparkline); a charting lib (recharts) is the documented alternative, not used in v1 |
| Scale target | Designed for **170k+ images** via warmed cache + delta algorithm + documented SQL/rollup seam (see §Scaling) |

## Data & aggregation

### Store data-access (new)

`ReportHistoryStore` gains a read method for aggregation:

```ts
listSnapshots(): Promise<ReportSnapshot[]>;   // all snapshots (v1 data access)
```

- `InMemoryReportHistoryStore`: returns all stored rows.
- `KnexReportHistoryStore`: `SELECT * FROM regis_report_snapshots` mapped to `ReportSnapshot`.

This method is the **scaling seam** (see §Scaling): at very large volumes it is replaced by a
SQL/rollup aggregation method (`getPortfolioTrend`) behind the same `PortfolioTrendAggregator`,
with no change to the endpoint or frontend.

### Pure aggregation function

```ts
export interface TrendBucket {
  date: string;        // ISO date (YYYY-MM-DD)
  gold: number;
  silver: number;
  bronze: number;
  none: number;        // images whose as-of snapshot has no/unknown tier
  total: number;       // gold+silver+bronze+none
  avgScore: number;    // mean score across images with a numeric score (0 if none)
}

export function aggregateTrend(
  snapshots: ReportSnapshot[],
  opts: { days: number; today: string },  // today = ISO date; injected for deterministic tests
): TrendBucket[];
```

**Algorithm (delta/event-based):**

1. Group snapshots by `imageRef`; sort each image's snapshots by `snapshotDate`.
2. Window = `[today - (days-1), today]`, one bucket per day.
3. **Baseline (day 0 of window):** for each image, take its latest snapshot **≤ window start**;
   that image contributes to the start bucket's tier count + score. Images with no snapshot at
   or before window start simply don't exist yet (not counted until their first in-window
   snapshot).
4. **Apply transitions within the window:** walk each image's in-window snapshots in date
   order; on each, record a delta at that date (remove the previous tier/score, add the new).
   The daily series is the running cumulative of the baseline plus deltas (carry-forward fills
   the gaps between snapshots).
5. `tier` normalisation: lowercase; map `gold`/`silver`/`bronze` to their bucket, everything
   else (null/unknown/empty) to `none`. `avgScore` averages only numeric `score`s present in
   each day's as-of set.

Cost: **O(N snapshots in/just-before window + D days)** — never O(days × images).

### Warmed-cache aggregator

`PortfolioTrendAggregator` mirrors the existing `CatalogAggregator`:

- Holds the last-computed `TrendBucket[]` + `generatedAt`.
- `refresh()` = `aggregateTrend(await store.listSnapshots(), { days, today })`.
- `ensureFresh(maxAgeMs)` recomputes if stale; `getSnapshot()` returns the cached series.
- Warmed by the scheduler (same cadence pattern as `regis-aggregate`, `scope: 'local'`) +
  `ensureFresh` on read. **Per-request cost is O(1)**; the heavy computation runs periodically.

## Scaling design (≥170k images) — explicit seams

The brainstorm constraint: v1 uses Approach 1, but must not paint us into a corner at 170k+
images. The seams:

1. **Warmed cache** → per-request serve is O(1) regardless of portfolio size (primary v1
   mitigation; the expensive pass runs on a schedule, not per request).
2. **Delta algorithm** → no O(days × images) cliff.
3. **Aggregation seam at the store.** `listSnapshots()` + in-memory `aggregateTrend` can be
   replaced by a `getPortfolioTrend(days, today)` implemented in **SQL** or backed by a
   **precomputed daily rollup table** (`regis_portfolio_daily`, maintained incrementally by the
   recorder), behind the same `PortfolioTrendAggregator` — endpoint and frontend unchanged.
4. **`owner`/`system` denormalisation.** Adding `owner`/`system` columns to
   `regis_report_snapshots` (the index already carries both) unblocks **filtered, fully-SQL**
   aggregation with no catalog join — the basis for the deferred system/owner filters.
5. **Volume guard, no silent cliff.** If `listSnapshots()` returns more than a configurable
   threshold (e.g. `regis.portfolio.inMemoryRowLimit`, default ~500k), the aggregator **logs a
   warning** recommending the SQL/rollup path. It still computes (no hard failure), but the
   operational signal is explicit.

These are **documented future work**, not built in v1. v1 ships items 1–2 and the seam shape of
3; items 4–5's columns/guard are cheap and may land in v1 if trivial (decided in the plan).

## API

`GET /portfolio/trend?days=90`

```json
{
  "generatedAt": "2026-06-03T08:00:00.000Z",
  "days": 90,
  "buckets": [
    { "date": "2026-03-06", "gold": 3, "silver": 2, "bronze": 1, "none": 0, "total": 6, "avgScore": 84 }
  ]
}
```

- `days` is parsed and **bounded** (e.g. clamp to `[1, 365]`, default 90).
- Auth via `httpAuth.credentials` (same as `/reports`).
- Served from the aggregator's cached snapshot (`ensureFresh`), like `/reports`.
- `PortfolioTrend` (`{ generatedAt, days, buckets: TrendBucket[] }`) is exported from
  `regis-common`, consistent with the existing contract types.

## Frontend — Portfolio Trends page

- A dedicated page extension (`PageBlueprint`) at e.g. `/regis-portfolio`, plus a nav item,
  registered in `plugins/regis/src/plugin.tsx`. Data fetched via a new
  `RegisClient.getPortfolioTrend(days)` (the established `RegisClient` + `useApi(regisApiRef)`
  pattern).
- **KPI cards** (from the latest bucket + delta vs the first in-window bucket): current
  Gold / Silver / Bronze counts, average score, total images — each with a ▲/▼ delta over the
  window.
- **Stacked-area chart** of the tier distribution across the 90 daily buckets + an **average-
  score line**. Rendered as a **dependency-free inline SVG** (consistent with
  `RegisTrajectoryCard`'s sparkline): stacked bands for gold/silver/bronze/none, a score
  polyline on a secondary scale, with first/last date labels and a tier/score legend. Tier colours reuse the trajectory card's map.
- Explicit **loading / empty / error** states (empty = "No portfolio history recorded yet").

## Error handling & edge cases

| Case | Behaviour |
| --- | --- |
| Store empty | All buckets 0; page shows the empty state |
| Image with no/unknown tier in its as-of snapshot | Counted in the `none` bucket |
| Image's first snapshot is mid-window | Not counted before that date; appears from its first snapshot onward |
| `days` out of range / non-numeric | Clamp to `[1, 365]`; non-numeric → default 90 |
| Window entirely before any snapshot | All buckets 0 |
| `avgScore` with no numeric scores that day | `0` (documented), not `NaN` |
| Snapshot volume over the in-memory threshold | Aggregator logs a warning (scale signal); still computes |

## Non-goals & open questions

**Non-goals (deliberate, this slice):**

- System/owner **filters** (deferred to the scale phase with the denormalised columns).
- The SQL / precomputed-rollup aggregation implementation (seam designed, not built).
- Per-system trend card and digest-moves view (separate follow-on slices on the same store).
- Retention/pruning of snapshots (separate slice).

**Open questions (for the implementation plan):**

- Whether to land the `owner`/`system` columns + volume-guard (§Scaling items 4–5) in v1 or
  defer — they are cheap; decide based on plan size.
- Exact nav placement (a top-level item vs a tab on the existing `/regis` catalog page).
- Refresh cadence / cache TTL for `PortfolioTrendAggregator` (propose 30 min, matching
  `regis-aggregate`).

## References

- Report history store (the source of snapshots): `docs/superpowers/specs/2026-06-02-regis-backstage-report-history-store-design.md`
- Store + types: `plugins/regis-backend/src/service/ReportHistoryStore.ts`, `plugins/regis-common/src/report-api.ts`
- Warmed-cache precedent: `plugins/regis-backend/src/service/CatalogAggregator.ts`
- Router style + FE client/card precedents: `plugins/regis-backend/src/router.ts`, `plugins/regis/src/api/RegisClient.ts`, `plugins/regis/src/components/RegisTrajectoryCard.tsx`
- Phase 3 decomposition (portfolio KPIs context): `docs/superpowers/plans/2026-06-02-regis-backstage-phase3-decomposition.md`
