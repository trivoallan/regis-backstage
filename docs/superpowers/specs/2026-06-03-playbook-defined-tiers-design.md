# Playbook-defined tiers design

Date: 2026-06-03

## Problem

Regis tiers (such as Gold, Silver, Bronze) are **not a fixed vocabulary**. Each
Regis playbook defines its own tiers as an ordered list of `{ name, condition }`
entries, where `condition` is a JSON Logic expression evaluated against the
analysis results. The evaluator checks tiers in declared order and assigns the
first whose condition is truthy. See
[Regis playbooks → tiers](https://trivoallan.github.io/regis/docs/concepts/playbooks#tiers).

The wire format already reflects this: `report.tier` and `IndexImageEntry.tier`
are `string | null`. But the plugin's aggregation and UI layers hardcode the
`Gold/Silver/Bronze` vocabulary:

- `report-api.ts` — `TrendBucket` has fixed `gold/silver/bronze/none` fields.
- `aggregateTrend.ts` — a `Tier` literal type and a `tierOf()` that coerces any
  other value to `none`.
- `format.ts` — `tierColor()` is a `switch` over gold/silver/bronze.
- `portfolioChart.tsx` — hardcoded `BANDS` and `TIER_COLOR`.
- `RegisImagePostureCard.tsx` — `TIER_ORDER = ['Gold','Silver','Bronze']`.
- `RegisPortfolioTrendsPage.tsx` — hardcoded Gold/Silver/Bronze KPI cards.

Any custom tier name silently collapses to "none" in trends and renders grey in
the UI. The portfolio must support **multiple coexisting ladders**: different
images are assessed by different playbooks, each with its own tier scale (for
example `Gold/Silver/Bronze` for one and `Platinum/Certified/Experimental` for
another).

## Goal

Treat a tier as an entry in an **open, ordered, playbook-defined vocabulary**
(a "ladder") everywhere in the plugin. Remove all hardcoded tier vocabulary.
Support a portfolio of images spanning multiple ladders.

## Core concepts

A **ladder** is a playbook's ordered list of tier names, best to worst. Order is
authoritative and defines a tier's **rank** (rank 1 = best).

Two display registers:

1. **Per-image views** (scorecard, catalog row, trajectory) show the **real tier
   name and color** from the image's playbook.
2. **Portfolio rollup** (trends dashboard) defaults to **normalized ranks** —
   rank 1 = the best tier of *its own* ladder, rank 2, …, plus "none" for images
   with no/unknown tier. This is vocabulary-agnostic, so heterogeneous ladders
   stack in one chart. A **playbook filter** switches the rollup to a single
   ladder shown with its real tier names and colors.

### Ladder resolution (cascade)

The plugin resolves `playbookId → ladder` in priority order:

1. **Published index** (source of truth) — the index carries each playbook's
   ordered tiers.
2. **Discovery fallback** — when the index omits tiers, derive the set of tier
   names observed in snapshots/reports. Order is alphabetical (no reliable rank);
   colors come from the deterministic palette.
3. **Config override** — `regis.tiers` in `app-config.yaml` may override colors
   (and order) per operator preference.

### Uneven ladder depth

In normalized-rank mode, the number of bands is dynamic: `rank1 … rankMax`,
where `rankMax` is the deepest ladder observed, plus `none`. An image on a
3-tier ladder only ever contributes to ranks 1–3. We accept a small semantic
bias (rank 3 of 3 = worst, rank 3 of 5 = middle, both land in `rank3`); the
playbook filter is the escape hatch for faithful per-ladder analysis.

The JSON Logic `condition` of a playbook tier is **not** transported into the
plugin — the plugin needs only the ordered names (and optional colors). Regis
computes the earned tier.

## Data model and wire format (`regis-common`)

### Index — add ordered tiers to playbook entries

```ts
interface IndexPlaybookEntry {
  id: string;
  title?: string;
  version?: string;
  owner?: string;
  /** Ordered best→worst. Array order is the source of truth for rank. */
  tiers?: Array<{ name: string; color?: string }>;
}
```

`tiers` is an optional addition to `schemaVersion: 1` — backward compatible, so
**no bump** of `SUPPORTED_INDEX_SCHEMA_VERSION`. An index without `tiers`
triggers the discovery fallback. Update `report-index.schema.json` accordingly.

### Generic trend bucket

`TrendBucket` drops the fixed tier fields. Counts become a map keyed by **band
id** (rank ids in the default view, real tier names in the filtered view):

```ts
interface TrendBucket {
  date: string;                    // ISO date (YYYY-MM-DD)
  counts: Record<string, number>;  // e.g. { rank1: 12, rank2: 5, none: 1 } or { Gold: 9, ... }
  total: number;
  avgScore: number;
}
```

Images with no/unknown tier are a band like any other: they land in
`counts.none`, and `bands` includes a `none` entry (grey). There is no separate
top-level `none` field — keeping it only in `counts` avoids duplication. `total`
is the sum of all `counts` values.

### Trend response carries band metadata

```ts
interface TrendBand { key: string; label: string; color: string; }

interface PortfolioTrend {
  generatedAt: string;
  days: number;
  filters: { system?: string; owner?: string; playbook?: string };
  facets: { systems: string[]; owners: string[]; playbooks: string[] };
  bands: TrendBand[];   // stacking order = array order
  buckets: TrendBucket[];
}
```

The frontend renders entirely from `bands` — no hardcoded vocabulary.

## Backend

### LadderResolver (new service)

A single-responsibility service that produces `Map<playbookId, ladder>` from
(1) the index, (2) discovery fallback over observed tier values, and (3)
`regis.tiers` config overrides for colors/order. Tested in isolation; consumed
by the aggregator and the `/playbooks` endpoint.

### aggregateTrend — vocabulary-agnostic rewrite

```ts
aggregateTrend(snapshots, {
  days, today,
  ladders: Map<string, string[]>,                 // playbookId → ordered tiers
  mode: { kind: 'rank' } | { kind: 'playbook'; playbook: string },
}): { bands: TrendBand[]; buckets: TrendBucket[] }
```

- Remove the `Tier` literal type and `tierOf()`.
- Per snapshot, compute its **band**:
  - `rank` mode: `rank{N}` where `N = indexOf(tier in ladder[playbook]) + 1`;
    missing/unknown → `none`.
  - `playbook` mode: keep only that playbook's snapshots; band = real tier name.
- **Preserve** the existing delta/carry-forward engine (O(snapshots + days)).
  `Counters` moves from fixed fields to `Record<string, number>` plus
  `scoreSum/scored`; `applyState` increments `counts[band]`.
- Returned `bands`: in rank mode, `rank1..rankMax` + `none` colored from a
  deterministic rank palette (green→amber→red); in playbook mode, the real names
  and colors from the ladder.

`ReportSnapshot` already carries `tier` and `playbook`, so no snapshot schema
change is needed.

### PortfolioTrendAggregator

Receives the ladder map (injected by the plugin), handles the `playbook` param,
and includes it in the cache key (as `system`/`owner` already are). The
`scope: 'local'` warm-up stays.

### Router

- `GET /portfolio/trend` accepts `?playbook=` alongside `system`/`owner`; the
  response includes `bands` and `facets.playbooks`.
- `GET /playbooks` (new) returns `{ playbooks: Array<{ id, title?, tiers: TrendBand[] }> }`,
  the resolved ladder map, for per-image color/order lookups.

## Frontend

- **`format.ts`** — `tierColor(tier, ladder?)` becomes a lookup in the resolved
  ladder, falling back to a deterministic hash palette, then grey. The current
  Gold/Silver/Bronze colors become the demo playbook's index-supplied colors, not
  a plugin constant.
- **`RegisClient.getPlaybooks()`** — new client method calling `GET /playbooks`,
  client-cached (usePromise/SWR like the rest). Per-image components look up their
  image's ladder for color/order.
- **`portfolioChart.tsx`** — data-driven: remove `BANDS`/`TIER_COLOR`; read
  `trend.bands` and `bucket.counts[band.key]`. Stacked-area + avg-score line
  logic is unchanged; the legend is generated from `bands`.
- **`RegisPortfolioTrendsPage.tsx`** — add a **playbook selector** beside the
  existing system/owner filters (from `facets.playbooks`); empty = normalized-rank
  view, a chosen playbook = real-ladder view. The KPI strip becomes dynamic: one
  card per returned band, plus total and avg score.
- **`RegisImagePostureCard.tsx`** — replace `TIER_ORDER` with the order from the
  relevant playbook's ladder.
- **`RegisCatalogPage.tsx` / scorecard** — the Tier column/badge uses
  `tierColor(tier, ladder)`.
- **Graceful degradation** — if `/playbooks` returns no ladder (older backend or
  fallback), per-image components use the deterministic palette and alphabetical
  order; nothing breaks.

## Demo data and tests

### Demo generator (`examples/regis-dataset.cjs`)

Demo data is generated — never hand-edit the output. Extend the generator to
exercise the multi-ladder case:

- The existing demo playbook keeps `Gold/Silver/Bronze` (with colors), now
  emitted in `index.json` under `playbooks[].tiers`.
- Add a **second playbook** with a distinct ladder (for example `data-platform`
  → `Platinum/Certified/Experimental`) covering a subset of images, so the
  dashboard shows both the normalized-rank view and the playbook-filtered view
  with genuinely different vocabularies.
- The synthetic history (`historySeedUrl`) carries coherent `playbook` + `tier`
  so trajectory and trend have mixed data at boot.
- Regenerate with `node examples/regis-dataset.cjs`; update `examples/README.md`
  if the end-to-end usage changes.

### Tests (colocated, near-1:1, TDD — failing test first)

- `regis-common`: validate an index with and without `tiers`; backward
  compatibility (a v1 index without the field still validates).
- `LadderResolver`: index present → canonical order; absent → discovery fallback;
  config override for colors/order.
- `aggregateTrend`: rank mode with **ladders of different depths** (3 vs 5),
  images with no tier → `none`, carry-forward unchanged; playbook mode → bands =
  real names, out-of-playbook snapshots excluded.
- `PortfolioTrendAggregator`: `playbook` in the cache key; `facets.playbooks`.
- `router`: `GET /portfolio/trend?playbook=`, `GET /playbooks`.
- Frontend: `portfolioChart` driven by `bands` (arbitrary band count), dynamic
  KPIs, playbook selector, `tierColor`/order via ladder, graceful degradation
  without `/playbooks`.

After changing exported APIs, run `yarn fix` to regenerate `report.api.md` /
`config.d.ts`.

## Out of scope (YAGNI)

- Transporting the JSON Logic `condition` into the plugin.
- Re-evaluating tiers inside Backstage (Regis computes the earned tier).
- `scoreStatus` score thresholds (a separate concern).
- Governance/intake changes.
