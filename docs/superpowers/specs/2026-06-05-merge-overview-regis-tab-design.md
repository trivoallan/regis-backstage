# Merge the overview and Regis tabs for image entities

Date: 2026-06-05
Status: Approved (design)

## Problem

A `container-image` entity (and any entity that exposes a Regis report) currently
shows two tabs that overlap:

- **Overview** (the catalog default): the *About* card plus the Regis cards
  `RegisScorecardCard` (score gauge, tier, badges, status counts),
  `RegisAliasesCard`, and `RegisTrajectoryCard`.
- **Regis** (`RegisTabContent`): `PostureSummary` (identity, tier, score,
  per-category score bars, playbook attribution) followed by `RuleTable` (the
  full rule listing).

Tier and score appear on both tabs. For an image entity, the entity *is* its
Regis posture, so splitting the synthesis from the rule detail across two tabs
adds navigation cost without adding information. The goal is a single landing
tab that presents the synthesis up top and the full rule table below.

## Scope

The merge applies to every entity eligible for Regis (`isRegisAvailable`), not
only `container-image`. The Regis tab is removed everywhere; the rule table moves
onto the overview tab for any entity that has a report.

## Approach

Use the new frontend system's card grouping rather than a custom entity page.
`EntityCardBlueprint` accepts `type: 'info' | 'content'`:

- `info` cards (the default) render in the card grid at the top of the overview.
- `content` cards render full width in the content area below the grid.

The hybrid layout therefore emerges from card types alone, with no bespoke
overview layout to own and keep responsive:

- **Top grid (`info`)**: *About* (catalog) · enriched `RegisScorecardCard` ·
  `RegisAliasesCard` · `RegisTrajectoryCard`.
- **Bottom, full width (`content`)**: new `RegisRulesCard`.

Two alternatives were rejected:

- A custom overview via `EntityContentLayoutBlueprint` gives total layout control
  but adds significant code, diverges from the catalog default, and makes the
  plugin responsible for the responsive grid. Overkill here.
- Keeping the rule table as an `info` card leaves the wide table cramped in the
  card grid, hurting readability.

## Components

### `CategoryBreakdown` (new)

Extracted from `PostureSummary`. Props: `{ rulesSummary }`. Renders the
per-category (per-tag) score bars. A small, isolated unit reused by the
scorecard and testable on its own.

### `RegisScorecardCard` (enriched)

Keeps the score gauge, tier chip, badges, and status counts. Adds:

- `<CategoryBreakdown>` for the per-category bars.
- Clickable playbook attribution via `EntityRefLink` when the
  `regis.io/playbook` annotation is present (requires adding `useEntity`);
  falls back to the existing plain caption otherwise.
- The scan date as a caption.

Stays `type: 'info'`. This card becomes the complete synthesis, so the redundant
`repo:tag` identity line from `PostureSummary` is dropped — the *About* card and
entity title already carry the identity.

### `RegisRulesCard` (new, `type: 'content'`)

Loads data through `useReportAndLadder` and renders the "View in explorer" link
(only when a playbook is present) followed by `<RuleTable>`. Full width.

### Removed

- `RegisTabContent.tsx` and its test.
- `PostureSummary.tsx` and its test — its logic moves to `RegisScorecardCard`
  and `CategoryBreakdown`.

### `plugin.tsx`

Remove the `reportTab` extension. Add a `rulesCard` extension
(`EntityCardBlueprint`, `type: 'content'`, `filter: isRegisAvailable`).

## Data flow

When the overview mounts, both the scorecard and the rules card call
`useReportAndLadder`, which issues `getReport(ref)` and `getPlaybooks()`. Before
this change the two consumers lived on separate tabs and were never mounted
together; now they mount on the same tab, so each request would fire twice.

`RegisClient` does not currently dedupe requests. Add lightweight in-flight
deduplication to `RegisClient.getJson`: a `Map<path, Promise>` that returns the
pending promise for an identical concurrent GET and clears the entry once the
promise settles. Two concurrent identical GETs collapse to one round-trip. This
is transparent to callers and benefits the whole plugin.

Hoisting the fetch into a shared provider was rejected: in the new frontend
system the cards are independent extensions placed by the catalog, with no
shared parent we control without reintroducing a custom entity page.

## Error handling and states

Each card keeps its own `Progress` / `ResponseErrorPanel` states, since
Approach A has no shared parent. Cards do not mount when the entity has no report
(`isRegisAvailable` is false). The "View in explorer" link renders only when a
playbook is present.

## Testing

Tests are colocated and dense (TDD, near 1:1), per project convention.

- New: `CategoryBreakdown.test`, `RegisRulesCard.test`, and an in-flight dedup
  test in `RegisClient.test`.
- Updated: `RegisScorecardCard.test` for the category bars and clickable
  playbook attribution.
- Removed: `RegisTabContent.test`, `PostureSummary.test`.

## Impact

Deep links to the entity's `.../regis` sub-path no longer resolve, since the tab
is removed. This is internal and acceptable.
