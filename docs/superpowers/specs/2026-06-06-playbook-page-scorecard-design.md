# Playbook page: synthesis scorecard + full-width detail

Date: 2026-06-06
Status: Approved (design)

## Problem

The image entity page was recently consolidated into a single overview: a
synthesis scorecard in the top card grid and a full-width detail card below.
The playbook entity page should get the same treatment.

A playbook is a `Resource` with `spec.type === 'regis-playbook'`. It has no
Regis report of its own, so it never had a separate "Regis" tab. Its overview
today shows the *About* card plus a single "Assessed images" card
(`RegisPlaybookImagesCard` → `RegisImagePostureCard`) that crams two things into
one `InfoCard`: a `PostureRollup` aggregate and a table of the governed images.

Two gaps:

- The card mixes synthesis (rollup) and detail (the image table) in one place,
  unlike the image page's clean scorecard-over-detail split.
- The tier ladder the playbook *defines* (for example Gold → Silver → Bronze) is
  shown nowhere, even though it is the playbook's defining content.

## Scope

Applies to playbook entities (`isRegisPlaybook`). The service-images card on a
`Component` page keeps its current combined layout — only its internals are
refactored to share extracted units, with no visible change.

## Approach

Reuse the new frontend system's card grouping, exactly as the image page does.
For a playbook, replace the single combined card with two cards:

- **Top grid (`info`)**: *About* (catalog) · new `RegisPlaybookScorecard`.
- **Bottom, full width (`content`)**: `RegisPlaybookImagesCard` (the image
  table).

Because both cards load through `useImageReports` → `RegisClient`
(`listReports()` + `getPlaybooks()`), and `RegisClient` already dedupes
in-flight GETs, splitting the card into two does not double the network calls —
each request collapses to one round-trip.

Two alternatives were rejected:

- Duplicating the data-loading and table into each new card (violates DRY).
- Moving only the existing combined card into a full-width slot without a
  synthesis split (does not match the image page's scorecard pattern).

## Components

### `useImageReports(imageRefs)` (new hook)

Loads `Promise.all([api.listReports(), api.getPlaybooks()])` via `useAsync` and
returns `{ rows, ladder, playbooks, loading, error }`:

- `rows`: the `ReportSummary[]` whose `entityRef` is in `imageRefs`.
- `ladder`: `unionLadder(playbooks)` for per-image tier coloring.
- `playbooks`: the raw `PlaybookLadder[]`, so a consumer can pick a specific
  playbook's ladder.

Single source of truth shared by all three image-posture surfaces.

### `ImagePostureTable({ rows, ladder })` (extracted)

The Image / Tier / Score columns, the `Table`, and `sortSummariesWorstFirst`,
extracted verbatim from `RegisImagePostureCard`. Purely presentational.

### `TierLadder({ tiers })` (new)

Renders an ordered tier ladder as colored chips (best → worst). Returns `null`
when `tiers` is empty. Small and testable on its own.

### `RegisPlaybookScorecard` (new, `type: 'info'`, filter `isRegisPlaybook`)

The synthesis card, titled "Playbook posture":

- Reads `imageRefs = imageRefsFromRelations(entity, 'dependencyOf')`.
- Uses `useImageReports(imageRefs)`.
- Derives the playbook's own ladder from `playbooks` via a new helper
  `playbookLadder(playbooks, id)` in `format.ts`, matching the entity's
  `regis.io/playbook-id` annotation to `PlaybookLadder.id`.
- Renders `<TierLadder tiers={...} />`, `<PostureRollup rows ladder />`, and a
  caption with the assessed-image count.

When there are no assessed images, the ladder still renders (the playbook
defines its tiers regardless), the rollup is hidden (`PostureRollup` returns
`null` for empty rows), and the caption reads "No assessed images yet".

### `RegisPlaybookImagesCard` (repurposed, `type: 'content'`, full width)

`InfoCard` titled "Assessed images" with the "View in explorer" deep link,
containing `<ImagePostureTable rows ladder />` or `RegisEmptyState` when there
are no rows. Reads the same `imageRefs` and uses `useImageReports`.

### `RegisImagePostureCard` (internal refactor)

Now used only by `RegisServiceImagesCard` (the `Component` page). Refactored to
use `useImageReports` and `ImagePostureTable` internally, keeping its combined
rollup-plus-table layout. No visible change.

### `format.ts`

Add `playbookLadder(playbooks: PlaybookLadder[] | undefined, id: string |
undefined): TrendBand[]` — returns the matching playbook's `tiers`, or `[]` when
the id is unknown.

### `plugin.tsx`

Add a `playbookScorecard` extension (`EntityCardBlueprint`, default `info`,
filter `isRegisPlaybook`, loading `RegisPlaybookScorecard`). Change the existing
`playbookImagesCard` extension to `type: 'content'`.

## Data flow

On a playbook overview, both `RegisPlaybookScorecard` and
`RegisPlaybookImagesCard` call `useImageReports`, which issues `listReports()`
and `getPlaybooks()`. The `RegisClient` in-flight dedup collapses the two
concurrent identical GETs into one round-trip each. The scorecard additionally
selects its own ladder from the already-fetched `playbooks`.

## Error handling and states

Each card keeps its own `Progress` / `ResponseErrorPanel` states, since the
cards are independent extensions with no shared parent. Cards do not mount when
the entity is not a playbook. Empty-image states are handled per card as
described above.

## Testing

Tests are colocated and dense (TDD, near 1:1), per project convention.

- New: `useImageReports.test`, `ImagePostureTable.test`, `TierLadder.test`,
  `RegisPlaybookScorecard.test`, `RegisPlaybookImagesCard.test`, and
  `playbookLadder` cases in `format.test`.
- Updated: `RegisImagePostureCard.test` / `RegisRelatedImagesCards.test` to
  reflect the internal refactor (service-page behavior unchanged).

## Impact

No routes change. The playbook overview gains a synthesis card and moves the
image table to a full-width slot; the service-images card is visually
unchanged.
