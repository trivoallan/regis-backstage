# Next-tier / promotion-path feature — grounding notes (deferred)

**Date:** 2026-06-04
**Status:** Deferred. These are the brainstorm conclusions, captured so the feature
starts grounded when picked up. No implementation done.

## Why this exists

The per-image detail view briefly had a "Path to next tier" feature (PR #19) that
derived "what blocks the next tier" from `rule.level === <tier name>`. That was a
**category error**: `level` is a **severity** (critical/high/medium/low), not a
tier (confirmed in the Regis docs, and fixed in the data in PR #24). The feature
was removed. This note records how to build a *correct* version.

## How Regis tiers actually work (per the docs)

From <https://trivoallan.github.io/regis/docs/concepts/playbooks>:

- A playbook defines tiers as an **ordered list of `{ name, condition }`**, where
  `condition` is a **JSON Logic** expression evaluated against report data.
- The earned tier is **first-match-wins**: the evaluator checks tiers in order and
  assigns the first whose condition is truthy.
- Tiers **do not group specific rules**. They evaluate **aggregate metrics** —
  canonically `rules_summary.score`. Rules are evaluated independently; their
  collective result feeds the score, and the score drives the tier.
- Canonical example:
  ```yaml
  spec:
    tiers:
      - { name: Gold,   condition: { ">": [{ var: rules_summary.score }, 90] } }
      - { name: Silver, condition: { ">": [{ var: rules_summary.score }, 70] } }
      - { name: Bronze, condition: { ">": [{ var: rules_summary.score }, 50] } }
  ```

So "what's needed for the next tier" = **make the next tier's condition true**. For
the canonical score condition, that is "reach score N".

## The blocker

Tier **conditions are not present anywhere in the catalog data today**:
- `app-config.yaml` `regis.playbooks[].tiers[]` → only `{ name, color }`.
- The published index `index.json` playbooks → only `{ name, color }`.
- The report → carries the **earned** tier + `rules_summary.score` + rule results,
  but **not** the tier conditions.

Therefore a correct next-tier feature is **multi-layer** (data model + demo-data
generator + backend wiring + frontend), not a frontend-only change.

## Recommended approach (option 1 from the brainstorm)

1. **Data model:** extend tier definitions from `{ name, color }` to
   `{ name, color, condition }` (the JSON Logic), in both the published index and
   the `regis.playbooks` config fallback. The demo generator
   (`examples/regis-dataset.cjs`) emits the demo conditions (score thresholds that
   match its existing score bands).
2. **Transport:** carry the `condition` through the existing `GET /playbooks`
   response — add an optional `condition?: unknown` to the ladder tier shape
   (`TrendBand` / `PlaybookLadder.tiers`). No new route.
3. **Evaluation (frontend):** with a small JSON Logic library (e.g. `json-logic-js`),
   evaluate the **next tier's** condition (the next better tier in the ladder)
   against the image's report:
   - If the condition is a recognizable score comparison
     (`{ ">": [{ var: "rules_summary.score" }, N] }` and friends), render a friendly
     gap: "Reach score N (+K)".
   - Otherwise, evaluate truthiness and render "Next-tier condition not yet met"
     with a readable form of the condition. Degrade gracefully.
4. **UI:** a small "Path to <next tier>" card on the detail view (and optionally a
   hint on the scorecard), shown only when a next tier and its condition exist.

Alternative considered: evaluate in the **backend** and return structured guidance
(centralized/testable, but a new/extended response and more moving parts). Pick
this if the evaluation grows beyond the score case.

## Open questions for the implementation session

- Does the **real** Regis report already echo per-tier conditions + met status
  anywhere in `playbooks[].pages…scorecards` (which carry `condition` + a met flag)?
  If so, option C (read it straight from the report) may beat re-carrying
  conditions in the index — confirm against a real report.
- Which JSON Logic shapes to special-case for a friendly numeric gap (`>`, `>=`,
  and the score `var`); everything else falls back to met/unmet.
- Top tier / unknown playbook / no condition → render nothing (same discipline as
  the rest of the redesign: never assert a tier claim the data can't support).
