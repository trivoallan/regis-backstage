# Transversal coherence: empty states & navigation

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** Frontend only (`plugins/regis`). No backend or schema changes.

## Summary

A cross-cutting polish pass over the Regis UI: unify the inconsistent bare-string
**empty states** behind one lightweight shared component, and add a small set of
high-value **navigation** links — empty-state CTAs, a detail→explorer link, and a
clickable playbook attribution. Loading (`Progress`) and error
(`ResponseErrorPanel`) handling is already consistent and is left as-is.

## Goals

- **Consistent empty states:** one `RegisEmptyState` component, consistent wording
  and structure across all surfaces (cards and pages), with an optional action.
- **Better navigation:** actionable empty states (clear filters), a scoped
  detail→explorer link, and a playbook name that links to its catalog page.

## Non-goals

- No change to loading/error states (already `Progress` / `ResponseErrorPanel`).
- No Backstage `EmptyState` (illustrated, page-sized) — too heavy for inline cards.
- No per-row "open page" link in the explorer image list: `ExploreImage` carries
  only `imageRef`, not an `entityRef`, so a direct link can't be resolved there.
  The quick-look remains the drill path; its existing "open page" link is just
  made clearer.
- No backend, router, or schema changes.

## Available data (constraints)

- The image **entity** carries `regis.io/playbook` (constant
  `REGIS_ANNOTATION_PLAYBOOK`, value `'regis.io/playbook'`) — the **entityRef** of
  the playbook it was assessed against (e.g. `resource:default/regis-playbook-default`).
  `RegisTabContent` already has the entity via `useEntity()`.
- The **report** carries `playbooks?.[0]?.playbook_name` (the playbook id, e.g.
  `default`), which equals the explorer's `playbook` facet value.
- `RegisExplorerPage` owns the explore `state` (`{ groupBy, filters }`) and its
  `setState`.

## Architecture

All work is in `plugins/regis/src/components`.

### `RegisEmptyState.tsx` (new, shared)

`RegisEmptyState({ title: string; action?: React.ReactNode })` — a centered,
muted empty state: the `title` as `Typography variant="body2"
color="textSecondary"`, with the optional `action` rendered below it. Lightweight
(no illustration); fits both small cards and full-page bodies.

### Unified empty states (modified)

Replace the bare-string empties with `<RegisEmptyState .../>`, with consistent,
period-terminated wording:

- `RegisExplorerPage` — "No images match this scope." + a **Clear filters** action
  (Section: navigation), shown only when `state.filters` is non-empty.
- `RegisImagePostureCard` — "No Regis-tracked images."
- `RegisTrajectoryCard` — "No history recorded."
- `QuickLookPanel` — "No history recorded." (aligned to the same wording).
- `portfolioChart` (`PortfolioStackedArea`) — "No portfolio data yet."
- `TrajectoryChart` — "Not enough history to plot a trend."

(The scorecard's "No tier assigned yet" is a tier-status line, not an empty state
— the card still shows score/badges — and is left unchanged.)

### Navigation (modified)

- **Clear filters CTA** — `RegisExplorerPage`'s empty-state `action` is a
  `Link`/button "Clear filters" that calls `setState({ groupBy: state.groupBy,
  filters: {} })`. Rendered only when `Object.keys(state.filters).length > 0`.
- **Detail → scoped explorer** — `RegisTabContent` renders a "View in explorer"
  `Link` to `/?groupBy=playbook&playbook=<encodeURIComponent(playbook_name)>`
  using `report.playbooks?.[0]?.playbook_name`; omitted when no playbook is named.
- **Playbook attribution link** — `PostureSummary` gains an optional `playbookRef?:
  string` prop. When set, the playbook name in the "Evaluated by playbook …" line
  renders as `<EntityRefLink entityRef={playbookRef}>{name}</EntityRefLink>`;
  otherwise it stays plain text. `RegisTabContent` derives `playbookRef` from
  `entity.metadata.annotations?.[REGIS_ANNOTATION_PLAYBOOK]` and passes it.
- **Quick-look open link** — ensure `QuickLookPanel` shows a clear "Open image
  page →" link (it already links to the entity; confirm during planning and
  adjust the label/placement only — no new resolution logic).

## Edge cases

- **Explorer empty with no active filters** → "No images match this scope." with
  **no** Clear-filters action (nothing to clear).
- **Unknown playbook** (no `playbook_name`) → no "View in explorer" link; the
  attribution stays "Playbook unknown" (existing).
- **No `regis.io/playbook` annotation** on the entity → playbook name stays plain
  text (no link), even if the name is known.
- **`RegisEmptyState` with no action** → just the muted title (most sites).

## Testing

Colocated, near-1:1 (TDD):

- `RegisEmptyState.test.tsx` — renders the title; renders the action when provided;
  renders no action node when omitted.
- `RegisExplorerPage.test.tsx` — the empty state shows "Clear filters" when a
  filter is active, and clicking it clears filters (re-queries with no filters);
  no action when filters are empty.
- `RegisTabContent.test.tsx` — a "View in explorer" link with
  `href="/?groupBy=playbook&playbook=<name>"` when the report names a playbook;
  absent otherwise.
- `PostureSummary.test.tsx` — the playbook name is a link to `playbookRef` when
  provided; plain text when not.
- Updated text assertions in `RegisImagePostureCard.test.tsx`,
  `RegisTrajectoryCard.test.tsx`, `QuickLookPanel.test.tsx`,
  `portfolioChart`/`TrajectoryChart` tests for the new wording.

## Out of scope / future

- Backstage illustrated `EmptyState` for full-page empties.
- A focused accessibility pass (drawer focus management, etc.).
- Per-row explorer→detail links (needs an `entityRef` on `ExploreImage`).
