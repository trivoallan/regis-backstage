# Posture trajectory chart

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** Frontend only (`plugins/regis`). No backend or schema changes.

## Summary

Replace the tiny, axis-less posture `Sparkline` with a readable **trajectory
chart**: a score-over-time line with proper axes plus a **tier lane** that makes
tier transitions obvious. The chart shows the two stories separately — the score
curve (value) and the tier lane (Gold→Silver→Bronze over time) — instead of
overloading one line. Dependency-free SVG, consistent with the existing
`portfolioChart` / `Sparkline` approach (no charting library in the repo).

This is approach **A** from the brainstorm ("axes'd chart + tier lane").

## Goals

- **Readability:** dated x-axis, a 0–100 y-axis with gridlines/labels, enough
  size, a per-point tooltip (date · score · tier).
- **Tier transitions:** a tier lane below the plot — contiguous segments colored
  by the active tier over each interval; color changes = transitions.

## Non-goals

- No tier-threshold **bands** behind the chart (that needs per-tier score
  thresholds, which aren't reliably available — same data gap as the deferred
  next-tier feature).
- No comparison overlay (portfolio average / base image) — separate, larger work.
- No true time-scaled x-axis: points are evenly spaced **by index** (matching the
  existing `Sparkline` / `portfolioChart`); date labels are sampled.
- No backend, router, or schema changes (history is already served by
  `getHistory`).

## Available data (constraints)

`api.getHistory(entityRef)` returns `ReportHistory { imageRef, snapshots:
ReportSnapshot[] }`. Each `ReportSnapshot` carries `{ snapshotDate (ISO date),
score?, tier?, ... }`. The flattened tier ladder comes from `getPlaybooks()` /
`unionLadder` (already fetched by the trajectory card) for `tierColor`. Snapshots
without a numeric `score` are not plotted (current behavior).

## Architecture

All work is in `plugins/regis/src/components`.

### Pure module — `trajectory.ts` (new)

React-free, unit-tested. Derives chart-ready data from `ReportHistory`:

- `points(history): TrajectoryPoint[]` — snapshots with a numeric `score`, sorted
  ascending by `snapshotDate`, mapped to `{ date: string; score: number; tier?:
  string | null }`.
- `tierSpans(points): TierSpan[]` — contiguous runs of the same `tier`, each
  `{ tier: string | null; fromIndex: number; toIndex: number }` (the tier lane;
  span boundaries are the transitions; a `null`/absent tier is its own neutral
  span).
- `summary(points): { count: number; latestTier: string | null; latestScore:
  number | null; delta: number }` — `delta = latest.score − first.score` (0 when
  fewer than 2 points).

### `TrajectoryChart.tsx` (new)

Dependency-free SVG, modeled on `portfolioChart` (padded viewport). Props:
`{ history: ReportHistory; ladder: TrendBand[]; compact?: boolean }`.

- **Insufficient data:** `points().length < 2` → render "Not enough history to
  plot a trend yet." (preserves the current `Sparkline` empty state).
- **Full mode:** y-axis 0–100 with gridlines + labels (0/25/50/75/100); x-axis
  with ~6 evenly-sampled date labels (all points still plotted, spaced by index);
  the score polyline; per-point dots colored by `tierColor(point.tier, ladder)`
  with a `<title>` tooltip (`<date>: <score> (<tier|none>)`); a **tier lane**
  below the plot built from `tierSpans` — one rounded rect per span colored by
  `tierColor`, with the tier label centered (neutral grey for a `null` tier). The
  chart `<svg>` has `role="img"` + an `aria-label` summarizing the trajectory.
- **Compact mode** (for `QuickLookPanel`): smaller width/height, reduced axis
  chrome (only 0/100 y ticks and first/last date labels), the score line + dots,
  and the **tier lane kept** (the key signal). Same insufficient-data message.

### `RegisTrajectoryCard.tsx` (modified)

- Render `<TrajectoryChart history={history} ladder={ladder} />` instead of
  `<Sparkline .../>`.
- Subheader gains the delta: `${snapshots.length} snapshots · latest <tier>
  (<score>) · ▲/▼ N` using `summary().delta` (`±0` when zero), reusing the
  `formatDelta`-style arrow formatting (extract/share a small helper if
  convenient; otherwise inline).

### `QuickLookPanel.tsx` (modified)

- Render `<TrajectoryChart history={history} ladder={ladder} compact />` in place
  of the current sparkline usage.

### `Sparkline.tsx` (removed)

Deleted (component + test) once `TrajectoryChart` replaces it. **Confirm during
planning** that only `RegisTrajectoryCard` and `QuickLookPanel` reference it
(`grep -rn Sparkline plugins/regis/src`); if anything else uses it, adjust.

## Edge cases

- **< 2 plottable points** → "Not enough history…" message (both modes).
- **Snapshots without a numeric score** → excluded from `points` (not plotted).
- **Single tier throughout** → one full-width lane segment.
- **Null/unknown tier on a snapshot** → neutral-grey dot and lane segment.
- **Many snapshots** → all dots plotted (spaced by index); x date labels sampled
  to ~6 so they don't overlap.
- **Loading / error / empty history** → owned by `RegisTrajectoryCard` /
  `QuickLookPanel` as today (unchanged).

## Testing

Colocated, near-1:1 (TDD):

- `trajectory.test.ts` — `points` (filters non-numeric score, sorts by date),
  `tierSpans` (contiguous runs, a transition, a `null`-tier span, single-tier
  case), `summary` (count, latest tier/score, delta incl. `< 2` → 0).
- `TrajectoryChart.test.tsx` — renders an `svg[role="img"]`, a score `polyline`,
  N tier-lane rects for N spans, the insufficient-history message for < 2 points,
  and compact mode rendering.
- `RegisTrajectoryCard.test.tsx` — renders `TrajectoryChart` and the delta in the
  subheader.
- `QuickLookPanel.test.tsx` — renders the compact trajectory.

## Out of scope / future

- Tier-threshold band backgrounds (needs the tier conditions/score thresholds —
  see the deferred next-tier grounding notes).
- Comparison overlays (portfolio average, base image).
- True time-scaled x-axis.
