# Service & playbook image cards redesign

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** Frontend only (`plugins/regis`). No backend or schema changes.

## Summary

Enrich the two entity cards that list a set of container images — **"Images of
this service"** (on a Component, via `dependsOn`) and **"Assessed images"** (on a
Regis playbook Resource, via `dependencyOf`) — which today render a bare
`Image · Tier · Score` table with a one-line distribution subheader. Both cards
delegate to the shared `RegisImagePostureCard`, so the work lands in one place.

The redesign adds, on top of `RegisImagePostureCard`:

1. **A roll-up header** — a tier-mix bar, per-tier counts, the worst tier
   present, and a count of images with no report.
2. **Actionability** — rows sorted worst-first (lowest tier rank, then lowest
   score), with at-a-glance tier color and a score mini-bar.
3. **Consistency** with the per-image detail redesign — reuse `tierColor` /
   `scoreBarColor`, colored tier chips, the same visual language.

This is approach **B**: the roll-up header is extracted into a reusable
`PostureRollup` component, and the per-set derivations live in a pure `rollup.ts`
module.

## Goals

- **Roll-up health** — a synthesis above the list, not just a distribution string.
- **Actionability** — surface the images dragging the set down (worst-first),
  without per-image rule fetches.
- **Consistency** — match the detail view's tier/score visual language.

## Non-goals

- **Transitivity / blast-radius** (base → derived → service). The documented
  differentiator, deferred to its own spec.
- **Per-image rule detail** on these cards (would require N `getReport` calls).
  Actionability here is tier/score-based only.
- No "at risk" policy judgment. We have no per-playbook "passing threshold", so
  the roll-up stays **factual** (worst tier present), never asserting a policy
  verdict. (Same discipline as the per-image redesign: don't claim what the data
  can't support.)
- No backend, router, or schema changes.

## Personas

- **Application Developer** (service card): "is my service's image supply chain
  healthy, and which image should I fix first?"
- **Platform Engineer / governance** (playbook card): "how is the portfolio doing
  against this policy, and which images are lowest?"

## Available data (constraints)

`RegisImagePostureCard` already fetches `[listReports(), getPlaybooks()]` and
filters `listReports()` to the card's `imageRefs`. Each `ReportSummary` carries
only `entityRef`, `imageRef?`, `tier?`, `score?`, and `status` (`'ok'` vs an
error/missing state) — **no rule detail**. The flattened tier ladder comes from
`unionLadder(playbooks)` and is now authoritatively ordered (the app declares
`regis.playbooks[].tiers` best→worst in config), so tier **rank** is reliable.

## Architecture

All work is in `plugins/regis/src/components`.

### Pure module — `rollup.ts`

React-free, fully unit-tested. Operates on `ReportSummary[]` + the ladder:

- `tierRank(ladder): Map<string, number>` — tier key → rank index (0 = best).
- `mix(rows, ladder): { key: string; label: string; color: string; count: number }[]`
  — per-tier counts in ladder order (best→worst); tiers not in the ladder and
  missing/error rows are bucketed last under a neutral "untiered" entry.
- `worstTier(rows, ladder): { label: string; count: number } | null` — the
  lowest-ranked tier present and how many rows hold it; `null` when every row is
  at the best tier (nothing to highlight).
- `missingCount(rows): number` — rows whose `status` is not `'ok'` (no usable
  report).
- `sortSummariesWorstFirst(rows, ladder): ReportSummary[]` — stable,
  non-mutating: missing/error first, then worst tier rank, then ascending score.

### `PostureRollup.tsx` (new, reusable, presentational)

Props: `{ rows: ReportSummary[]; ladder: TrendBand[] }`. Renders:

- A horizontal **mix bar**: one segment per `mix()` entry, width ∝ count, color =
  tier color (neutral grey for the untiered bucket).
- A **counts line**: `n <tier>` per entry with a color dot.
- A **worst indicator**: `Worst: <tier> · <n>` from `worstTier()` (hidden when
  `null`).
- A **no-report count**: `n no report` when `missingCount() > 0`.

Empty `rows` → renders nothing (the card owns the empty state).

### `RegisImagePostureCard.tsx` (modified)

- Keep the existing fetch + filter; compute `ladder = unionLadder(playbooks)`.
- Header: render `<PostureRollup rows={rows} ladder={ladder} />` in the card body
  (replacing the plain distribution subheader).
- Table: data = `sortSummariesWorstFirst(rows, ladder)`. Columns:
  - **Image** — `EntityRefLink` to `entityRef` (label `imageRef ?? entityRef`).
  - **Tier** — a colored chip via `tierColor(tier, ladder)` (`—` when absent).
  - **Score** — the number plus a mini-bar filled to `score`, colored by
    `scoreBarColor(score)`.
- New optional prop `exploreLink?: string`. When set, the card title shows a
  `View in explorer →` link (a Backstage `Link` to that route). When unset, no
  link.
- Preserve loading / error / empty states.

### `RegisRelatedImagesCards.tsx` (modified)

- `RegisServiceImagesCard` — unchanged props (no `exploreLink`; a service has no
  explorer facet).
- `RegisPlaybookImagesCard` — pass `exploreLink` pointing at the explorer scoped
  to this playbook: `/?groupBy=playbook&playbook=<playbookKey>`, where
  `playbookKey` derives from the playbook entity (e.g. `entity.metadata.name` or
  its title — confirmed during planning against how the explorer `playbook`
  facet matches).

## Edge cases

- **All images at the best tier** → mix bar all one color, worst indicator hidden.
- **Some images missing reports** (`status !== 'ok'`) → counted in the untiered
  bucket and the `no report` count; sorted first.
- **No images match** (`imageRefs` empty or none tracked) → existing
  "No Regis-tracked images" empty state; `PostureRollup` renders nothing.
- **Tier not in the ladder** → bucketed as untiered (neutral color), ranked last.
- **Missing score** → mini-bar empty, number shown as `—`.

## Testing

Colocated, near-1:1 (TDD):

- `rollup.test.ts` — `tierRank`, `mix` (order + untiered bucket), `worstTier`
  (rank-based, `null` when all-best), `missingCount`, `sortSummariesWorstFirst`
  (missing-first, worst-tier, score tie-break, non-mutation).
- `PostureRollup.test.tsx` — mix segments, counts, worst indicator shown/hidden,
  no-report count, empty rows render nothing.
- `RegisImagePostureCard.test.tsx` — roll-up present, rows sorted worst-first,
  tier chip + score bar render, `exploreLink` shown only when provided,
  loading/error/empty states.
- `RegisRelatedImagesCards.test.tsx` — service card has no explorer link; playbook
  card links to the scoped explorer route.

## Out of scope / future

- Approach **C**: per-image rule enrichment (top failing severities/categories
  for the worst images, via lazy `getReport`).
- Transitivity / blast-radius on the service card.
- A shared roll-up across the explorer's `Breakdown` (possible later reuse of
  `PostureRollup`; not refactored here).
