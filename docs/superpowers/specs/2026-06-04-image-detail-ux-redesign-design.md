# Image detail UX redesign

**Date:** 2026-06-04
**Status:** Design — approved, pending implementation plan
**Scope:** Frontend only (`plugins/regis`). No backend or schema changes.

## Summary

Redesign the per-image detail experience in the Backstage catalog — the entity
overview cards and the **Regis** tab — so an image owner can answer three
questions at a glance: *how is my image doing*, *against what reference*, and
*what do I fix next*. Today the scorecard is bare (a chip, a number, a count)
and the Regis tab dumps every rule grouped by tag with no summary, no
prioritization, and no sense of the playbook that produced the verdict.

This redesign uses **only data the report already carries** (`badges`,
`rules[].level`, `rules[].status`, `rules_summary.by_tag`, `playbooks[]`, and the
playbook tier ladder already fetched via `getPlaybooks()`). It corresponds to
approach **B** from the brainstorm: a posture report plus an actionable
"path to the next tier" module.

## Goals

- **Actionability** — surface failing rules first, and tell the owner exactly
  which rules block the next tier.
- **Scanability** — a summary up top; failures and incomplete rules before
  passing ones; passing rules out of the way by default.
- **Context** — always show which **playbook** (and version) produced the
  report and what its tier ladder is; show per-category scores.
- **Polish** — a real posture card with visual hierarchy instead of stacked
  text.

## Non-goals

- No transitivity / lineage / CVE blast-radius on the image page. That is the
  documented differentiator but belongs in its own spec→plan cycle (approach C).
- No backend, router, schema, or report-shape changes.
- No changes to the portfolio explorer, intake/scaffolder, or history backend.

## Personas

Primary: the **Application Developer** who owns or consumes the image and wants
to know what to fix. Secondary: the **Platform Engineer** auditing posture. The
"path to next tier" framing serves the product direction's "paved road" posture.

## Available data (constraints)

From `Report` (`plugins/regis-common/src/types.ts`):

- `tier` — the earned tier name (playbook vocabulary, **not** a fixed enum).
- `badges[]` — `{ scope, value, class: success|warning|error|information, label }`
  per domain (security, hygiene, …). Drives the domain badge row.
- `rules[]` — `{ slug, description, level, tags[], passed, status:
  passed|failed|incomplete, message }`. `level` is the tier a rule is attached
  to; `status` has a third **incomplete** state we currently ignore.
- `rules_summary` — `{ score, total[], passed[], by_tag{ tag → { rules[],
  passed_rules[], score } } }`. Drives per-category bars.
- `playbooks[]` — `{ playbook_name, playbook_version, … }`. Drives attribution.
- `request` — `{ repository, tag, timestamp, … }`.
- `links[]` — optional custom links (remediation / full report).

The **tier ladder** (ordered tiers + JSON Logic conditions) comes from
`getPlaybooks()` / `unionLadder()`, already used by existing cards.

**Key correctness constraint:** tiers are defined by JSON Logic conditions
(first match wins), **not** necessarily a score threshold. The "distance to the
next tier" is therefore expressed as a **count of remaining required rules**
(derived from `rules[].level` vs ladder order), never as a points gap. The
posture gauge shows *next-tier rule satisfaction* (e.g. 3 of 6 Gold rules
passed), not progress toward a score threshold.

## Architecture

All work lives in `plugins/regis/src`. The derivation logic is isolated in a
pure, React-free module so it can be unit-tested independently; the UI is split
into small single-purpose components.

### Pure derivation module — `components/posture.ts`

No React, no API. Pure functions over `Report` + ladder, fully unit-tested:

- `nextTier(ladder, currentTier)` → next tier name, or `null` when already at
  the top (or ladder unknown).
- `blockingRules(rules, nextTierName)` → `failed`/`incomplete` rules whose
  `level === nextTierName`.
- `tierProgress(rules, nextTierName)` → `{ satisfied, required }` for the gauge.
- `countByStatus(rules)` → `{ passed, failed, incomplete }`.
- `categoryScores(rulesSummary)` → `by_tag` entries sorted worst-score-first.
- `sortRulesForTable(rules, categoryScores)` → failures and incompletes first,
  then by worst category, for the table's default order.

### Components

- **`RegisScorecardCard.tsx`** (overview, redesign) — the at-a-glance card:
  - Circular score gauge (the chosen "variant B"); the ring fills to *next-tier
    rule satisfaction*, the center shows `score`.
  - Tier chip (ladder color) + "N rules left for &lt;next tier&gt;" (or "Top
    tier — maintained" when `nextTier` is `null`).
  - Domain badge row from `report.badges`, colored by `class`.
  - `passed / failed / incomplete` counts.
  - Discreet "via &lt;playbook&gt;" footnote.

- **`RegisTabContent.tsx`** (restructured, slimmed) — orchestrates three
  extracted sub-components and owns data fetching:

  - **`PostureSummary.tsx`** — header card: `repository:tag`, tier chip, score,
    **playbook attribution** (linked name + version + tier ladder + scan date),
    and per-category bars from `categoryScores`.
  - **`NextTierPath.tsx`** — the "Path to &lt;next tier&gt;" callout listing
    `blockingRules` as a checklist (incomplete rules marked "to investigate").
    Renders the "top tier — maintained" state when `nextTier` is `null`; renders
    nothing when the ladder is unknown.
  - **`RuleTable.tsx`** — Backstage `Table` of all rules. Columns: status,
    rule (description), category, priority (`level`), message. Default sort from
    `sortRulesForTable` (failures-first, worst-category-first). Default view
    shows failures + incompletes with a toggle to show all (passing rules are
    out of the way by default). Relies on the `Table`'s built-in search/sort;
    custom status filter is minimal.

- **`format.ts`** — reused (`tierColor`, `unionLadder`); extended with a
  badge-class → color helper if needed.

### Playbook → entity link (open question for planning)

The attribution links the playbook name to its catalog entity. Resolving
`playbook_name` → a playbook `entityRef` depends on a naming convention or
annotation set by the Phase 2 entity provider. **To confirm during planning.**
If resolution is not reliable, fall back to plain (non-linked) text.

## Edge cases

- **Already at top tier** → no path callout; "Top tier — maintained" state; gauge
  shows full satisfaction.
- **No ladder / unknown playbook** (discovery fallback) → hide the path callout
  and the next-tier gauge marker; keep score, badges, and rules.
- **Required rule is `incomplete`** → listed in the path as "to investigate",
  visually distinct from a hard failure.
- **No `rules_summary.by_tag`** → hide the category bars; the table still renders.
- **Rule with no `level`** → bucketed as "other", excluded from path computation.
- **No `badges`** → omit the badge row.
- **Loading / error / empty report** → existing `Progress` / `ResponseErrorPanel`
  / empty-state patterns preserved on every component.

## Testing

Follows the repo's near-1:1 colocated TDD convention:

- `posture.test.ts` — exhaustive unit coverage of every derivation function and
  every edge case above (top tier, unknown ladder, missing `level`, missing
  `by_tag`, incomplete-as-blocking).
- `*.test.tsx` for each component — render states (loading / error / empty /
  nominal), the next-tier callout vs top-tier state, the table default
  ordering, and the playbook attribution (linked vs fallback text).

## Out of scope / future

- Approach **C**: lineage and CVE blast-radius on the image page (transitivity
  differentiator) — separate spec.
- Score-threshold detection for a richer points-based gap — deliberately
  deferred; the rule-count framing is correct in all ladder shapes.

## Correction (2026-06-04, post-implementation)

The "path to the next tier" feature described above was **removed** after
implementation because it rested on a false premise.

- A rule's `level` is a **severity** (`critical` / `warning` / `high`, per the
  [Regis rules docs](https://trivoallan.github.io/regis/docs/concepts/rules)),
  **not** a tier. Deriving "what blocks the next tier" from `rule.level === <tier>`
  is a category error; it only appeared to work because the demo dataset abuses
  `level` to hold tier names (Gold/Silver/Bronze).
- Tiers are decided by playbook **conditions (JSON Logic)**, which are not
  carried in the per-image report, so a correct "next tier" gap is **not
  derivable frontend-side**.

Removed: `NextTierPath`, the scorecard next-tier hint/gauge ratio, and
`posture.ts` `nextTier` / `blockingRules` / `tierProgress`. The scorecard gauge
now fills to the 0–100 score. Actionability is carried by the **RuleTable**
(failures-first), and its column is relabelled **Severity** (it shows
`rule.level`). A correct tier-progression view would require evaluating playbook
tier conditions server-side — tracked as a follow-up task.
