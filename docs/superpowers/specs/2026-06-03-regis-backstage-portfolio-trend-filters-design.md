# Regis Backstage — Portfolio Trend Filters (system / owner) — Design

> **Date**: 2026-06-03
> **Status**: Design approved (brainstorming), pending implementation plan
> **Scope**: Add **system** and **owner** filters to the Portfolio Trends dashboard — the
> work the dashboard spec deferred. Denormalise `owner`/`system` onto report snapshots, filter
> the cached series in-memory before aggregation, expose snapshot-derived facet values, and add
> two single-select dropdowns to the page.
> Builds on the [portfolio trend dashboard](2026-06-03-regis-backstage-portfolio-trend-dashboard-design.md)
> and the [report history store](2026-06-02-regis-backstage-report-history-store-design.md).

## Context & objective

The portfolio dashboard aggregates the **whole** portfolio's posture over time. Leadership and
team views need to slice that by **system** (e.g. `shop`) and **owner** (e.g.
`group:default/team-payments`). The dashboard spec deferred filters to "the scale phase with the
denormalised columns" — this slice delivers them.

Today snapshots carry no `owner`/`system` (the recorder drops them, though the published index
`IndexImageEntry` already provides both). This slice **denormalises** those two fields onto each
snapshot so filtering needs no catalog join, applies the filter **in-memory on the warmed cache**
(consistent with the dashboard's current in-memory aggregation), and surfaces the selectable
values as facets in the trend response.

## Locked decisions (2026-06-03 brainstorm)

| Axis | Decision |
| --- | --- |
| Filter location | **In-memory, on the warmed cache** — filter the cached snapshot array before `aggregateTrend`. The SQL/rollup path stays future work |
| Filter semantics | **Single-select per facet**, combined with **AND** (`system = X` AND `owner = Y`); each facet has an "All" (unset) option |
| Facets source | **Derived from snapshots** (distinct non-empty `system`/`owner` over the full cached set), returned **in the `/portfolio/trend` response** |
| Denormalisation | Add `owner` + `system` columns to `regis_report_snapshots`; the recorder populates them from the index entry |
| Owner display | Raw entity ref string (e.g. `group:default/team-payments`); no humanisation in v1 |
| Out of scope | Multi-select; SQL/rollup aggregation; catalog-derived facets; a separate `/portfolio/facets` endpoint |

## Data model — denormalise `owner` / `system`

- **`ReportSnapshot`** (`regis-common`) gains `owner?: string` and `system?: string`.
- **`toSnapshots`** (`RegisHistoryRecorder`) maps `e.owner` / `e.system` from each `IndexImageEntry`
  (both already optional fields on the index entry).
- **`regis_report_snapshots`** gains two nullable text columns, `owner` and `system`.
- **Migration (idempotent, runs on boot).** `KnexReportHistoryStore.create` today creates the
  table if missing (catching "already exists"). Extend it: after ensuring the table exists, for
  each of `owner`/`system`, `if (!(await db.schema.hasColumn(TABLE, col))) await db.schema.alterTable(... add column)`.
  This adds the columns to the **existing** production table (merged in #8) on the next boot, and
  is a no-op thereafter. `listSnapshots` / `getByImageRef` map the new columns (null → undefined),
  consistent with the existing read contract.
- **Backfill.** Rows written before this change have null `owner`/`system` until the recorder
  re-records them (idempotent upsert `merge` on the next ~30-min tick refreshes every row from the
  index). Until then such a row is **excluded from any specific filter** but still counted under
  "All". This transient gap is acceptable and documented (no historical accuracy is lost — the
  index is the source of truth and re-records the current owner/system).

## Aggregation — filter before `aggregateTrend`

- `PortfolioTrendAggregator.trend(days, today, filters?)` gains an optional
  `filters: { system?: string; owner?: string }`. It filters the **cached** snapshot array
  (`s.system === filters.system` when set **AND** `s.owner === filters.owner` when set) and passes
  the filtered array to the existing pure `aggregateTrend` — **`aggregateTrend` is unchanged**.
- `PortfolioTrendAggregator.facets(): { systems: string[]; owners: string[] }` — distinct,
  non-empty `system` / `owner` values across the **full** cached set, sorted ascending. Facets are
  always the unfiltered universe so the user can switch selections.
- The warmed cache is unchanged (it still holds all snapshots); filtering and faceting are cheap
  per-request reads over the cached array. At very large volumes the same documented seam applies
  — a SQL `getPortfolioTrend(filters)` / rollup replaces the in-memory path behind this method.

## API

`GET /portfolio/trend?days=90&system=<s>&owner=<o>` — `system` and `owner` optional (absent =
unfiltered).

```json
{
  "generatedAt": "2026-06-03T08:00:00.000Z",
  "days": 90,
  "filters": { "system": "shop" },
  "facets": {
    "systems": ["billing", "shop"],
    "owners": ["group:default/team-payments", "group:default/team-storefront"]
  },
  "buckets": [
    { "date": "2026-03-06", "gold": 3, "silver": 2, "bronze": 1, "none": 0, "total": 6, "avgScore": 84 }
  ]
}
```

- `filters` echoes the **applied** values (only keys that were set); `facets` is the full
  selectable universe; `buckets` is the **filtered** series.
- `PortfolioTrend` (`regis-common`) gains `filters: { system?: string; owner?: string }` and
  `facets: { systems: string[]; owners: string[] }` (additive — existing consumers keep working).
- `days` clamp, auth, and cache-serving (`ensureFresh`) are unchanged.

## Frontend

- `RegisClient.getPortfolioTrend(days, filters?)` — builds the query string with
  `system`/`owner` when provided (URL-encoded); returns the extended `PortfolioTrend`.
- The **Portfolio Trends page** gains two single-select `Select` dropdowns (System, Owner), each
  with an **"All"** option, populated from the response `facets`. Selected values live in page
  state; the data fetch re-runs when a filter changes (`useAsync` dependency on the filter state).
  KPI cards + chart render the filtered series. Owner options display the raw entity-ref string.
- States: loading / error / empty. Empty under a filter shows "No history for this filter"
  (distinct from the unfiltered "No portfolio history recorded yet").

## Example data

- `examples/regis-dataset.cjs` `buildHistory` adds `owner` and `system` to each generated
  snapshot (from the image's `owner` / `system`), so the seeded `regis-history.json` is filterable
  and the demo dropdowns are populated.

## Error handling & edge cases

| Case | Behaviour |
| --- | --- |
| Filter value not present in any snapshot | Filtered set empty → all-zero buckets → page empty state |
| Snapshot with null `owner`/`system` | Excluded from a specific filter; included under "All"; never appears as a facet value |
| Existing rows not yet backfilled | Null owner/system until next recorder tick; same as above |
| Both filters set | AND — only snapshots matching both |
| Migration on a table that already has the columns | `hasColumn` guard → no-op |
| Facets when store empty | `{ systems: [], owners: [] }`; dropdowns show only "All" |

## Testing

- **`toSnapshots`** — maps `owner`/`system` from the index entry (and leaves them undefined when
  the entry omits them).
- **Store** — `listSnapshots`/`getByImageRef` round-trip `owner`/`system`; **migration test**:
  create a table *without* the columns (raw `createTable`), call `KnexReportHistoryStore.create`,
  assert `hasColumn(owner)` and `hasColumn(system)` are now true and a round-trip works; idempotent
  on a second `create`.
- **Aggregator** — `trend(days, today, {system})` / `{owner}` / both filter correctly (a fixture
  with two systems/owners); `facets()` returns distinct, sorted, null-excluded values; an
  unmatched filter yields all-zero buckets.
- **Router** — `GET /portfolio/trend?system=…` returns the filtered series + `filters` echo +
  `facets`; no filter returns the full series with facets.
- **Client** — query string includes `system`/`owner` when set, omits them when not.
- **Page** — dropdowns populated from `facets`; changing a dropdown re-fetches with the filter
  (assert the api mock is called with the new filter); filtered empty state.

## Non-goals & open questions

**Non-goals (deliberate):** multi-select filters; SQL/rollup aggregation (the documented seam);
catalog-derived facets; humanised owner labels; a dedicated facets endpoint; date-range / `days`
picker (separate concern).

**Open questions (for the implementation plan):**

- Whether to also surface the **`none`** (untiered) count as a filterable dimension — likely not
  (it's a tier, not a facet); confirm during planning.
- Owner-label humanisation (strip `group:default/`) — deferred; raw ref for v1.

## References

- Portfolio dashboard: `docs/superpowers/specs/2026-06-03-regis-backstage-portfolio-trend-dashboard-design.md`
- History store: `docs/superpowers/specs/2026-06-02-regis-backstage-report-history-store-design.md`
- Snapshot type + index entry: `plugins/regis-common/src/report-api.ts`, `plugins/regis-common/src/report-index.ts` (`IndexImageEntry.owner`/`system`)
- Recorder / store / aggregator: `plugins/regis-backend/src/service/{RegisHistoryRecorder,KnexReportHistoryStore,ReportHistoryStore,PortfolioTrendAggregator}.ts`
- Router + FE: `plugins/regis-backend/src/router.ts`, `plugins/regis/src/api/RegisClient.ts`, `plugins/regis/src/components/RegisPortfolioTrendsPage.tsx`
- Demo dataset generator: `examples/regis-dataset.cjs`
